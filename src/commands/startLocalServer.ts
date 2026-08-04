import * as vscode from "vscode";
import { startLocalInstance } from "../cli";
import { MicrocksCommandContext } from "./commandContext";

export function registerStartLocalServerCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.startLocalServer", async () => {
    const output = vscode.window.createOutputChannel("Microcks Local Server");
    output.clear();
    output.show(true);

    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Starting local Microcks...",
        },
        () => startLocalInstance(context.cliOptions(), (text) => output.append(text))
      );
      await context.refresh();
      vscode.window.showInformationMessage(
        `Connected to local Microcks at ${result.server}.`
      );
    } catch (error) {
      output.appendLine(`\n${(error as Error).message}`);
      vscode.window.showErrorMessage(
        "Microcks local server failed. See the Microcks Local Server output."
      );
    }
  });
}
