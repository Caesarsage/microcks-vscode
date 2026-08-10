import * as vscode from "vscode";
import {
  buildBaseArgs,
  editorCapabilities,
  executeMicrocksCli,
  requireCliCapabilities,
} from "../cli";
import { MicrocksCommandContext } from "./commandContext";

interface AuthenticationItem extends vscode.QuickPickItem {
  readonly mode: "sso" | "none";
}

export function registerConnectRemoteServerCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  const output = vscode.window.createOutputChannel("Microcks Login");
  context.extensionContext.subscriptions.push(output);

  return vscode.commands.registerCommand(
    "microcks.connectRemoteServer",
    async () => {
      const serverUrl = await vscode.window.showInputBox({
        title: "Connect to Microcks (1/3)",
        prompt: "Microcks server URL",
        placeHolder: "https://microcks.example.com",
        validateInput: validateServerUrl,
      });
      if (!serverUrl) {
        return;
      }

      const normalizedServerUrl = serverUrl.replace(/\/+$/, "");
      const contextName = await vscode.window.showInputBox({
        title: "Connect to Microcks (2/3)",
        prompt: "Context name (optional)",
        placeHolder: "team-dev",
        validateInput: validateContextName,
      });
      if (contextName === undefined) {
        return;
      }

      const authentication = await vscode.window.showQuickPick<AuthenticationItem>(
        [
          {
            label: "$(globe) Browser SSO",
            description: "Sign in with your identity provider",
            mode: "sso",
          },
          {
            label: "$(unlock) No authentication",
            description: "For local or unsecured development servers",
            mode: "none",
          },
        ],
        {
          title: "Connect to Microcks (3/3)",
          placeHolder: "Choose an authentication method",
        }
      );
      if (!authentication) {
        return;
      }

      output.clear();
      output.show(true);
      try {
        const executable = context.cliCommand();
        await requireCliCapabilities(executable, [
          authentication.mode === "sso"
            ? editorCapabilities.authLoginSso
            : editorCapabilities.authLogin,
        ]);
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: authentication.mode === "sso"
              ? "Signing in to Microcks..."
              : "Connecting to Microcks...",
          },
          () => executeMicrocksCli({
            executable,
            args: [
              "login",
              normalizedServerUrl,
              ...(contextName.trim() ? ["--name", contextName.trim()] : []),
              ...(authentication.mode === "sso" ? ["--sso"] : []),
              ...buildBaseArgs(context.cliOptions()),
            ],
            onStdout: (text) => output.append(text),
            onStderr: (text) => output.append(text),
          })
        );
        await context.refresh();
        const selectedName = contextName.trim() || normalizedServerUrl;
        vscode.window.showInformationMessage(
          `Selected Microcks context "${selectedName}" for ${normalizedServerUrl}.`
        );
      } catch (error) {
        output.appendLine(`\n${(error as Error).message}`);
        const action = await vscode.window.showErrorMessage(
          "Could not connect through the Microcks CLI.",
          "Show Login Output",
          "Install or Update CLI",
          "Set CLI Path"
        );
        if (action === "Show Login Output") {
          output.show(true);
        } else if (action === "Install or Update CLI") {
          await vscode.commands.executeCommand("microcks.openCliInstallation");
        } else if (action === "Set CLI Path") {
          await vscode.commands.executeCommand("microcks.setCliPath");
        }
      }
    }
  );
}

function validateContextName(value: string): string | undefined {
  if (value.includes("\n") || value.includes("\r")) {
    return "Use a single-line context name.";
  }
  return undefined;
}

function validateServerUrl(value: string): string | undefined {
  if (!value.trim()) {
    return "Enter a Microcks server URL.";
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Use an http:// or https:// URL.";
    }
  } catch {
    return "Enter a valid URL.";
  }
  return undefined;
}
