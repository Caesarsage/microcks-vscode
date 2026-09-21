/**
 * Runs the restricted-workspace suite in a window that is actually restricted.
 *
 * `vscode-test` cannot do this: @vscode/test-electron appends
 * `--disable-workspace-trust` to every launch, which makes
 * `workspace.isTrusted` true and every trust assertion vacuous. This launches
 * the same VS Code build with the same arguments, minus that flag, and points
 * it at the same fixture workspace.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";

const VSCODE_VERSION = "1.85.2";
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const executable = await downloadAndUnzipVSCode(VSCODE_VERSION);
// A fresh profile every run, so no earlier "Yes, I trust the authors" leaks in.
const userDataDir = mkdtempSync(join(tmpdir(), "mck-vsc-restricted-"));

const child = spawn(
  executable,
  [
    join(root, "src", "test", "fixtures", "workspace-cli-path"),
    "--no-sandbox",
    // Only the extension under development, as in the vscode-test runs.
    "--disable-extensions",
    "--disable-gpu-sandbox",
    "--disable-updates",
    "--skip-welcome",
    "--skip-release-notes",
    `--user-data-dir=${userDataDir}`,
    `--extensionDevelopmentPath=${root}`,
    `--extensionTestsPath=${join(root, "out", "test", "restricted", "index.js")}`,
  ],
  {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  }
);

child.on("error", (error) => {
  console.error(`Failed to start VS Code: ${error.message}`);
  cleanUp();
  process.exit(1);
});

child.on("close", (code, signal) => {
  cleanUp();
  process.exit(code ?? (signal ? 1 : 0));
});

function cleanUp() {
  rmSync(userDataDir, { recursive: true, force: true });
}
