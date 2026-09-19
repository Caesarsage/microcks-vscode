import { createHash } from "crypto";
import { execFile } from "child_process";
import { chmod, mkdir, readdir, rm, unlink, writeFile } from "fs/promises";
import * as path from "path";
import { promisify } from "util";
import * as vscode from "vscode";

const execFileAsync = promisify(execFile);
const RELEASES_BASE = "https://github.com/microcks/microcks-cli/releases";

// Deliberately not api.github.com. Unauthenticated API calls are capped at 60
// per hour per IP, which anyone behind corporate NAT shares with their whole
// office, and the failure is an opaque 403. The plain releases/latest URL
// redirects to the newest stable tag with no quota and no token, and
// checksums.txt doubles as the asset inventory.
const LATEST_RELEASE_URL = `${RELEASES_BASE}/latest`;

interface ReleaseAsset {
  readonly name: string;
  readonly browser_download_url: string;
}

export interface ManagedCliInstallResult {
  readonly executable: string;
  readonly version: string;
}

export async function installLatestStableCli(
  storageUri: vscode.Uri,
  onProgress?: (message: string) => void
): Promise<ManagedCliInstallResult> {
  onProgress?.("Finding the latest stable Microcks CLI release...");
  const tag = await resolveLatestTag();

  onProgress?.("Reading release checksums...");
  const checksums = await fetchText(assetUrl(tag, "checksums.txt"));
  const assets = listAssets(tag, checksums);

  const asset = selectArchive(assets, process.platform, process.arch);
  const installDirectory = path.join(
    storageUri.fsPath,
    "cli",
    tag.replace(/^v/, "")
  );
  const archivePath = path.join(storageUri.fsPath, asset.name);

  await mkdir(storageUri.fsPath, { recursive: true });
  await rm(installDirectory, { recursive: true, force: true });
  await mkdir(installDirectory, { recursive: true });

  onProgress?.(`Downloading ${asset.name}...`);
  const archive = await fetchBytes(asset.browser_download_url);
  await writeFile(archivePath, archive);

  onProgress?.("Verifying release checksum...");
  verifyChecksum(asset.name, archive, checksums);

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
  return { executable, version: tag };
}

function assetUrl(tag: string, name: string): string {
  return `${RELEASES_BASE}/download/${encodeURIComponent(tag)}/${name}`;
}

async function resolveLatestTag(): Promise<string> {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: { "User-Agent": "microcks-vscode" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(
      `Could not reach ${LATEST_RELEASE_URL} (HTTP ${response.status}).`
    );
  }

  const tag = decodeURIComponent(new URL(response.url).pathname.split("/").pop() ?? "");
  if (!tag || tag === "latest") {
    throw new Error(
      `${LATEST_RELEASE_URL} did not redirect to a release tag (landed on ${response.url}).`
    );
  }
  return tag;
}

function listAssets(tag: string, checksumDocument: string): ReleaseAsset[] {
  const assets = checksumDocument
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map((parts) => parts.at(-1)!.replace(/^\*/, ""))
    .map((name) => ({ name, browser_download_url: assetUrl(tag, name) }));

  if (assets.length === 0) {
    throw new Error(`checksums.txt for ${tag} listed no release assets.`);
  }
  return assets;
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
