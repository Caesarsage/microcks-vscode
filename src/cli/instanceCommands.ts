import { editorCapabilities, requireCliCapabilities } from "./capabilities";
import { executeMicrocksCli } from "./cliExecutor";
import { containerDriverArgs, ContainerDriver } from "./cliResolver";
import { buildBaseArgs, CliJsonCommandOptions } from "./jsonCommands";

export interface MicrocksInstanceStartResult {
  readonly name: string;
  readonly server: string;
  readonly context: string;
  readonly status: "running";
}

export async function startLocalInstance(
  options: CliJsonCommandOptions,
  driver: ContainerDriver = "auto",
  onProgress?: (text: string) => void
): Promise<MicrocksInstanceStartResult> {
  await requireCliCapabilities(options.executable, [
    editorCapabilities.instanceStartJson,
  ]);
  const result = await executeMicrocksCli({
    executable: options.executable,
    args: [
      "start",
      "--output",
      "json",
      ...containerDriverArgs(driver),
      ...buildBaseArgs(options),
    ],
    onStderr: onProgress,
  });
  return JSON.parse(result.stdout) as MicrocksInstanceStartResult;
}
