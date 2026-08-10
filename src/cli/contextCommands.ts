import { requireCliCapabilities, editorCapabilities } from "./capabilities";
import { executeMicrocksCli } from "./cliExecutor";
import { buildBaseArgs, CliJsonCommandOptions } from "./jsonCommands";

export interface MicrocksContextSummary {
  readonly name: string;
  readonly server: string;
  readonly current: boolean;
}

export interface MicrocksContextMutation {
  readonly name: string;
  readonly server?: string;
  readonly action: "selected" | "unchanged" | "deleted";
}

export async function listContexts(
  options: CliJsonCommandOptions
): Promise<MicrocksContextSummary[]> {
  await requireCliCapabilities(options.executable, [
    editorCapabilities.contextListJson,
  ]);
  return executeJson<MicrocksContextSummary[]>(options, [
    "context",
    "--output",
    "json",
  ]);
}

export async function selectContext(
  options: CliJsonCommandOptions,
  name: string
): Promise<MicrocksContextMutation> {
  await requireCliCapabilities(options.executable, [
    editorCapabilities.contextUseJson,
  ]);
  return executeJson<MicrocksContextMutation>(options, [
    "context",
    name,
    "--output",
    "json",
  ]);
}

export async function deleteContext(
  options: CliJsonCommandOptions,
  name: string
): Promise<MicrocksContextMutation> {
  await requireCliCapabilities(options.executable, [
    editorCapabilities.contextDeleteJson,
  ]);
  return executeJson<MicrocksContextMutation>(options, [
    "context",
    name,
    "--delete",
    "--output",
    "json",
  ]);
}

export async function logoutContext(
  options: CliJsonCommandOptions,
  name: string
): Promise<void> {
  await requireCliCapabilities(options.executable, [
    editorCapabilities.authLogout,
  ]);
  await executeMicrocksCli({
    executable: options.executable,
    args: ["logout", name, ...buildBaseArgs(options)],
  });
}

async function executeJson<T>(
  options: CliJsonCommandOptions,
  args: string[]
): Promise<T> {
  const result = await executeMicrocksCli({
    executable: options.executable,
    args: [...args, ...buildBaseArgs(options)],
  });
  return JSON.parse(result.stdout) as T;
}
