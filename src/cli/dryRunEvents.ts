import { TestResult } from "./jsonCommands";

export type DryRunEventType =
  | "ready"
  | "imported"
  | "test-result"
  | "waiting"
  | "error"
  | "stopped";

export interface DryRunWatchEvent {
  readonly type: DryRunEventType;
  readonly timestamp: string;
  readonly endpoint?: string;
  readonly artifact?: string;
  readonly service?: string;
  readonly testResultId?: string;
  readonly result?: TestResult;
  readonly message?: string;
}

export function parseDryRunWatchEvent(line: string): DryRunWatchEvent {
  const value = JSON.parse(line) as Record<string, unknown>;
  if (
    !isEventType(value.type) ||
    typeof value.timestamp !== "string"
  ) {
    throw new Error("Microcks CLI returned an invalid dry-run watch event.");
  }
  return value as unknown as DryRunWatchEvent;
}

function isEventType(value: unknown): value is DryRunEventType {
  return [
    "ready",
    "imported",
    "test-result",
    "waiting",
    "error",
    "stopped",
  ].includes(String(value));
}
