import * as vscode from "vscode";
import { listContexts, selectContext } from "../cli";
import { MicrocksCommandContext } from "./commandContext";

interface ContextQuickPickItem extends vscode.QuickPickItem {
  readonly contextName?: string;
  readonly command?: string;
}

export function registerSwitchContextCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand("microcks.switchContext", async () => {
    try {
      const contexts = await listContexts(context.cliOptions());
      const current = contexts.find((item) => item.current);
      const items: ContextQuickPickItem[] = [];

      if (contexts.length > 0) {
        items.push({
          label: "Saved contexts",
          kind: vscode.QuickPickItemKind.Separator,
        });
        items.push(
          ...contexts.map((item) => ({
            label: item.current ? `$(check) ${item.name}` : item.name,
            description: item.current ? "Current" : undefined,
            detail: item.server,
            contextName: item.name,
          }))
        );
      }

      items.push(
        {
          label: "Actions",
          kind: vscode.QuickPickItemKind.Separator,
        },
        {
          label: "$(plug) Sign in to another server",
          detail: "Create and select a remote Microcks context",
          command: "microcks.connectRemoteServer",
        },
        {
          label: "$(run) Start local Microcks",
          detail: "Start a local instance and select its context",
          command: "microcks.startLocalServer",
        }
      );
      if (current) {
        items.push(
          {
            label: "$(sign-out) Sign out of current context",
            detail: `Remove authentication but keep ${current.name}`,
            command: "microcks.signOutContext",
          },
          {
            label: "$(trash) Remove current context",
            detail: `${current.name} · ${current.server}`,
            command: "microcks.disconnectServer",
          }
        );
      }

      const picked = await vscode.window.showQuickPick(items, {
        title: "Microcks Contexts",
        placeHolder: contexts.length > 0
          ? "Select a context or create a new one"
          : "Create your first Microcks context",
      });
      if (!picked) {
        return;
      }
      if (picked.command) {
        await vscode.commands.executeCommand(picked.command);
        return;
      }
      if (!picked.contextName || picked.contextName === current?.name) {
        return;
      }

      await selectContext(context.cliOptions(), picked.contextName);
      await context.refresh();
      vscode.window.showInformationMessage(
        `Selected Microcks context "${picked.contextName}".`
      );
    } catch (error) {
      const action = await vscode.window.showErrorMessage(
        (error as Error).message,
        "Install or Update CLI",
        "Set CLI Path"
      );
      if (action === "Install or Update CLI") {
        await vscode.commands.executeCommand("microcks.openCliInstallation");
      } else if (action === "Set CLI Path") {
        await vscode.commands.executeCommand("microcks.setCliPath");
      }
    }
  });
}
