import * as vscode from "vscode";
import {
  MicrocksCliReadinessError,
  TestCaseResult,
  TestResult,
  TestResultSummary,
} from "../../cli";
import { TestsDataSource } from "../../services";
import {
  TestActionNode,
  TestCaseResultNode,
  TestMessageNode,
  TestResultNode,
  TestStepResultNode,
  TestsRootNode,
  TestsTreeNode,
} from "./nodes";

interface ConnectedTests {
  dataSource?: TestsDataSource;
  error?: Error;
  cache: TestResultSummary[];
  readonly details: Map<string, TestResult>;
  readonly serviceIds: Set<string>;
  reachability?: ServerReachability;
}

interface DryRunTests {
  live: boolean;
  results: TestResult[];
}

type ServerReachability = "checking" | "reachable" | "unreachable";

export class TestsProvider implements vscode.TreeDataProvider<TestsTreeNode> {
  private readonly _onDidChange = new vscode.EventEmitter<
    TestsTreeNode | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private readonly connected: ConnectedTests = {
    cache: [],
    details: new Map<string, TestResult>(),
    serviceIds: new Set<string>(),
  };
  private serviceFilter?: string;
  private dryRun?: DryRunTests;

  setConnectedDataSource(dataSource?: TestsDataSource, error?: Error): void {
    this.connected.dataSource = dataSource;
    this.connected.error = error;
    this.connected.cache = [];
    this.connected.details.clear();
    this.connected.serviceIds.clear();
    this.connected.reachability = dataSource ? "checking" : undefined;
    this.refresh();
  }

  getKnownServiceIds(): string[] {
    const ids = new Set(this.connected.serviceIds);
    for (const result of this.dryRun?.results ?? []) {
      if (result.serviceId) {
        ids.add(result.serviceId);
      }
    }
    return [...ids].sort((left, right) => left.localeCompare(right));
  }

  getServiceFilter(): string | undefined {
    return this.serviceFilter;
  }

  setServiceFilter(serviceId?: string): void {
    this.serviceFilter = serviceId;
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
      const roots: TestsTreeNode[] = [
        connectedTestsRoot(
          this.connected.dataSource,
          this.connected.error,
          this.connected.reachability
        ),
      ];
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
      return this.testResultChildren(element);
    }

    if (element instanceof TestCaseResultNode) {
      return testCaseChildren(element.result);
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
      const tests = await this.connected.dataSource.listTests({
        serviceId: this.serviceFilter,
      });
      this.setConnectedReachability("reachable");
      this.connected.cache = tests;
      rememberServiceIds(this.connected.serviceIds, tests);
      if (tests.length === 0) {
        return this.withFilter([
          new TestMessageNode("No test runs on the selected server yet."),
        ]);
      }
      return this.withFilter(
        tests.map((result) => new TestResultNode(result, "connected"))
      );
    } catch (error) {
      this.setConnectedReachability("unreachable");
      if (error instanceof MicrocksCliReadinessError) {
        return cliRecoveryNodes(error);
      }
      if (this.connected.cache.length > 0) {
        return this.withFilter([
          new TestMessageNode(
            "Server unavailable - showing cached test runs.",
            (error as Error).message,
            "warning"
          ),
          ...this.connected.cache.map(
            (result) => new TestResultNode(result, "connected")
          ),
        ]);
      }
      return this.withFilter([
        new TestMessageNode(
          "Could not load test runs.",
          (error as Error).message,
          "warning"
        ),
      ]);
    }
  }

  private async testResultChildren(
    node: TestResultNode
  ): Promise<TestsTreeNode[]> {
    if (node.source === "dry-run") {
      return resultDetails(node.result);
    }
    if (!this.connected.dataSource) {
      return [new TestMessageNode("No selected server is available.", undefined, "warning")];
    }

    const cached = this.connected.details.get(node.result.id);
    if (cached) {
      return resultDetails(cached);
    }
    try {
      const detail = await this.connected.dataSource.getTest(node.result.id);
      this.connected.details.set(detail.id, detail);
      return resultDetails(detail);
    } catch (error) {
      return [
        new TestMessageNode(
          "Could not load this test result.",
          (error as Error).message,
          "warning"
        ),
      ];
    }
  }

  private setConnectedReachability(reachability: ServerReachability): void {
    if (this.connected.reachability === reachability) {
      return;
    }
    this.connected.reachability = reachability;
    this.refresh();
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
      return this.withFilter(children);
    }
    const visibleResults = this.serviceFilter
      ? this.dryRun.results.filter(
          (result) => result.serviceId === this.serviceFilter
        )
      : this.dryRun.results;
    const children: TestsTreeNode[] = visibleResults.map(
      (result) => new TestResultNode(result, "dry-run")
    );
    if (visibleResults.length === 0) {
      children.push(new TestMessageNode("No dry-run results match this filter."));
    }
    if (!this.dryRun.live) {
      children.push(...staleDryRunActions());
    }
    return this.withFilter(children);
  }

  private withFilter(children: TestsTreeNode[]): TestsTreeNode[] {
    if (!this.serviceFilter) {
      return children;
    }
    return [
      new TestMessageNode(`Filtered by ${this.serviceFilter}`, undefined, "filter"),
      ...children,
      new TestActionNode(
        "Clear Test Filter",
        "microcks.clearTestFilter",
        "clear-all",
        "Show test runs for every service"
      ),
    ];
  }
}

function connectedTestsRoot(
  dataSource: TestsDataSource | undefined,
  error: Error | undefined,
  reachability: ServerReachability | undefined
): TestsRootNode {
  if (dataSource) {
    return new TestsRootNode(
      "Selected Server",
      "connected",
      reachability ?? "checking"
    );
  }
  if (error instanceof MicrocksCliReadinessError) {
    return new TestsRootNode("Microcks CLI", "connected", error.reason);
  }
  if (error) {
    return new TestsRootNode("Selected Server", "connected", "unreachable");
  }
  return new TestsRootNode("Server Context", "connected", "not selected");
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
      "Sign In to Remote Server",
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
      "package",
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
      ...result.testCaseResults.map(
        (testCase) => new TestCaseResultNode(testCase)
      )
    );
  }
  return details;
}

function testCaseChildren(result: TestCaseResult): TestsTreeNode[] {
  if (!result.testStepResults || result.testStepResults.length === 0) {
    return [new TestMessageNode("No individual test steps were returned.")];
  }
  return result.testStepResults.map(
    (step, index) => new TestStepResultNode(step, index)
  );
}

function rememberServiceIds(
  serviceIds: Set<string>,
  results: TestResultSummary[]
): void {
  for (const result of results) {
    if (result.serviceId) {
      serviceIds.add(result.serviceId);
    }
  }
}
