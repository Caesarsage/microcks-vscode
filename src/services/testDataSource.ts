import {
  editorCapabilities,
  getTest,
  listTests,
  requireCliCapabilities,
  TestResult,
  TestResultSummary,
} from "../cli";

export interface TestsDataSource {
  listTests(query?: TestListQuery): Promise<TestResultSummary[]>;
  getTest(id: string): Promise<TestResult>;
}

export interface TestListQuery {
  readonly serviceId?: string;
  readonly size?: number;
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

  async listTests(query: TestListQuery = {}): Promise<TestResultSummary[]> {
    await this.ensureCapabilities();
    return listTests(this.options, {
      serviceId: query.serviceId,
      size: query.size ?? 50,
    });
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
