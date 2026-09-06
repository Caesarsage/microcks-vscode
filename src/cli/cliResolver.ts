import * as vscode from "vscode";

export interface CliResolution {
  readonly executable: string;
  readonly source: "setting" | "managed" | "path";
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
