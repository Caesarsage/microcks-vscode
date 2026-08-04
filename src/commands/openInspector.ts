import * as vscode from "vscode";
import { MicrocksMockClient } from "../mocks";
import { OperationNode } from "../views/services";
import { InspectorPanel } from "../webviews/inspectorPanel";
import { MicrocksCommandContext } from "./commandContext";

export function registerOpenInspectorCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "microcks.openInspector",
    async (node: OperationNode) => {
      const target = node?.root.target;
      if (!target || !node.root.live) {
        vscode.window.showWarningMessage(
          "Microcks: no active context. Configure one and try again."
        );
        return;
      }
      if (!node.path) {
        vscode.window.showWarningMessage(
          `Microcks Inspector: can't parse operation "${node.operation.name}" - only REST operations supported in this preview.`
        );
        return;
      }
      await InspectorPanel.show(
        new MicrocksMockClient(target.serverUrl),
        target.dataSource,
        node.service,
        node.operation,
        node.method,
        node.path
      );
    }
  );
}
