import * as vscode from "vscode";
import {
  TestCaseResult,
  TestResult,
  TestResultSummary,
  TestStepResult,
} from "../../cli";

export type TestsTreeNode =
  | TestsRootNode
  | TestResultNode
  | TestCaseResultNode
  | TestStepResultNode
  | TestMessageNode
  | TestActionNode;

export class TestsRootNode extends vscode.TreeItem {
  constructor(label: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "tests-root-dry-run";
    this.iconPath = new vscode.ThemeIcon("beaker");
    this.description = description;
  }
}

export class TestResultNode extends vscode.TreeItem {
  constructor(readonly result: TestResult) {
    super(testLabel(result), vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = "test-result-dry-run";
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

export class TestCaseResultNode extends vscode.TreeItem {
  constructor(readonly result: TestCaseResult) {
    super(result.operationName, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = "test-case-result";
    this.iconPath = new vscode.ThemeIcon(result.success ? "pass" : "error");
    this.description = resultDescription(result.success, result.elapsedTime);
    this.tooltip = result.operationName;
  }
}

export class TestStepResultNode extends vscode.TreeItem {
  constructor(readonly result: TestStepResult, index: number) {
    const label =
      result.requestName || result.eventMessageName || `Step ${index + 1}`;
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "test-step-result";
    this.iconPath = new vscode.ThemeIcon(result.success ? "pass" : "error");
    this.description = resultDescription(result.success, result.elapsedTime);
    this.tooltip = result.message || label;
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
  if (result.serviceId && result.testNumber !== undefined) {
    return `${result.serviceId} · #${result.testNumber}`;
  }
  if (result.serviceId) {
    return result.serviceId;
  }
  if (result.testNumber !== undefined) {
    return `Test #${result.testNumber}`;
  }
  return result.id;
}

function resultDescription(success: boolean, elapsedTime?: number): string {
  const status = success ? "passed" : "failed";
  return elapsedTime === undefined ? status : `${status} · ${elapsedTime}ms`;
}

function testTooltip(result: TestResultSummary): string {
  const details = [
    `Test: ${result.id}`,
    result.testedEndpoint ? `Endpoint: ${result.testedEndpoint}` : undefined,
    result.elapsedTime !== undefined ? `Duration: ${result.elapsedTime}ms` : undefined,
  ];
  return details.filter(Boolean).join("\n");
}
