import * as vscode from "vscode";
import { MicrocksMockClient } from "../mocks";
import { MicrocksCommandContext } from "./commandContext";

export function registerOpenServiceCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.openService", async (node: unknown) => {
    const serviceNode = node as {
      service?: { id: string };
      root?: { live: boolean; target?: { serverUrl: string } };
    };
    const target = serviceNode.root?.target;
    if (!target || !serviceNode.root?.live || !serviceNode.service?.id) {
      return;
    }
    const client = new MicrocksMockClient(target.serverUrl);
    await vscode.env.openExternal(
      vscode.Uri.parse(client.serviceBrowserUrl(serviceNode.service.id))
    );
  });
}
