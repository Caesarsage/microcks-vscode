import * as vscode from "vscode";

export interface CliResolution {
  readonly executable: string;
  readonly source: "setting" | "managed" | "path";
}

export const MANAGED_CLI_STATE_KEY = "microcks.managedCliPath";

export function resolveMicrocksCliPath(
  configuration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
    "microcks"
  ),
  managedExecutable?: string
): CliResolution {
  const configured = configuration.get<string>("cliPath")?.trim();
  if (configured) {
    return {
      executable: configured,
      source: "setting",
    };
  }
  if (managedExecutable) {
    return {
      executable: managedExecutable,
      source: "managed",
    };
  }
  return {
    executable: "microcks",
    source: "path",
  };
}
