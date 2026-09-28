import { randomBytes } from "crypto";
import * as vscode from "vscode";
import { MicrocksOperation, MicrocksService } from "../cli";
import { MicrocksMockClient } from "../mocks";
import { ServicesDataSource } from "../services";

interface ExamplePair {
  type?: string;
  request?: { name?: string; queryParameters?: Array<{ name: string; value: string }>; content?: string };
  response?: { status?: string; mediaType?: string; content?: string };
}

/**
 * Single-WebView Inspector — the v2 design from design/v2-operation-inspector.html
 * brought to life inside the editor area for one operation at a time.
 *
 * One panel per (service, operation) pair; reopening the same operation
 * reveals the existing panel rather than spawning duplicates.
 */
export class InspectorPanel {
  private static readonly viewType = "microcks.inspector";
  private static panels = new Map<string, InspectorPanel>();

  private readonly disposables: vscode.Disposable[] = [];

  public static async show(
    extensionUri: vscode.Uri,
    client: MicrocksMockClient,
    dataSource: ServicesDataSource,
    service: MicrocksService,
    operation: MicrocksOperation,
    method: string,
    path: string
  ): Promise<void> {
    const key = `${service.id}::${operation.name}`;
    const existing = InspectorPanel.panels.get(key);
    if (existing) {
      existing.panel.reveal();
      return;
    }

    const url = client.buildMockUrl(service.name, service.version, path);

    let examples: ExamplePair[] = [];
    try {
      const detail = await dataSource.getServiceDetail(service.id);
      examples = (detail.messagesMap?.[operation.name] as ExamplePair[]) || [];
    } catch {
      // Missing examples is fine — panel still works without them.
    }

    const panel = vscode.window.createWebviewPanel(
      InspectorPanel.viewType,
      `⚡ ${method} ${path}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "webview-ui")],
      }
    );
    panel.iconPath = new vscode.ThemeIcon("zap");

    const inspector = new InspectorPanel(panel, key, client, method, url, extensionUri);
    inspector.render(service, operation, method, url, examples);
    InspectorPanel.panels.set(key, inspector);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly key: string,
    private readonly client: MicrocksMockClient,
    private readonly method: string,
    private readonly defaultUrl: string,
    private readonly extensionUri: vscode.Uri
  ) {
    panel.onDidDispose(() => this.dispose(), null, this.disposables);

    panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables
    );
  }

  private async handleMessage(msg: { type: string; url?: string; realUrl?: string }): Promise<void> {
    if (msg.type === "send" && msg.url) {
      const start = Date.now();
      try {
        const result = await this.client.invoke(msg.url, this.method);
        const elapsed = Date.now() - start;
        this.panel.webview.postMessage({
          type: "response",
          status: result.status,
          contentType: result.contentType,
          body: result.body,
          elapsed,
          size: new TextEncoder().encode(result.body).length,
        });
      } catch (err) {
        this.panel.webview.postMessage({
          type: "error",
          message: (err as Error).message,
        });
      }
    } else if (msg.type === "compare") {
      const realUrl = await vscode.window.showInputBox({
        prompt: "Your real service URL (will receive the same request)",
        placeHolder: "http://localhost:3000/products",
        value: msg.realUrl ?? "",
      });
      if (!realUrl) {return;}

      const [mock, real] = await Promise.allSettled([
        this.client.invoke(this.defaultUrl, this.method),
        this.client.invoke(realUrl, this.method),
      ]);

      this.panel.webview.postMessage({
        type: "compare-result",
        realUrl,
        mock:
          mock.status === "fulfilled"
            ? { status: mock.value.status, body: mock.value.body, contentType: mock.value.contentType }
            : { error: mock.reason?.message ?? String(mock.reason) },
        real:
          real.status === "fulfilled"
            ? { status: real.value.status, body: real.value.body, contentType: real.value.contentType }
            : { error: real.reason?.message ?? String(real.reason) },
      });
    } else if (msg.type === "copy" && msg.url) {
      await vscode.env.clipboard.writeText(msg.url);
      vscode.window.showInformationMessage(`Copied: ${msg.url}`);
    }
  }

  private render(
    service: MicrocksService,
    operation: MicrocksOperation,
    method: string,
    url: string,
    examples: ExamplePair[]
  ): void {
    const safeUrl = escapeHtml(url);
    const safeOpName = escapeHtml(operation.name);
    const safeService = escapeHtml(`${service.name} · ${service.version}`);

    const exampleCards = examples
      .map((ex, i) => {
        const name = escapeHtml(ex.request?.name ?? `example-${i + 1}`);
        const params = (ex.request?.queryParameters ?? [])
          .map((p) => `${p.name}=${p.value}`)
          .join("&");
        const status = escapeHtml(ex.response?.status ?? "—");
        const preview = escapeHtml((ex.response?.content ?? "").slice(0, 80));
        return `
          <div class="ex-card" data-index="${i}">
            <div class="ex-name">${name}</div>
            <div class="ex-meta">
              <span>${params ? `?${escapeHtml(params)}` : "(no params)"}</span>
              <span class="ex-status">→ ${status}</span>
            </div>
            <div class="ex-preview">${preview || "—"}</div>
          </div>`;
      })
      .join("");

    const exampleData = examples.map((ex) => ({
      body: ex.response?.content ?? "",
      contentType: ex.response?.mediaType ?? "text/plain",
      status: ex.response?.status ?? "—",
    }));
    const nonce = randomBytes(16).toString("base64");
    const serializedExamples = serializeForInlineScript(exampleData);
    const webview = this.panel.webview;
    const assetUri = (file: string): vscode.Uri =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "webview-ui", file));
    const styleUri = assetUri("inspector.css");
    const scriptUri = assetUri("inspector.js");

    this.panel.webview.html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';" />
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div class="main">
      <div class="head">
        <div class="crumbs">
          Microcks <span class="sep">›</span> ${safeService}
          <span class="sep">›</span>
          <span class="crumb-current">${safeOpName}</span>
        </div>
        <div class="title">
          <span class="chip chip-${escapeHtml(method)}">${escapeHtml(method)}</span>
          ${safeOpName}
          <span class="sub">— invoke this mock via the Microcks server</span>
        </div>
        <div class="url-row">
          <div class="url-prefix">${escapeHtml(method)}</div>
          <input id="url" class="url-input" value="${safeUrl}" />
          <button class="send" id="send">Send →</button>
        </div>
        <div class="send-extra">
          <button id="compare">⇄ Send &amp; compare with real service</button>
          <button id="copy">📋 Copy URL</button>
        </div>
      </div>

      <div class="subtabs">
        <div class="subtab active">Request</div>
        <div class="subtab">Examples <span class="count">${examples.length}</span> <span class="dot" title="Microcks-aware"></span></div>
      </div>

      <div class="panel-body">
        The request goes to the URL above with the selected method.
        Use the <strong>Examples</strong> panel on the right to load
        request/response pairs Microcks already knows from the spec.
      </div>

      <div class="resp" id="resp">
        <div class="resp-empty">No response yet — click <strong class="strong-spaced">Send →</strong> to invoke the mock.</div>
      </div>
    </div>

    <div class="side">
      <div class="side-head">
        <div class="title">Microcks Examples</div>
        <div class="sub">${examples.length} example req/resp pair${examples.length === 1 ? "" : "s"} loaded from the spec. Click one to view its response.</div>
      </div>
      <div class="side-list">
        ${exampleCards || '<div class="side-empty">No examples found for this operation.</div>'}
      </div>
    </div>

    <script type="application/json" id="microcks-examples" nonce="${nonce}">${serializedExamples}</script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private dispose(): void {
    InspectorPanel.panels.delete(this.key);
    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
