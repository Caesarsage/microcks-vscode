import {
  editorCapabilities,
  getService,
  listServices,
  MicrocksService,
  requireCliCapabilities,
  ServiceDetail,
} from "../cli";

export interface ServicesDataSource {
  listServices(size?: number): Promise<MicrocksService[]>;
  getServiceDetail(id: string): Promise<ServiceDetail>;
}

export interface ServicesTarget {
  readonly serverUrl: string;
  readonly dataSource: ServicesDataSource;
}

export interface CliServicesDataSourceOptions {
  readonly executable: string;
  readonly microcksUrl?: string;
  readonly contextName?: string;
  readonly configPath?: string;
}

export class CliServicesDataSource implements ServicesDataSource {
  private capabilityCheck?: Promise<unknown>;

  constructor(private readonly options: CliServicesDataSourceOptions) {}

  async listServices(size = 50): Promise<MicrocksService[]> {
    await this.ensureCapabilities();
    return listServices(this.options, 0, size);
  }

  async getServiceDetail(id: string): Promise<ServiceDetail> {
    await this.ensureCapabilities();
    return getService(this.options, id);
  }

  private ensureCapabilities(): Promise<unknown> {
    this.capabilityCheck ??= requireCliCapabilities(this.options.executable, [
      editorCapabilities.serviceListJson,
      editorCapabilities.serviceGetJson,
    ]);
    return this.capabilityCheck;
  }
}
