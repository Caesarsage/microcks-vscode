export interface MockInvocation {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
}

export class MicrocksMockClient {
  constructor(private readonly serverUrl: string) {}

  buildMockUrl(serviceName: string, version: string, path: string): string {
    const encodedName = encodeURIComponent(serviceName);
    const encodedVersion = encodeURIComponent(version);
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.serverUrl}/rest/${encodedName}/${encodedVersion}${normalizedPath}`;
  }

  async invoke(url: string, method = "GET"): Promise<MockInvocation> {
    let response: Response;
    try {
      response = await fetch(url, { method, headers: { Accept: "*/*" } });
    } catch (error) {
      const networkError = error as Error & {
        cause?: { code?: string; message?: string };
      };
      const code = networkError.cause?.code ?? "network error";
      const details = networkError.cause?.message ?? networkError.message;
      throw new Error(
        `Cannot reach ${url} - ${code}${details ? `: ${details}` : ""}`
      );
    }
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "text/plain",
      body: await response.text(),
    };
  }

  serviceBrowserUrl(id: string): string {
    return `${this.serverUrl}/#/services/${encodeURIComponent(id)}`;
  }
}
