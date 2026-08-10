import * as vscode from "vscode";
import { listContexts, logoutContext } from "../cli";
import { MicrocksCommandContext } from "./commandContext";

export function registerSignOutContextCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.signOutContext", async () => {
    try {
      const current = (await listContexts(context.cliOptions())).find(
        (item) => item.current
      );
      if (!current) {
        vscode.window.showInformationMessage(
          "No Microcks CLI context is selected."
        );
        return;
      }

      const confirmation = await vscode.window.showWarningMessage(
        `Sign out of Microcks context "${current.name}"? The saved context will remain available.`,
        { modal: true },
        "Sign Out"
      );
      if (confirmation !== "Sign Out") {
        return;
      }

      await logoutContext(context.cliOptions(), current.name);
      await context.refresh();
      vscode.window.showInformationMessage(
        `Signed out of context "${current.name}".`
      );
    } catch (error) {
      vscode.window.showErrorMessage((error as Error).message);
    }
  });
}
