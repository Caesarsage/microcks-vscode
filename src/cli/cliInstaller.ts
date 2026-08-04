import { createHash } from "crypto";
import { execFile } from "child_process";
import { chmod, mkdir, readdir, rm, unlink, writeFile } from "fs/promises";
import * as path from "path";
import { promisify } from "util";
import * as vscode from "vscode";

const execFileAsync = promisify(execFile);
const LATEST_RELEASE_URL =
  "https://api.github.com/repos/microcks/microcks-cli/releases/latest";

interface ReleaseAsset {
  readonly name: string;
  readonly browser_download_url: string;
}

interface ReleaseDocument {
  readonly tag_name: string;
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly assets: ReleaseAsset[];
}

export interface ManagedCliInstallResult {
  readonly executable: string;
  readonly version: string;
  readonly verified: boolean;
}

export async function installLatestStableCli(
  storageUri: vscode.Uri,
  onProgress?: (message: string) => void
): Promise<ManagedCliInstallResult> {
  onProgress?.("Finding the latest stable Microcks CLI release...");
  const release = await fetchJson<ReleaseDocument>(LATEST_RELEASE_URL);
  if (release.draft || release.prerelease) {
    throw new Error("GitHub did not return a stable Microcks CLI release.");
  }

  const asset = selectArchive(release.assets, process.platform, process.arch);
  const checksumAsset = release.assets.find(
    (candidate) => candidate.name === "checksums.txt"
  );
  const installDirectory = path.join(
    storageUri.fsPath,
    "cli",
    release.tag_name.replace(/^v/, "")
  );
  const archivePath = path.join(storageUri.fsPath, asset.name);

  await mkdir(storageUri.fsPath, { recursive: true });
  await rm(installDirectory, { recursive: true, force: true });
  await mkdir(installDirectory, { recursive: true });

  onProgress?.(`Downloading ${asset.name}...`);
  const archive = await fetchBytes(asset.browser_download_url);
  await writeFile(archivePath, archive);

  let verified = false;
  if (checksumAsset) {
    onProgress?.("Verifying release checksum...");
    const checksums = await fetchText(checksumAsset.browser_download_url);
    verifyChecksum(asset.name, archive, checksums);
    verified = true;
  }

  onProgress?.("Installing the Microcks CLI...");
  try {
    await execFileAsync("tar", ["-xf", archivePath, "-C", installDirectory]);
  } catch (error) {
    throw new Error(
      `Could not extract ${asset.name}. Ensure the system tar command is available: ${(error as Error).message}`
    );
  } finally {
    await unlink(archivePath).catch(() => undefined);
  }

  const executableName = process.platform === "win32" ? "microcks.exe" : "microcks";
  const executable = await findFile(installDirectory, executableName);
  if (!executable) {
    throw new Error(`Release archive ${asset.name} did not contain ${executableName}.`);
  }
  if (process.platform !== "win32") {
    await chmod(executable, 0o755);
  }
  return { executable, version: release.tag_name, verified };
}

export function selectArchive(
  assets: readonly ReleaseAsset[],
  platform: NodeJS.Platform,
  architecture: string
): ReleaseAsset {
  const platformToken = platformTokens(platform);
  const architectureToken = architectureTokens(architecture, platform);
  const candidates = assets
    .filter((asset) => /\.(?:tar\.gz|zip)$/i.test(asset.name))
    .filter((asset) => !/sbom/i.test(asset.name))
    .map((asset) => {
      const name = asset.name.toLowerCase();
      const platformScore = platformToken.some((token) => name.includes(token)) ? 10 : 0;
      const architectureScore = architectureToken.some((token) => name.includes(token)) ? 5 : 0;
      return { asset, score: platformScore + architectureScore };
    })
    .filter((candidate) => candidate.score >= 15)
    .sort((left, right) => right.score - left.score);

  const selected = candidates[0]?.asset;
  if (!selected) {
    throw new Error(
      `No Microcks CLI release asset supports ${platform}/${architecture}.`
    );
  }
  return selected;
}

function platformTokens(platform: NodeJS.Platform): string[] {
  switch (platform) {
    case "darwin":
      return ["darwin"];
    case "linux":
      return ["linux"];
    case "win32":
      return ["windows"];
    default:
      throw new Error(`Managed Microcks CLI installation is not supported on ${platform}.`);
  }
}

function architectureTokens(architecture: string, platform: NodeJS.Platform): string[] {
  switch (architecture) {
    case "x64":
      return platform === "darwin" ? ["x86_64", "amd64", "all"] : ["x86_64", "amd64"];
    case "arm64":
      return platform === "darwin" ? ["arm64", "all"] : ["arm64"];
    default:
      throw new Error(
        `Managed Microcks CLI installation is not supported on ${architecture}.`
      );
  }
}

function verifyChecksum(
  assetName: string,
  bytes: Uint8Array,
  checksumDocument: string
): void {
  const expected = checksumDocument
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts.at(-1)?.replace(/^\*/, "") === assetName)?.[0];
  if (!expected) {
    throw new Error(`checksums.txt has no entry for ${assetName}.`);
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Checksum verification failed for ${assetName}.`);
  }
}

async function findFile(directory: string, name: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === name) {
      return candidate;
    }
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, name);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "microcks-vscode" },
  });
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}.`);
  }
  return response.text();
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { "User-Agent": "microcks-vscode" },
  });
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
