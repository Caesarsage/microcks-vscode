import { executeMicrocksCli, MicrocksCliError } from "./cliExecutor";

export const CAPABILITIES_SCHEMA_VERSION = "v1";

export const editorCapabilities = {
  authLogin: "auth.login",
  authLoginSso: "auth.login.sso",
  authLogout: "auth.logout",
  contextListJson: "context.list.json",
  contextUseJson: "context.use.json",
  contextDeleteJson: "context.delete.json",
  instanceStartJson: "instance.start.json",
  artifactImportFileJson: "artifact.import.file.json",
  serviceListJson: "service.list.json",
  serviceGetJson: "service.get.json",
  dryRunWatchEventsJson: "test.dry-run.watch.events.json",
} as const;

export interface MicrocksCliCapabilities {
  readonly schemaVersion: string;
  readonly cliVersion: string;
  readonly capabilities: readonly string[];
}

export type CliReadinessFailure = "missing" | "outdated" | "invalid";

export class MicrocksCliReadinessError extends Error {
  constructor(
    readonly reason: CliReadinessFailure,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "MicrocksCliReadinessError";
  }
}

export function buildCapabilitiesArgs(): string[] {
  return ["capabilities", "--output", "json"];
}

export async function requireCliCapabilities(
  executable: string,
  required: readonly string[]
): Promise<MicrocksCliCapabilities> {
  let stdout: string;
  try {
    const result = await executeMicrocksCli({
      executable,
      args: buildCapabilitiesArgs(),
    });
    stdout = result.stdout;
  } catch (error) {
    if (error instanceof MicrocksCliError) {
      const reason = error.result.exit.kind === "environment" ? "missing" : "outdated";
      const message = reason === "missing"
        ? `Microcks CLI is unavailable at "${executable}".`
        : "This Microcks CLI does not advertise editor integration capabilities.";
      throw new MicrocksCliReadinessError(reason, message, error);
    }
    throw error;
  }

  const document = parseCapabilitiesDocument(stdout);
  const missing = required.filter(
    (capability) => !document.capabilities.includes(capability)
  );
  if (missing.length > 0) {
    throw new MicrocksCliReadinessError(
      "outdated",
      `Microcks CLI ${document.cliVersion} is missing required capabilities: ${missing.join(", ")}.`
    );
  }
  return document;
}

export function parseCapabilitiesDocument(stdout: string): MicrocksCliCapabilities {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch (error) {
    throw new MicrocksCliReadinessError(
      "invalid",
      "Microcks CLI returned invalid capability JSON.",
      error
    );
  }

  if (!isCapabilitiesDocument(value)) {
    throw new MicrocksCliReadinessError(
      "invalid",
      "Microcks CLI returned an unsupported capability document."
    );
  }
  if (value.schemaVersion !== CAPABILITIES_SCHEMA_VERSION) {
    throw new MicrocksCliReadinessError(
      "outdated",
      `Microcks CLI capability schema ${value.schemaVersion} is not supported by this extension.`
    );
  }
  return value;
}

function isCapabilitiesDocument(value: unknown): value is MicrocksCliCapabilities {
  if (!value || typeof value !== "object") {
    return false;
  }
  const document = value as Record<string, unknown>;
  return (
    typeof document.schemaVersion === "string" &&
    typeof document.cliVersion === "string" &&
    Array.isArray(document.capabilities) &&
    document.capabilities.every((capability) => typeof capability === "string")
  );
}
