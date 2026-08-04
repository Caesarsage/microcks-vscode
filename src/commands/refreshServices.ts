import * as vscode from "vscode";
import { MicrocksCommandContext } from "./commandContext";

export function registerRefreshServicesCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "microcks.refreshServices",
    context.refresh
  );
}
