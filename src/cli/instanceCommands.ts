import { editorCapabilities, requireCliCapabilities } from "./capabilities";
import { executeMicrocksCli } from "./cliExecutor";
import { buildBaseArgs, CliJsonCommandOptions } from "./jsonCommands";

export interface MicrocksInstanceStartResult {
  readonly name: string;
  readonly server: string;
  readonly context: string;
  readonly status: "running";
}

export async function startLocalInstance(
  options: CliJsonCommandOptions,
  onProgress?: (text: string) => void
): Promise<MicrocksInstanceStartResult> {
  await requireCliCapabilities(options.executable, [
    editorCapabilities.instanceStartJson,
  ]);
  const result = await executeMicrocksCli({
    executable: options.executable,
    args: ["start", "--output", "json", ...buildBaseArgs(options)],
    onStderr: onProgress,
  });
  return JSON.parse(result.stdout) as MicrocksInstanceStartResult;
}
