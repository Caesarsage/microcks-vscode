import * as vscode from "vscode";
import { TestCaseResult, TestResult } from "../../cli";
import {
  TestActionNode,
  TestCaseResultNode,
  TestMessageNode,
  TestResultNode,
  TestsRootNode,
  TestStepResultNode,
  TestsTreeNode,
} from "./nodes";

interface DryRunTests {
  live: boolean;
  results: TestResult[];
}

export class TestsProvider implements vscode.TreeDataProvider<TestsTreeNode> {
  private readonly _onDidChange = new vscode.EventEmitter<
    TestsTreeNode | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private serviceFilter?: string;
  private dryRun?: DryRunTests;

  getKnownServiceIds(): string[] {
    const ids = new Set<string>();
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
      if (!this.dryRun) {
        return idleNodes();
      }
      return [
        new TestsRootNode(
          "Dry-Run Session",
          this.dryRun.live ? "live" : "stopped"
        ),
      ];
    }

    if (element instanceof TestsRootNode) {
      return this.dryRunChildren();
    }

    if (element instanceof TestResultNode) {
      return resultDetails(element.result);
    }

    if (element instanceof TestCaseResultNode) {
      return testCaseChildren(element.result);
    }
    return [];
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
      (result) => new TestResultNode(result)
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

function idleNodes(): TestsTreeNode[] {
  return [
    new TestMessageNode(
      "No dry-run session yet.",
      "Dry-run results appear here while a dry-run runs against an API file."
    ),
    new TestActionNode(
      "Run Dry-Run for API File",
      "microcks.runDryRunForCurrentSpec",
      "beaker",
      "Run a local dry-run contract test"
    ),
  ];
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

function resultDetails(result: TestResult): TestsTreeNode[] {
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
  if (result.testCaseResults) {
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
