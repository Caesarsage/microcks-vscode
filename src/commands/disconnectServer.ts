import * as vscode from "vscode";
import { deleteContext, listContexts } from "../cli";
import { MicrocksCommandContext } from "./commandContext";

export function registerDisconnectServerCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.disconnectServer", async () => {
    try {
      const current = (await listContexts(context.cliOptions())).find(
        (item) => item.current
      );
      if (!current) {
        vscode.window.showInformationMessage("No Microcks CLI context is selected.");
        return;
      }
      const confirmation = await vscode.window.showWarningMessage(
        `Delete Microcks CLI context "${current.name}"?`,
        { modal: true },
        "Delete Context"
      );
      if (confirmation !== "Delete Context") {
        return;
      }
      await deleteContext(context.cliOptions(), current.name);
      await context.refresh();
      vscode.window.showInformationMessage(`Deleted context ${current.name}.`);
    } catch (error) {
      vscode.window.showErrorMessage((error as Error).message);
    }
  });
}
