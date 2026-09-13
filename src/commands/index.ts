import * as vscode from "vscode";
import { ServicesProvider } from "../views/services";
import { TestsProvider } from "../views/tests";
import {
  createMicrocksCommandContext,
  MicrocksCommandContext,
} from "./commandContext";
import { registerClearDryRunSessionCommand } from "./clearDryRunSession";
import { registerConnectRemoteServerCommand } from "./connectRemoteServer";
import { registerCopyMockUrlCommand } from "./copyMockUrl";
import { registerDisconnectServerCommand } from "./disconnectServer";
import {
  registerClearTestFilterCommand,
  registerFilterTestsCommand,
} from "./filterTests";
import { registerInvokeOperationCommand } from "./invokeOperation";
import { registerImportCurrentFileCommand } from "./importCurrentFile";
import { registerOpenInspectorCommand } from "./openInspector";
import { registerOpenCliInstallationCommand } from "./openCliInstallation";
import { registerOpenServiceCommand } from "./openService";
import { registerRefreshServicesCommand } from "./refreshServices";
import { registerRunDryRunForCurrentSpecCommand } from "./runDryRunForCurrentSpec";
import { registerSetCliPathCommand } from "./setCliPath";
import { registerSignOutContextCommand } from "./signOutContext";
import { registerStartLocalServerCommand } from "./startLocalServer";
import { registerStopDryRunWatchCommand } from "./stopDryRunWatch";
import { registerSwitchContextCommand } from "./switchContext";

export function registerMicrocksCommands(
  extensionContext: vscode.ExtensionContext,
  provider: ServicesProvider,
  testsProvider: TestsProvider
): void {
  const commandContext = createMicrocksCommandContext(
    extensionContext,
    provider,
    testsProvider
  );

  void commandContext.refresh();
  warnAboutIgnoredWorkspaceCliPath(commandContext);

  extensionContext.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      void commandContext.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("microcks.cliPath")) {
        return;
      }
      warnAboutIgnoredWorkspaceCliPath(commandContext);
      void commandContext.refresh();
    }),
    registerRefreshServicesCommand(commandContext),
    registerStartLocalServerCommand(commandContext),
    registerConnectRemoteServerCommand(commandContext),
    registerDisconnectServerCommand(commandContext),
    registerFilterTestsCommand(testsProvider),
    registerClearTestFilterCommand(testsProvider),
    registerStopDryRunWatchCommand(commandContext),
    registerClearDryRunSessionCommand(commandContext),
    registerRunDryRunForCurrentSpecCommand(commandContext),
    registerImportCurrentFileCommand(commandContext),
    registerSetCliPathCommand(commandContext),
    registerSignOutContextCommand(commandContext),
    registerSwitchContextCommand(commandContext),
    registerOpenServiceCommand(commandContext),
    registerInvokeOperationCommand(commandContext),
    registerCopyMockUrlCommand(commandContext),
    registerOpenInspectorCommand(commandContext),
    registerOpenCliInstallationCommand(commandContext)
  );
}

/**
 * A `cliPath` written by the open folder is never executed. Say so rather than
 * dropping it silently, which would hide both a misconfiguration and an attempt
 * to have the extension run an arbitrary binary.
 */
function warnAboutIgnoredWorkspaceCliPath(
  commandContext: MicrocksCommandContext
): void {
  const ignored = commandContext.cliResolution().ignoredWorkspaceValue;
  if (!ignored) {
    return;
  }
  void vscode.window
    .showWarningMessage(
      `This workspace asks Microcks to run "${ignored}". Workspace settings cannot choose the Microcks CLI executable, so it was ignored. Use "Microcks: Set CLI Path" to pick one yourself.`,
      "Set CLI Path"
    )
    .then((choice) => {
      if (choice === "Set CLI Path") {
        void vscode.commands.executeCommand("microcks.setCliPath");
      }
    });
}
