import { defineConfig } from "@vscode/test-cli";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The restricted-workspace suite is not here: @vscode/test-electron appends
// --disable-workspace-trust to every launch it makes, so a second config would
// still get a trusted window. It runs from scripts/test-restricted.mjs, which
// launches VS Code with the same arguments minus that flag.
export default defineConfig({
  files: "out/test/*.test.js",
  version: "1.85.2",
  // The fixture's .vscode/settings.json tries to set microcks.cliPath.
  workspaceFolder: "./src/test/fixtures/workspace-cli-path",
  launchArgs: [
    "--disable-workspace-trust",
    // Kept short: a long --user-data-dir overruns the IPC socket path limit.
    `--user-data-dir=${join(tmpdir(), "mck-vsc-trusted")}`,
  ],
});
