import * as vscode from "vscode";
import { MicrocksCommandContext } from "./commandContext";
import { getActiveDryRunWatch } from "./dryRunWatchState";

export function registerStopDryRunWatchCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.stopDryRunWatch", async () => {
    const watch = getActiveDryRunWatch();
    if (!watch) {
      vscode.window.showInformationMessage("No Microcks dry-run watch is running.");
      return;
    }
    watch.provider.markDryRunStopped();
    watch.testsProvider.markDryRunStopped();
    watch.process.kill("SIGINT");
    watch.forceStopTimer = setTimeout(() => {
      if (getActiveDryRunWatch()?.process === watch.process) {
        watch.process.kill("SIGKILL");
      }
    }, 15_000);
    vscode.window.showInformationMessage("Stopping Microcks dry-run watch.");
  });
}
