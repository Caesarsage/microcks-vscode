import * as vscode from "vscode";
import { listContexts, selectContext } from "../cli";
import { MicrocksCommandContext } from "./commandContext";

export function registerSwitchContextCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.switchContext", async () => {
    try {
      const contexts = await listContexts(context.cliOptions());
      const picked = await vscode.window.showQuickPick(
        contexts.map((item) => ({
          label: item.name,
          description: item.server,
          detail: item.current ? "Current context" : undefined,
        })),
        { placeHolder: "Pick a Microcks CLI context" }
      );
      if (!picked) {
        return;
      }
      await selectContext(context.cliOptions(), picked.label);
      await context.refresh();
      vscode.window.showInformationMessage(`Microcks context: ${picked.label}`);
    } catch (error) {
      vscode.window.showErrorMessage((error as Error).message);
    }
  });
}
