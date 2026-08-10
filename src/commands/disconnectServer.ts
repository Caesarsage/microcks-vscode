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
        `Remove Microcks context "${current.name}"? This deletes its saved profile and authentication from the CLI config.`,
        { modal: true },
        "Remove Context"
      );
      if (confirmation !== "Remove Context") {
        return;
      }
      await deleteContext(context.cliOptions(), current.name);
      await context.refresh();
      vscode.window.showInformationMessage(`Removed context "${current.name}".`);
    } catch (error) {
      vscode.window.showErrorMessage((error as Error).message);
    }
  });
}
