import * as vscode from "vscode";
import { ServicesProvider } from "../views/services";
import { TestsProvider } from "../views/tests";
import { createMicrocksCommandContext } from "./commandContext";
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

  extensionContext.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
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
