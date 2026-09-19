import * as assert from "assert";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as vscode from "vscode";
import {
  assertWorkspaceTrusted,
  executeMicrocksCli,
  MicrocksWorkspaceTrustError,
} from "../../cli";
import { ServicesProvider } from "../../views/services";

/**
 * This suite runs in its own `.vscode-test.mjs` configuration, one that does
 * not pass `--disable-workspace-trust`. Nothing below means anything in a
 * trusted window, so the first test refuses to let the suite pass there.
 */
suite("Restricted workspace", () => {
  test("runs in a window that is actually restricted", () => {
    assert.equal(
      vscode.workspace.isTrusted,
      false,
      "This configuration must not trust the test workspace."
    );
  });

  test("activates in restricted mode and keeps its commands registered", async () => {
    const extension = vscode.extensions.getExtension("microcks.microcks-vscode");
    assert.ok(extension, "Microcks extension should be available in the extension host.");

    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("microcks.runDryRunForCurrentSpec"));
    assert.ok(commands.includes("microcks.openCliInstallation"));
  });

  test("refuses to run the CLI while the workspace is restricted", () => {
    assert.throws(
      () => assertWorkspaceTrusted(),
      (error: unknown) => error instanceof MicrocksWorkspaceTrustError
    );
  });

  test("never spawns the process executeMicrocksCli was given", async () => {
    const directory = mkdtempSync(join(tmpdir(), "microcks-trust-"));
    const marker = join(directory, "spawned");
    try {
      // Runs this same Node binary, so the marker appears if anything spawns.
      await assert.rejects(
        executeMicrocksCli({
          executable: process.execPath,
          args: [
            "-e",
            `require("fs").writeFileSync(${JSON.stringify(marker)}, "spawned")`,
          ],
        }),
        (error: unknown) => error instanceof MicrocksWorkspaceTrustError
      );
      assert.equal(
        existsSync(marker),
        false,
        "The trust check must refuse before spawn, not after."
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("explains restricted mode in the Services view", async () => {
    const provider = new ServicesProvider();
    provider.setConnectedTarget(undefined, new MicrocksWorkspaceTrustError());

    const [root] = await provider.getChildren();
    assert.equal(root.description, "restricted mode");

    const children = await provider.getChildren(root);
    assert.ok(children.some((item) => item.label === "This folder is not trusted."));
    assert.ok(children.some((item) => item.label === "Manage Workspace Trust"));
  });
});
