import * as vscode from "vscode";
import { MicrocksMockClient } from "../mocks";
import { prettyJsonOrRaw } from "../utils/json";
import { OperationNode } from "../views/services";
import { MicrocksCommandContext } from "./commandContext";

export function registerInvokeOperationCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "microcks.invokeOperation",
    async (node: OperationNode) => {
      const target = node?.root.target;
      if (!target || !node.root.live) {
        return;
      }
      const client = new MicrocksMockClient(target.serverUrl);

      const url = client.buildMockUrl(
        node.service.name,
        node.service.version,
        node.path
      );

      if (!node.canInvoke) {
        const action = await vscode.window.showInformationMessage(
          `${node.method} ${node.path} - mock URL ready (path params or non-GET, not auto-invoked)`,
          "Copy URL",
          "Cancel"
        );
        if (action === "Copy URL") {
          await vscode.env.clipboard.writeText(url);
          vscode.window.showInformationMessage("Mock URL copied to clipboard.");
        }
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Invoking ${node.method} ${node.path}...`,
        },
        async () => {
          try {
            const result = await client.invoke(url, node.method);
            const language = result.contentType.includes("json")
              ? "json"
              : result.contentType.includes("xml")
              ? "xml"
              : "plaintext";
            const body =
              language === "json" ? prettyJsonOrRaw(result.body) : result.body;
            const header = `// ${node.method} ${url}\n// -> HTTP ${result.status} (${result.contentType})\n\n`;
            const doc = await vscode.workspace.openTextDocument({
              language,
              content: language === "json" ? body : header + body,
            });
            await vscode.window.showTextDocument(doc, { preview: false });
          } catch (err) {
            vscode.window.showErrorMessage((err as Error).message);
          }
        }
      );
    }
  );
}
