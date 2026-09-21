import * as vscode from "vscode";
import {
  editorCapabilities,
  ensureWorkspaceTrusted,
  installLatestStableCli,
  MANAGED_CLI_STATE_KEY,
  requireCliCapabilities,
} from "../cli";
import { MicrocksCommandContext } from "./commandContext";

const MICROCKS_CLI_RELEASES_URL =
  "https://github.com/microcks/microcks-cli/releases/latest";

export function registerOpenCliInstallationCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "microcks.openCliInstallation",
    async () => {
      // Downloading, extracting and chmod +x'ing a binary is part of arming the
      // CLI, so it is gated on trust like every other CLI-backed action.
      if (!(await ensureWorkspaceTrusted("Installing the Microcks CLI"))) {
        return;
      }
      const confirmation = await vscode.window.showInformationMessage(
        "Download and install the latest stable Microcks CLI for this operating system?",
        { modal: true },
        "Install"
      );
      if (confirmation !== "Install") {
        return;
      }

      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Installing Microcks CLI",
          },
          (progress) =>
            installLatestStableCli(context.extensionContext.globalStorageUri, (message) =>
              progress.report({ message })
            )
        );
        await requireCliCapabilities(
          result.executable,
          Object.values(editorCapabilities)
        );
        await context.extensionContext.globalState.update(
          MANAGED_CLI_STATE_KEY,
          result.executable
        );
        await context.refresh();
        vscode.window.showInformationMessage(
          `Microcks CLI ${result.version} installed and checksum verified.`
        );
      } catch (error) {
        const choice = await vscode.window.showErrorMessage(
          `No compatible stable Microcks CLI could be selected: ${(error as Error).message}`,
          "Set CLI Path",
          "Open Releases"
        );
        if (choice === "Set CLI Path") {
          await vscode.commands.executeCommand("microcks.setCliPath");
        } else if (choice === "Open Releases") {
          await vscode.env.openExternal(
            vscode.Uri.parse(MICROCKS_CLI_RELEASES_URL)
          );
        }
      }
    }
  );
}
