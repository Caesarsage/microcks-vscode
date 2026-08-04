import * as vscode from "vscode";
import { buildBaseArgs, executeMicrocksCli } from "../cli";
import { MicrocksCommandContext } from "./commandContext";

export function registerConnectRemoteServerCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "microcks.connectRemoteServer",
    async () => {
      const serverUrl = await vscode.window.showInputBox({
        title: "Connect to Microcks",
        prompt: "Microcks server URL",
        placeHolder: "https://microcks.example.com",
        validateInput: validateServerUrl,
      });
      if (!serverUrl) {
        return;
      }

      const output = vscode.window.createOutputChannel("Microcks Login");
      output.show(true);
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Connecting through Microcks CLI...",
          },
          () => executeMicrocksCli({
            executable: context.cliCommand(),
            args: [
              "login",
              serverUrl.replace(/\/+$/, ""),
              "--sso",
              ...buildBaseArgs(context.cliOptions()),
            ],
            onStdout: (text) => output.append(text),
            onStderr: (text) => output.append(text),
          })
        );
        await context.refresh();
        vscode.window.showInformationMessage(`Connected to ${serverUrl}`);
      } catch (error) {
        output.appendLine(`\n${(error as Error).message}`);
        vscode.window.showErrorMessage(
          "Could not connect through the Microcks CLI. See the Microcks Login output."
        );
      }
    }
  );
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
