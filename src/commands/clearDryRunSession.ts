import * as vscode from "vscode";
import { MicrocksCommandContext } from "./commandContext";

export function registerClearDryRunSessionCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.clearDryRunSession", () => {
    context.provider.clearDryRunSession();
    context.testsProvider.clearDryRunSession();
  });
}
