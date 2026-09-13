import * as vscode from "vscode";

export const UNTRUSTED_WORKSPACE_MESSAGE =
  "Microcks does not run the Microcks CLI in a restricted workspace. " +
  "Trust this folder to browse services, import artifacts, and run dry-run tests.";

/** Raised instead of spawning the Microcks CLI in a restricted window. */
export class MicrocksWorkspaceTrustError extends Error {
  constructor(message: string = UNTRUSTED_WORKSPACE_MESSAGE) {
    super(message);
    this.name = "MicrocksWorkspaceTrustError";
  }
}

export function isWorkspaceTrusted(): boolean {
  return vscode.workspace.isTrusted;
}

export function assertWorkspaceTrusted(): void {
  if (!isWorkspaceTrusted()) {
    throw new MicrocksWorkspaceTrustError();
  }
}

/** Returns `true` when the action may run; otherwise offers the trust editor. */
export async function ensureWorkspaceTrusted(action: string): Promise<boolean> {
  if (isWorkspaceTrusted()) {
    return true;
  }
  const choice = await vscode.window.showWarningMessage(
    `${action} runs the Microcks CLI against files in this folder. ${UNTRUSTED_WORKSPACE_MESSAGE}`,
    "Manage Workspace Trust"
  );
  if (choice === "Manage Workspace Trust") {
    await vscode.commands.executeCommand("workbench.trust.manage");
  }
  return false;
}
