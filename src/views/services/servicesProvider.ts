import * as vscode from "vscode";
import {
  MicrocksCliReadinessError,
  MicrocksService,
  ServiceDetail,
} from "../../cli";
import { ServicesTarget } from "../../services";
import {
  ActionNode,
  ConnectedServerRootNode,
  DryRunSessionRootNode,
  MessageNode,
  OperationNode,
  ServiceNode,
  ServiceRootContext,
  ServicesTreeNode,
} from "./nodes";

interface ServicesCache {
  services: MicrocksService[];
  readonly details: Map<string, ServiceDetail>;
  updatedAt?: number;
}

interface DryRunSession {
  target?: ServicesTarget;
  live: boolean;
  readonly cache: ServicesCache;
}

type ServerReachability = "checking" | "reachable" | "unreachable";

export class ServicesProvider implements vscode.TreeDataProvider<ServicesTreeNode> {
  private readonly _onDidChange = new vscode.EventEmitter<
    ServicesTreeNode | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private connectedTarget?: ServicesTarget;
  private connectedError?: Error;
  private connectedReachability?: ServerReachability;
  private readonly connectedCache = createCache();
  private dryRun?: DryRunSession;

  setConnectedTarget(target: ServicesTarget | undefined, error?: Error): void {
    this.connectedTarget = target;
    this.connectedError = error;
    this.connectedCache.services = [];
    this.connectedCache.details.clear();
    this.connectedCache.updatedAt = undefined;
    this.connectedReachability = target ? "checking" : undefined;
    this._onDidChange.fire(undefined);
  }

  getConnectedTarget(): ServicesTarget | undefined {
    return this.connectedTarget;
  }

  beginDryRunSession(): void {
    this.dryRun = { live: true, cache: createCache() };
    this._onDidChange.fire(undefined);
  }

  attachDryRunTarget(target: ServicesTarget): void {
    this.dryRun ??= { live: true, cache: createCache() };
    this.dryRun.target = target;
    this.dryRun.live = true;
    this._onDidChange.fire(undefined);
  }

  markDryRunStopped(): void {
    if (!this.dryRun) {
      return;
    }
    this.dryRun.live = false;
    this.dryRun.cache.updatedAt = Date.now();
    this._onDidChange.fire(undefined);
  }

  clearDryRunSession(): void {
    this.dryRun = undefined;
    this._onDidChange.fire(undefined);
  }

  refresh(): void {
    this._onDidChange.fire(undefined);
  }

  getTreeItem(element: ServicesTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ServicesTreeNode): Promise<ServicesTreeNode[]> {
    if (!element) {
      const roots: ServicesTreeNode[] = [
        connectedRootNode(
          this.connectedTarget,
          this.connectedError,
          this.connectedReachability
        ),
      ];
      if (this.dryRun) {
        roots.push(
          new DryRunSessionRootNode(
            this.dryRun.live,
            this.dryRun.cache.updatedAt
          )
        );
      }
      return roots;
    }

    if (element instanceof ConnectedServerRootNode) {
      if (!this.connectedTarget) {
        if (this.connectedError instanceof MicrocksCliReadinessError) {
          return cliRecoveryNodes(this.connectedError);
        }
        if (this.connectedError) {
          return serverRecoveryNodes(this.connectedError);
        }
        return disconnectedActions();
      }
      return this.loadServices(
        this.connectedTarget,
        this.connectedCache,
        { kind: "connected", target: this.connectedTarget, live: true }
      );
    }

    if (element instanceof DryRunSessionRootNode && this.dryRun) {
      if (!this.dryRun.target) {
        return [
          new MessageNode("Dry-run Microcks is starting."),
          new ActionNode(
            "Stop Dry-Run Watch",
            "microcks.stopDryRunWatch",
            "debug-stop",
            "Stop the active dry-run watch session"
          ),
        ];
      }
      const root: ServiceRootContext = {
        kind: "dry-run",
        target: this.dryRun.target,
        live: this.dryRun.live,
      };
      if (this.dryRun.live) {
        return this.loadServices(this.dryRun.target, this.dryRun.cache, root);
      }
      return staleDryRunChildren(this.dryRun.cache, root);
    }

    if (element instanceof ServiceNode) {
      return this.loadOperations(element);
    }
    return [];
  }

  private async loadServices(
    target: ServicesTarget,
    cache: ServicesCache,
    root: ServiceRootContext
  ): Promise<ServicesTreeNode[]> {
    try {
      const services = await target.dataSource.listServices();
      if (root.kind === "connected") {
        this.setConnectedReachability("reachable");
      }
      cache.services = services;
      cache.updatedAt = Date.now();
      if (services.length === 0) {
        return [new MessageNode("No services on the server yet.")];
      }
      return services.map((service) => new ServiceNode(service, root));
    } catch (error) {
      if (root.kind === "connected") {
        this.setConnectedReachability("unreachable");
      }
      if (error instanceof MicrocksCliReadinessError) {
        return cliRecoveryNodes(error);
      }
      if (cache.services.length > 0) {
        return [
          new MessageNode(
            `Server unreachable - showing cached services from ${formatAge(cache.updatedAt)}.`,
            (error as Error).message
          ),
          ...cache.services.map(
            (service) => new ServiceNode(service, { ...root, live: false })
          ),
        ];
      }
      return serverRecoveryNodes(error as Error);
    }
  }

