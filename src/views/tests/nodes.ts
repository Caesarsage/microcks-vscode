import * as vscode from "vscode";
import { TestResult, TestResultSummary } from "../../cli";

export type TestsTreeNode =
  | TestsRootNode
  | TestResultNode
  | TestMessageNode
  | TestActionNode;

export class TestsRootNode extends vscode.TreeItem {
  constructor(
    label: string,
    readonly source: "connected" | "dry-run",
    description?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `tests-root-${source}`;
    this.iconPath = new vscode.ThemeIcon(
      source === "connected" ? "server" : "beaker"
    );
    this.description = description;
  }
}

export class TestResultNode extends vscode.TreeItem {
  constructor(
    readonly result: TestResultSummary | TestResult,
    readonly source: "connected" | "dry-run"
  ) {
    super(testLabel(result), vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = `test-result-${source}`;
    this.iconPath = new vscode.ThemeIcon(
      result.inProgress ? "sync~spin" : result.success ? "pass" : "error"
    );
    this.description = result.inProgress
      ? "running"
      : result.success
        ? "passed"
        : "failed";
    this.tooltip = testTooltip(result);
  }
}

export class TestMessageNode extends vscode.TreeItem {
  constructor(text: string, tooltip?: string, icon = "info") {
    super(text, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "test-message";
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip ?? text;
  }
}

export class TestActionNode extends vscode.TreeItem {
  constructor(
    text: string,
    command: string,
    icon: string,
    tooltip: string,
    args: unknown[] = []
  ) {
    super(text, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "test-action";
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip;
    this.command = {
      command,
      title: text,
      arguments: args,
    };
  }
}

function testLabel(result: TestResultSummary): string {
  if (result.serviceId) {
    return result.serviceId;
  }
  if (result.testNumber !== undefined) {
    return `Test #${result.testNumber}`;
  }
  return result.id;
}

function testTooltip(result: TestResultSummary): string {
  const details = [
    `Test: ${result.id}`,
    result.testedEndpoint ? `Endpoint: ${result.testedEndpoint}` : undefined,
    result.elapsedTime !== undefined ? `Duration: ${result.elapsedTime}ms` : undefined,
  ];
  return details.filter(Boolean).join("\n");
}
