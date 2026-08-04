import * as vscode from "vscode";
import { registerMicrocksCommands } from "./commands";
import { disposeActiveDryRunWatch } from "./commands/dryRunWatchState";
import { registerMicrocksViews } from "./views";

export function activate(context: vscode.ExtensionContext): void {
  const views = registerMicrocksViews(context);

  registerMicrocksCommands(
    context,
    views.servicesProvider,
    views.testsProvider
  );
}

export function deactivate(): void {
  disposeActiveDryRunWatch();
}
