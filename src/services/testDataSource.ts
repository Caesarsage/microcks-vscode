import {
  editorCapabilities,
  getTest,
  listTests,
  requireCliCapabilities,
  TestResult,
  TestResultSummary,
} from "../cli";

export interface TestsDataSource {
  listTests(size?: number): Promise<TestResultSummary[]>;
  getTest(id: string): Promise<TestResult>;
}

export interface CliTestsDataSourceOptions {
  readonly executable: string;
  readonly microcksUrl?: string;
  readonly contextName?: string;
  readonly configPath?: string;
}

export class CliTestsDataSource implements TestsDataSource {
  private capabilityCheck?: Promise<unknown>;

  constructor(private readonly options: CliTestsDataSourceOptions) {}

  async listTests(size = 50): Promise<TestResultSummary[]> {
    await this.ensureCapabilities();
    return listTests(this.options, { size });
  }

  async getTest(id: string): Promise<TestResult> {
    await this.ensureCapabilities();
    return getTest(this.options, id);
  }

  private ensureCapabilities(): Promise<unknown> {
    this.capabilityCheck ??= requireCliCapabilities(this.options.executable, [
      editorCapabilities.testListJson,
      editorCapabilities.testGetJson,
    ]);
    return this.capabilityCheck;
  }
}
