import * as vscode from "vscode";
import {
  CliJsonCommandOptions,
  listContexts,
  MANAGED_CLI_STATE_KEY,
  resolveMicrocksCliPath,
} from "../cli";
import { defaultConfigPath } from "../config/configReader";
import {
  CliServicesDataSource,
  CliTestsDataSource,
  ServicesTarget,
} from "../services";
import { ServicesProvider } from "../views/services";
import { TestsProvider } from "../views/tests";

export interface MicrocksCommandContext {
  readonly extensionContext: vscode.ExtensionContext;
  readonly provider: ServicesProvider;
  readonly testsProvider: TestsProvider;
  readonly cliOptions: () => CliJsonCommandOptions;
  readonly buildServicesTarget: () => Promise<ServicesTarget | undefined>;
  readonly targetForUrl: (serverUrl: string) => ServicesTarget;
  readonly refresh: () => Promise<void>;
  readonly cliCommand: () => string;
}

export function createMicrocksCommandContext(
  extensionContext: vscode.ExtensionContext,
  provider: ServicesProvider,
  testsProvider: TestsProvider
): MicrocksCommandContext {
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.command = "microcks.switchContext";
  extensionContext.subscriptions.push(statusBar);

  const resolveCliCommand = (): string =>
    resolveMicrocksCliPath(
      undefined,
      extensionContext.globalState.get<string>(MANAGED_CLI_STATE_KEY)
    ).executable;

  const cliOptions = (): CliJsonCommandOptions => ({
    executable: resolveCliCommand(),
    configPath: defaultConfigPath(),
  });

  const targetForUrl = (serverUrl: string): ServicesTarget => ({
    serverUrl,
    dataSource: new CliServicesDataSource({
      ...cliOptions(),
      microcksUrl: serverUrl,
    }),
  });

  const buildServicesTarget = async (): Promise<ServicesTarget | undefined> => {
    const contexts = await listContexts(cliOptions());
    const current = contexts.find((context) => context.current);
    return current ? servicesTargetForContext(current.name, current.server) : undefined;
  };

  const servicesTargetForContext = (
    contextName: string,
    server: string
  ): ServicesTarget => ({
      serverUrl: server.replace(/\/+$/, ""),
      dataSource: new CliServicesDataSource({
        ...cliOptions(),
        contextName,
      }),
    });

  const refresh = async (): Promise<void> => {
    try {
      const contexts = await listContexts(cliOptions());
      const current = contexts.find((item) => item.current);
      const target = current
        ? servicesTargetForContext(current.name, current.server)
        : undefined;
      provider.setConnectedTarget(target);
      testsProvider.setConnectedDataSource(
        current
          ? new CliTestsDataSource({
              ...cliOptions(),
              contextName: current.name,
            })
          : undefined
      );
      if (current) {
        statusBar.text = `$(server) Microcks: ${current.name}`;
        statusBar.tooltip = `Connected to ${current.server}. Click to switch context.`;
        statusBar.show();
      } else {
        statusBar.hide();
      }
    } catch (error) {
      provider.setConnectedTarget(undefined, error as Error);
      testsProvider.setConnectedDataSource(undefined, error as Error);
      statusBar.hide();
    }
  };

  return {
    extensionContext,
    provider,
    testsProvider,
    cliOptions,
    buildServicesTarget,
    targetForUrl,
    refresh,
    cliCommand: resolveCliCommand,
  };
}

export function settingsTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}
