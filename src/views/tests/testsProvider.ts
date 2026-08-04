import * as vscode from "vscode";
import {
  MicrocksCliReadinessError,
  TestResult,
  TestResultSummary,
} from "../../cli";
import { TestsDataSource } from "../../services";
import {
  TestActionNode,
  TestMessageNode,
  TestResultNode,
  TestsRootNode,
  TestsTreeNode,
} from "./nodes";

interface ConnectedTests {
  dataSource?: TestsDataSource;
  error?: Error;
  cache: TestResultSummary[];
}

interface DryRunTests {
  live: boolean;
  results: TestResult[];
}

export class TestsProvider implements vscode.TreeDataProvider<TestsTreeNode> {
  private readonly _onDidChange = new vscode.EventEmitter<
    TestsTreeNode | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private readonly connected: ConnectedTests = { cache: [] };
  private dryRun?: DryRunTests;

  setConnectedDataSource(dataSource?: TestsDataSource, error?: Error): void {
    this.connected.dataSource = dataSource;
    this.connected.error = error;
    this.refresh();
  }

  beginDryRunSession(): void {
    this.dryRun = { live: true, results: [] };
    this.refresh();
  }

  recordDryRunResult(result: TestResult): void {
    this.dryRun ??= { live: true, results: [] };
    const existing = this.dryRun.results.findIndex((item) => item.id === result.id);
    if (existing >= 0) {
      this.dryRun.results[existing] = result;
    } else {
      this.dryRun.results.unshift(result);
    }
    this.refresh();
  }

  markDryRunStopped(): void {
    if (this.dryRun) {
      this.dryRun.live = false;
      this.refresh();
    }
  }

  clearDryRunSession(): void {
    this.dryRun = undefined;
    this.refresh();
  }

  refresh(): void {
    this._onDidChange.fire(undefined);
  }

  getTreeItem(element: TestsTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TestsTreeNode): Promise<TestsTreeNode[]> {
    if (!element) {
      const roots: TestsTreeNode[] = [new TestsRootNode("Connected Server", "connected")];
      if (this.dryRun) {
        roots.push(
          new TestsRootNode(
            "Dry-Run Session",
            "dry-run",
            this.dryRun.live ? "live" : "stopped"
          )
        );
      }
      return roots;
    }

    if (element instanceof TestsRootNode) {
      return element.source === "connected"
        ? this.connectedChildren()
        : this.dryRunChildren();
    }

    if (element instanceof TestResultNode) {
      return resultDetails(element.result);
    }
    return [];
  }

  private async connectedChildren(): Promise<TestsTreeNode[]> {
    if (!this.connected.dataSource) {
      if (this.connected.error instanceof MicrocksCliReadinessError) {
        return cliRecoveryNodes(this.connected.error);
      }
      if (this.connected.error) {
        return [
          new TestMessageNode(
            "Could not load tests from the selected context.",
            this.connected.error.message,
            "warning"
          ),
          ...connectedActions(),
        ];
      }
      return [
        new TestMessageNode("No Microcks CLI context selected."),
        ...connectedActions(),
      ];
    }

    try {
      const tests = await this.connected.dataSource.listTests();
      this.connected.cache = tests;
      if (tests.length === 0) {
        return [new TestMessageNode("No test runs on the selected server yet.")];
      }
      return tests.map((result) => new TestResultNode(result, "connected"));
    } catch (error) {
      if (error instanceof MicrocksCliReadinessError) {
        return cliRecoveryNodes(error);
      }
      if (this.connected.cache.length > 0) {
        return [
          new TestMessageNode(
            "Server unavailable - showing cached test runs.",
            (error as Error).message,
            "warning"
          ),
          ...this.connected.cache.map(
            (result) => new TestResultNode(result, "connected")
          ),
        ];
      }
      return [
        new TestMessageNode(
          "Could not load test runs.",
          (error as Error).message,
          "warning"
        ),
      ];
    }
  }

  private dryRunChildren(): TestsTreeNode[] {
    if (!this.dryRun || this.dryRun.results.length === 0) {
      const children: TestsTreeNode[] = [
        new TestMessageNode(
          this.dryRun?.live
            ? "Waiting for the first dry-run result."
            : "The dry-run stopped before producing a result."
        ),
      ];
      if (this.dryRun && !this.dryRun.live) {
        children.push(...staleDryRunActions());
      }
      return children;
    }
    const children: TestsTreeNode[] = this.dryRun.results.map(
      (result) => new TestResultNode(result, "dry-run")
    );
    if (!this.dryRun.live) {
      children.push(...staleDryRunActions());
    }
    return children;
  }
}

function staleDryRunActions(): TestsTreeNode[] {
  return [
    new TestActionNode(
      "Start Watch Again",
      "microcks.runDryRunForCurrentSpec",
      "debug-restart",
      "Start a new dry-run watch session"
    ),
    new TestActionNode(
      "Clear Dry-Run Session",
      "microcks.clearDryRunSession",
      "clear-all",
      "Remove cached dry-run test results"
    ),
  ];
}

function connectedActions(): TestsTreeNode[] {
  return [
    new TestActionNode(
      "Run Dry-Run for API File",
      "microcks.runDryRunForCurrentSpec",
      "beaker",
      "Run a local dry-run contract test"
    ),
    new TestActionNode(
      "Connect to Remote Server",
      "microcks.connectRemoteServer",
      "plug",
      "Log in through the Microcks CLI"
    ),
  ];
}

function cliRecoveryNodes(error: MicrocksCliReadinessError): TestsTreeNode[] {
  return [
    new TestMessageNode(
      error.reason === "missing"
        ? "Microcks CLI is unavailable."
        : "Microcks CLI must be updated for editor integration.",
      error.message,
      "warning"
    ),
    new TestActionNode(
      error.reason === "missing" ? "Install Microcks CLI" : "Update Microcks CLI",
      "microcks.openCliInstallation",
      "cloud-download",
      "Install a compatible Microcks CLI"
    ),
  ];
}

function resultDetails(result: TestResultSummary | TestResult): TestsTreeNode[] {
  const status = result.inProgress ? "Running" : result.success ? "Passed" : "Failed";
  const details = [
    new TestMessageNode(`Status: ${status}`, undefined, result.success ? "pass" : "error"),
  ];
  if (result.testedEndpoint) {
    details.push(new TestMessageNode(`Endpoint: ${result.testedEndpoint}`));
  }
  if (result.elapsedTime !== undefined) {
    details.push(new TestMessageNode(`Duration: ${result.elapsedTime}ms`, undefined, "watch"));
  }
  if ("testCaseResults" in result && result.testCaseResults) {
    details.push(
      new TestMessageNode(
        `${result.testCaseResults.length} operation result(s)`,
        "Open the Microcks test result for complete operation details."
      )
    );
  }
  return details;
}
