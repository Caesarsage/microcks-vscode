import * as vscode from "vscode";
import { MicrocksCommandContext, settingsTarget } from "./commandContext";

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

    await vscode.workspace
      .getConfiguration("microcks")
      .update("cliPath", executable, settingsTarget());
    context.refresh();
    vscode.window.showInformationMessage(`Microcks CLI path set to ${executable}`);
  });
}
