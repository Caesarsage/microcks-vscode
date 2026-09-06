import { executeMicrocksCli, MicrocksCliInvocation } from "./cliExecutor";

export interface MicrocksService {
  id: string;
  name: string;
  version: string;
  type: string;
  operations?: MicrocksOperation[];
}

export interface MicrocksOperation {
  name: string;
  method?: string;
  resourcePaths?: string[];
}

export interface ServiceDetail {
  service: MicrocksService;
  messagesMap?: Record<string, unknown[]>;
}

// Test result shapes are still consumed from dry-run watch events. Server-side
// test browsing is deferred until the CLI can list a service's test results.
export interface TestResultSummary {
  id: string;
  version?: number;
  testNumber?: number;
  testDate?: number;
  testedEndpoint?: string;
  serviceId?: string;
  elapsedTime?: number;
  success: boolean;
  inProgress: boolean;
}

export interface TestResult extends TestResultSummary {
  testCaseResults?: TestCaseResult[];
}

export interface TestCaseResult {
  success: boolean;
  elapsedTime?: number;
  operationName: string;
  testStepResults?: TestStepResult[];
}

export interface TestStepResult {
  success: boolean;
  elapsedTime?: number;
  requestName?: string;
  eventMessageName?: string;
  message?: string;
}

export interface CliJsonCommandOptions {
  readonly executable: string;
  readonly microcksUrl?: string;
  readonly contextName?: string;
  readonly configPath?: string;
}

export async function listServices(
  options: CliJsonCommandOptions,
  page = 0,
  size = 50
): Promise<MicrocksService[]> {
  return executeJson<MicrocksService[]>(options, buildListServicesArgs(page, size));
}

export function buildListServicesArgs(page = 0, size = 50): string[] {
  return [
    "service",
    "list",
    "--page",
    String(page),
    "--size",
    String(size),
    "--output",
    "json",
  ];
}

export async function getService(
  options: CliJsonCommandOptions,
  serviceRef: string
): Promise<ServiceDetail> {
  return executeJson<ServiceDetail>(options, buildGetServiceArgs(serviceRef));
}

export function buildGetServiceArgs(serviceRef: string): string[] {
  return [
    "service",
    "get",
    serviceRef,
    "--output",
    "json",
  ];
}

export function buildBaseArgs(options: CliJsonCommandOptions): string[] {
  const args: string[] = [];
  if (options.microcksUrl) {
    args.push("--microcksURL", options.microcksUrl);
  }
  if (options.contextName) {
    args.push("--microcks-context", options.contextName);
  }
  if (options.configPath) {
    args.push("--config", options.configPath);
  }
  return args;
}

async function executeJson<T>(
  options: CliJsonCommandOptions,
  commandArgs: string[]
): Promise<T> {
  const invocation: MicrocksCliInvocation = {
    executable: options.executable,
    args: [...commandArgs, ...buildBaseArgs(options)],
  };
  const result = await executeMicrocksCli(invocation);
  return JSON.parse(result.stdout) as T;
}
