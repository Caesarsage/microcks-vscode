import { defineConfig } from "@vscode/test-cli";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  files: "out/test/**/*.test.js",
  version: "1.85.2",
  launchArgs: [
    `--user-data-dir=${join(tmpdir(), "microcks-vscode-test-user-data")}`,
  ],
});
