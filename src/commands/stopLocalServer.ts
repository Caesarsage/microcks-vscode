import * as vscode from "vscode";
import { stopLocalInstance } from "../cli";
import { MicrocksCommandContext } from "./commandContext";

export function registerStopLocalServerCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.stopLocalServer", async () => {
    const output = vscode.window.createOutputChannel("Microcks Local Server");

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Stopping local Microcks...",
        },
        () => stopLocalInstance(context.cliOptions(), (text) => output.append(text))
      );
      await context.refresh();
      vscode.window.showInformationMessage("Local Microcks stopped.");
    } catch (error) {
      output.show(true);
      output.appendLine(`\n${(error as Error).message}`);
      vscode.window.showErrorMessage(
        `Could not stop the local Microcks: ${(error as Error).message}`
      );
    }
  });
}
