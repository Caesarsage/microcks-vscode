import * as vscode from "vscode";
import { importArtifact } from "../cli";
import { MicrocksCommandContext } from "./commandContext";

export function registerImportCurrentFileCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.importCurrentFile", async () => {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || document.isUntitled) {
      vscode.window.showErrorMessage(
        "Open a saved API specification or collection before importing it."
      );
      return;
    }
    if (document.isDirty && !(await document.save())) {
      return;
    }

    try {
      const results = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Importing API artifact into Microcks...",
        },
        () => importArtifact(context.cliOptions(), document.uri.fsPath)
      );
      await context.refresh();
      const imported = results[0];
      vscode.window.showInformationMessage(
        imported
          ? `Microcks ${imported.action} ${imported.id}.`
          : "Microcks import completed."
      );
    } catch (error) {
      const choice = await vscode.window.showErrorMessage(
        `Microcks import failed: ${(error as Error).message}`,
        "Set CLI Path",
        "Install or Update CLI"
      );
      if (choice === "Set CLI Path") {
        await vscode.commands.executeCommand("microcks.setCliPath");
      } else if (choice === "Install or Update CLI") {
        await vscode.commands.executeCommand("microcks.openCliInstallation");
      }
    }
  });
}
