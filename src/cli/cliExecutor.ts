import { spawn } from "child_process";
import {
  classifyMicrocksExitCode,
  MicrocksCliExitClassification,
} from "./exitCodes";

export interface MicrocksCliInvocation {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly onStdout?: (text: string) => void;
  readonly onStderr?: (text: string) => void;
}

export interface MicrocksCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exit: MicrocksCliExitClassification;
}

export class MicrocksCliError extends Error {
  constructor(
    message: string,
    readonly result: MicrocksCliResult,
    readonly invocation: MicrocksCliInvocation
  ) {
    super(message);
    this.name = "MicrocksCliError";
  }
}

export async function executeMicrocksCli(
  invocation: MicrocksCliInvocation
): Promise<MicrocksCliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.executable, [...invocation.args], {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      invocation.onStdout?.(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      invocation.onStderr?.(text);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      const result = {
        stdout,
        stderr: error.message,
        exit: classifyMicrocksExitCode(
          error.code === "ENOENT" || error.code === "EACCES" ? 14 : 20
        ),
      };
      reject(
        new MicrocksCliError(
          formatCliFailureMessage(result),
          result,
          invocation
        )
      );
    });
    child.on("close", (code) => {
      const result = {
        stdout,
        stderr,
        exit: classifyMicrocksExitCode(code),
      };
      if (result.exit.kind === "success") {
        resolve(result);
        return;
      }
      reject(
        new MicrocksCliError(
          formatCliFailureMessage(result),
          result,
          invocation
        )
      );
    });
  });
}

export function formatCliFailureMessage(result: MicrocksCliResult): string {
  const details = result.stderr.trim() || result.stdout.trim();
  if (!details) {
    return result.exit.label;
  }
  return `${result.exit.label}: ${details}`;
}
