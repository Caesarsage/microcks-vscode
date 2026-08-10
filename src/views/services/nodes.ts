import * as vscode from "vscode";
import { MicrocksOperation, MicrocksService } from "../../cli";
import { ServicesTarget } from "../../services";
import { parseRestOperationName } from "../../utils/operation";

export type ServicesTreeNode =
  | ConnectedServerRootNode
  | DryRunSessionRootNode
  | ServiceNode
  | OperationNode
  | MessageNode
  | ActionNode;

export interface ServiceRootContext {
  readonly kind: "connected" | "dry-run";
  readonly target?: ServicesTarget;
  readonly live: boolean;
}

export class ConnectedServerRootNode extends vscode.TreeItem {
  constructor(label: string, description?: string, icon = "server-environment") {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "connectedServerRoot";
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

export class DryRunSessionRootNode extends vscode.TreeItem {
  constructor(readonly live: boolean, readonly updatedAt?: number) {
    super(
      live ? "Dry-Run Session" : "Dry-Run Session (stale)",
      vscode.TreeItemCollapsibleState.Expanded
    );
    this.contextValue = live ? "dryRunSessionRoot" : "staleDryRunSessionRoot";
    this.description = live
      ? "running"
      : updatedAt
      ? `stopped ${formatAge(updatedAt)}`
      : "stopped";
    this.iconPath = new vscode.ThemeIcon(live ? "pulse" : "history");
  }
}

export class ServiceNode extends vscode.TreeItem {
  constructor(
    public readonly service: MicrocksService,
    public readonly root: ServiceRootContext
  ) {
    super(
      `${service.name} · ${service.version}`,
      vscode.TreeItemCollapsibleState.Collapsed
    );
    this.description = service.type;
    this.contextValue = root.live ? "service" : "staleService";
    this.iconPath = new vscode.ThemeIcon("symbol-interface");
    this.tooltip = `${service.type} — ${service.name} v${service.version}`;
  }
}

export class OperationNode extends vscode.TreeItem {
  readonly method: string;
  readonly path: string;
  readonly hasPathParams: boolean;
  readonly canInvoke: boolean;

  constructor(
    public readonly service: MicrocksService,
    public readonly operation: MicrocksOperation,
    public readonly root: ServiceRootContext
  ) {
    super(operation.name, vscode.TreeItemCollapsibleState.None);

    const parsed = parseRestOperationName(operation.name);
    this.method = parsed?.method ?? operation.method ?? "";
    this.path = parsed?.path ?? "";
    this.hasPathParams = parsed?.hasPathParams ?? false;
    this.canInvoke = root.live &&
      service.type === "REST" &&
      parsed !== null &&
      this.method === "GET" &&
      !this.hasPathParams;

    this.iconPath = new vscode.ThemeIcon(
      this.canInvoke ? "play-circle" : "symbol-method"
    );
    this.tooltip = this.canInvoke
      ? `Click to invoke the mock for ${operation.name}`
      : this.hasPathParams
      ? `${operation.name} - has path params, use 'Copy Mock URL' and edit`
      : operation.name;
    this.contextValue = root.live ? "operation" : "staleOperation";

    if (root.live) {
      this.command = {
        command: "microcks.invokeOperation",
        title: "Invoke mock",
        arguments: [this],
      };
    }
  }
}

function formatAge(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  return minutes < 1 ? "just now" : `${minutes}m ago`;
}

export class MessageNode extends vscode.TreeItem {
  constructor(text: string, tooltip?: string) {
    super(text, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "message";
    this.iconPath = new vscode.ThemeIcon("info");
    this.tooltip = tooltip ?? text;
  }
}

export class ActionNode extends vscode.TreeItem {
  constructor(
    text: string,
    command: string,
    icon: string,
    tooltip: string,
    args: unknown[] = []
  ) {
    super(text, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "action";
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip;
    this.command = {
      command,
      title: text,
      arguments: args,
    };
  }
}
