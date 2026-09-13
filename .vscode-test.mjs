import { defineConfig } from "@vscode/test-cli";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  files: "out/test/**/*.test.js",
  version: "1.85.2",
  // The fixture's .vscode/settings.json tries to set microcks.cliPath.
  workspaceFolder: "./src/test/fixtures/workspace-cli-path",
  launchArgs: [
    "--disable-workspace-trust",
    `--user-data-dir=${join(tmpdir(), "microcks-vscode-test-user-data")}`,
  ],
});
