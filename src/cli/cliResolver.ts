import * as vscode from "vscode";

export interface CliResolution {
  readonly executable: string;
  readonly source: "setting" | "managed" | "path";
  /** A workspace or folder `cliPath` that was found and deliberately not used. */
  readonly ignoredWorkspaceValue?: string;
}

export type ContainerDriver = "auto" | "docker" | "podman";

export function resolveContainerDriver(
  configuration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
    "microcks"
  )
): ContainerDriver {
  const configured = configuration.get<string>("containerDriver")?.trim();
  return configured === "docker" || configured === "podman" ? configured : "auto";
}

// "auto" leaves the choice to the CLI: it auto-detects for dry-run tests and
// falls back to docker for `microcks start`.
export function containerDriverArgs(driver: ContainerDriver): string[] {
  return driver === "auto" ? [] : ["--driver", driver];
}

export const MANAGED_CLI_STATE_KEY = "microcks.managedCliPath";

interface ConfiguredCliPath {
  readonly value?: string;
  readonly ignoredWorkspaceValue?: string;
}

/**
 * Reads `microcks.cliPath` from user (or remote user) settings only. The
 * setting is `machine` scoped, so VS Code already drops values written by a
 * repository's `.vscode/settings.json`; this keeps the same guarantee inside
 * the extension, whatever the host merges.
 */
export function readConfiguredCliPath(
  configuration: vscode.WorkspaceConfiguration
): ConfiguredCliPath {
  const inspected = configuration.inspect<string>("cliPath");
  if (!inspected) {
    // No inspection available: `get` still honours the `machine` scope.
    return { value: normalize(configuration.get<string>("cliPath")) };
  }
  return {
    value: normalize(inspected.globalValue ?? inspected.defaultValue),
    ignoredWorkspaceValue: normalize(
      inspected.workspaceFolderValue ??
        inspected.workspaceValue ??
        inspected.workspaceFolderLanguageValue ??
        inspected.workspaceLanguageValue
    ),
  };
}

export function resolveMicrocksCliPath(
  configuration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
    "microcks"
  ),
  managedExecutable?: string
): CliResolution {
  const configured = readConfiguredCliPath(configuration);
  if (configured.value) {
    return {
      executable: configured.value,
      source: "setting",
      ignoredWorkspaceValue: configured.ignoredWorkspaceValue,
    };
  }
  if (managedExecutable) {
    return {
      executable: managedExecutable,
      source: "managed",
      ignoredWorkspaceValue: configured.ignoredWorkspaceValue,
    };
  }
  return {
    executable: "microcks",
    source: "path",
    ignoredWorkspaceValue: configured.ignoredWorkspaceValue,
  };
}

function normalize(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
