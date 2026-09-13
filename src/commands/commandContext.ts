import * as vscode from "vscode";
import {
  CliJsonCommandOptions,
  CliResolution,
  isWorkspaceTrusted,
  listContexts,
  MANAGED_CLI_STATE_KEY,
  MicrocksWorkspaceTrustError,
  resolveMicrocksCliPath,
} from "../cli";
import { defaultConfigPath } from "../config/configReader";
import { CliServicesDataSource, ServicesTarget } from "../services";
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
  readonly cliResolution: () => CliResolution;
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

  const resolveCli = (): CliResolution =>
    resolveMicrocksCliPath(
      undefined,
      extensionContext.globalState.get<string>(MANAGED_CLI_STATE_KEY)
    );

  const resolveCliCommand = (): string => resolveCli().executable;

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
    if (!isWorkspaceTrusted()) {
      const restricted = new MicrocksWorkspaceTrustError();
      provider.setConnectedTarget(undefined, restricted);
      statusBar.hide();
      return;
    }
    try {
      const contexts = await listContexts(cliOptions());
      const current = contexts.find((item) => item.current);
      const target = current
        ? servicesTargetForContext(current.name, current.server)
        : undefined;
      provider.setConnectedTarget(target);
      if (current) {
        statusBar.text = `$(server) Microcks: ${current.name}`;
        statusBar.tooltip =
          `Selected context for ${current.server}. Click to switch context.`;
        statusBar.show();
      } else {
        statusBar.hide();
      }
    } catch (error) {
      provider.setConnectedTarget(undefined, error as Error);
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
    cliResolution: resolveCli,
  };
}
