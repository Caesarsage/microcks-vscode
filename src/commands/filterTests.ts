import * as vscode from "vscode";
import { TestsProvider } from "../views/tests";

interface TestFilterItem extends vscode.QuickPickItem {
  readonly serviceId?: string;
}

export function registerFilterTestsCommand(
  provider: TestsProvider
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.filterTests", async () => {
    const serviceIds = provider.getKnownServiceIds();
    if (serviceIds.length === 0) {
      const action = await vscode.window.showInformationMessage(
        "No services are available from the loaded test runs.",
        "Refresh Tests"
      );
      if (action === "Refresh Tests") {
        await vscode.commands.executeCommand("microcks.refreshTests");
      }
      return;
    }

    const current = provider.getServiceFilter();
    const items: TestFilterItem[] = serviceIds.map((serviceId) => ({
      label: serviceId,
      description: serviceId === current ? "Current filter" : undefined,
      serviceId,
    }));
    if (current) {
      items.unshift({
        label: "$(clear-all) Show all services",
        description: "Clear current filter",
      });
    }

    const picked = await vscode.window.showQuickPick(items, {
      title: "Filter Microcks Tests",
      placeHolder: "Choose a service",
    });
    if (!picked) {
      return;
    }
    provider.setServiceFilter(picked.serviceId);
  });
}

export function registerClearTestFilterCommand(
  provider: TestsProvider
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.clearTestFilter", () => {
    provider.setServiceFilter();
  });
}
