import * as vscode from "vscode";
import { MicrocksCommandContext } from "./commandContext";

export function registerSetCliPathCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.setCliPath", async () => {
    const picked = await vscode.window.showOpenDialog({
      title: "Select Microcks CLI executable",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
    });
    const executable = picked?.[0]?.fsPath;
    if (!executable) {
      return;
    }

    // machine scoped: it can only be written to user (or remote user) settings.
    await vscode.workspace
      .getConfiguration("microcks")
      .update("cliPath", executable, vscode.ConfigurationTarget.Global);
    context.refresh();
    vscode.window.showInformationMessage(
      `Microcks CLI path set to ${executable} in your user settings.`
    );
  });
}
