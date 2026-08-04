export type MicrocksCliFailureKind =
  | "success"
  | "contract-test-failed"
  | "usage"
  | "connection"
  | "api"
  | "not-found"
  | "environment"
  | "generic"
  | "terminated";

export interface MicrocksCliExitClassification {
  readonly code: number | null;
  readonly kind: MicrocksCliFailureKind;
  readonly label: string;
}

export function classifyMicrocksExitCode(
  code: number | null
): MicrocksCliExitClassification {
  switch (code) {
    case 0:
      return { code, kind: "success", label: "Success" };
    case 1:
      return {
        code,
        kind: "contract-test-failed",
        label: "Contract test failed",
      };
    case 2:
      return { code, kind: "usage", label: "Invalid command usage" };
    case 11:
      return { code, kind: "connection", label: "Connection failed" };
    case 12:
      return { code, kind: "api", label: "Microcks API error" };
    case 13:
      return { code, kind: "not-found", label: "Resource not found" };
    case 14:
      return { code, kind: "environment", label: "Local environment error" };
    case null:
      return { code, kind: "terminated", label: "Process terminated" };
    case 20:
    default:
      return { code, kind: "generic", label: "Microcks CLI failed" };
  }
}

