import { editorCapabilities, requireCliCapabilities } from "./capabilities";
import { executeMicrocksCli } from "./cliExecutor";
import { buildBaseArgs, CliJsonCommandOptions } from "./jsonCommands";

export interface ArtifactImportResult {
  readonly file: string;
  readonly id: string;
  readonly primary: boolean;
  readonly action: "discovered" | "completed";
}

export async function importArtifact(
  options: CliJsonCommandOptions,
  file: string
): Promise<ArtifactImportResult[]> {
  await requireCliCapabilities(options.executable, [
    editorCapabilities.artifactImportFileJson,
  ]);
  const result = await executeMicrocksCli({
    executable: options.executable,
    args: ["import", file, "--output", "json", ...buildBaseArgs(options)],
  });
  return JSON.parse(result.stdout) as ArtifactImportResult[];
}
