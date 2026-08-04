import * as vscode from "vscode";
import { ServicesProvider } from "./services";
import { TestsProvider } from "./tests";

export interface MicrocksViews {
  servicesProvider: ServicesProvider;
  testsProvider: TestsProvider;
}

export function registerMicrocksViews(
  context: vscode.ExtensionContext
): MicrocksViews {
  const servicesProvider = new ServicesProvider();
  const testsProvider = new TestsProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("microcksServices", servicesProvider),
    vscode.window.registerTreeDataProvider("microcksTests", testsProvider)
  );

  return { servicesProvider, testsProvider };
}
