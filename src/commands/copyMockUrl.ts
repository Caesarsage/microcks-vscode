import * as vscode from "vscode";
import { MicrocksMockClient } from "../mocks";
import { OperationNode } from "../views/services";
import { MicrocksCommandContext } from "./commandContext";

export function registerCopyMockUrlCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "microcks.copyMockUrl",
    async (node: OperationNode) => {
      const target = node?.root.target;
      if (!target) {
        return;
      }
      const client = new MicrocksMockClient(target.serverUrl);
      const url = client.buildMockUrl(
        node.service.name,
        node.service.version,
        node.path
      );
      await vscode.env.clipboard.writeText(url);
      vscode.window.showInformationMessage(`Copied: ${url}`);
    }
  );
}