  private async loadOperations(element: ServiceNode): Promise<ServicesTreeNode[]> {
    const cache = element.root.kind === "dry-run"
      ? this.dryRun?.cache
      : this.connectedCache;
    let detail = cache?.details.get(element.service.id);
    let operations = detail?.service.operations ?? element.service.operations ?? [];

    if (operations.length === 0 && element.root.live && element.root.target) {
      try {
        detail = await element.root.target.dataSource.getServiceDetail(
          element.service.id
        );
        cache?.details.set(element.service.id, detail);
        operations = detail.service.operations ?? [];
        element.service.operations = operations;
      } catch (error) {
        if (error instanceof MicrocksCliReadinessError) {
          return cliRecoveryNodes(error);
        }
        return [
          new MessageNode(
            "Could not load service operations.",
            (error as Error).message
          ),
        ];
      }
    }
    if (operations.length === 0) {
      return [new MessageNode("No cached operations for this service.")];
    }
    return operations.map(
      (operation) => new OperationNode(element.service, operation, element.root)
    );
  }

  private setConnectedReachability(reachability: ServerReachability): void {
    if (this.connectedReachability === reachability) {
      return;
    }
    this.connectedReachability = reachability;
    this._onDidChange.fire(undefined);
  }
}

function createCache(): ServicesCache {
  return { services: [], details: new Map<string, ServiceDetail>() };
}

function connectedRootNode(
  target: ServicesTarget | undefined,
  error: Error | undefined,
  reachability: ServerReachability | undefined
): ConnectedServerRootNode {
  if (target) {
    const status = reachability ?? "checking";
    return new ConnectedServerRootNode(
      "Selected Server",
      status,
      status === "unreachable" ? "warning" : "server-environment"
    );
  }
  if (error instanceof MicrocksCliReadinessError) {
    return new ConnectedServerRootNode("Microcks CLI", error.reason, "terminal");
  }
  if (error) {
    return new ConnectedServerRootNode("Selected Server", "unreachable", "warning");
  }
  return new ConnectedServerRootNode("Server Context", "not selected", "server");
}

function disconnectedActions(): ServicesTreeNode[] {
  return [
    new MessageNode("No Microcks CLI context selected."),
    new ActionNode(
      "Start Local Microcks",
      "microcks.startLocalServer",
      "run",
      "Start and select a local Microcks context"
    ),
    new ActionNode(
      "Sign In to Remote Server",
      "microcks.connectRemoteServer",
      "plug",
      "Log in and select a remote Microcks context"
    ),
    new ActionNode(
      "Run Dry-Run for API File",
      "microcks.runDryRunForCurrentSpec",
      "beaker",
      "Run a local dry-run contract test for an API spec or collection"
    ),
  ];
}

function staleDryRunChildren(
  cache: ServicesCache,
  root: ServiceRootContext
): ServicesTreeNode[] {
  const children: ServicesTreeNode[] = [
    new MessageNode(
      `Session stopped - cached ${formatAge(cache.updatedAt)}. Live actions are disabled.`
    ),
  ];
  children.push(
    ...cache.services.map((service) => new ServiceNode(service, root)),
    new ActionNode(
      "Start Watch Again",
      "microcks.runDryRunForCurrentSpec",
      "debug-restart",
      "Start a new dry-run watch session"
    ),
    new ActionNode(
      "Clear Dry-Run Session",
      "microcks.clearDryRunSession",
      "clear-all",
      "Remove cached dry-run session data"
    )
  );
  return children;
}

function serverRecoveryNodes(error: Error): ServicesTreeNode[] {
  return [
    new MessageNode("Microcks server is not reachable.", error.message),
    new ActionNode(
      "Switch Context",
      "microcks.switchContext",
      "server",
      "Select another Microcks CLI context"
    ),
    new ActionNode(
      "Sign In to Remote Server",
      "microcks.connectRemoteServer",
      "plug",
      "Log in to another Microcks server"
    ),
    new ActionNode(
      "Run Dry-Run for API File",
      "microcks.runDryRunForCurrentSpec",
      "beaker",
      "Run without relying on a long-running Microcks server"
    ),
  ];
}

function cliRecoveryNodes(error: MicrocksCliReadinessError): ServicesTreeNode[] {
  const message = error.reason === "missing"
    ? "Microcks CLI is unavailable. Install it or configure its path."
    : "Microcks CLI must be updated for editor integration.";
  return [
    new MessageNode(message, error.message),
    new ActionNode(
      error.reason === "missing" ? "Install Microcks CLI" : "Update Microcks CLI",
      "microcks.openCliInstallation",
      "package",
      "Install a compatible Microcks CLI"
    ),
    new ActionNode(
      "Set Microcks CLI Path",
      "microcks.setCliPath",
      "terminal",
      "Choose the Microcks CLI executable"
    ),
    new ActionNode(
      "Open Microcks Settings",
      "workbench.action.openSettings",
      "settings-gear",
      "Open VS Code settings for Microcks",
      ["microcks"]
    ),
  ];
}

function formatAge(timestamp?: number): string {
  if (!timestamp) {
    return "earlier";
  }
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  return minutes < 1 ? "just now" : `${minutes}m ago`;
}
