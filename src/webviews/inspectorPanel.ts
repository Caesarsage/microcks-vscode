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
      }
    );
    panel.iconPath = new vscode.ThemeIcon("zap");

    const inspector = new InspectorPanel(panel, key, client, method, url);
    inspector.render(service, operation, method, url, examples);
    InspectorPanel.panels.set(key, inspector);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly key: string,
    private readonly client: MicrocksMockClient,
    private readonly method: string,
    private readonly defaultUrl: string
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

    this.panel.webview.html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
    <style nonce="${nonce}">
      :root {
        --accent: #e535ab;
        --method-get: #4ec9b0;
        --method-post: #dcdcaa;
        --method-put: #569cd6;
        --method-del: #f48771;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 0;
        background: var(--vscode-editor-background);
        color: var(--vscode-foreground);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        display: grid;
        grid-template-columns: 1fr 280px;
        height: 100vh;
        overflow: hidden;
      }
      .main {
        display: flex;
        flex-direction: column;
        min-width: 0;
        overflow: hidden;
        border-right: 1px solid var(--vscode-panel-border);
      }
      .side {
        background: var(--vscode-sideBar-background);
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      /* Header */
      .head { padding: 18px 22px 14px; border-bottom: 1px solid var(--vscode-panel-border); }
      .crumbs { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
      .crumbs .sep { margin: 0 6px; opacity: 0.6; }
      .title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 600; }
      .title .sub { font-size: 11px; font-weight: 400; color: var(--vscode-descriptionForeground); }
      .crumb-current { color: var(--vscode-foreground); }
      .strong-spaced { margin: 0 4px; }
      .push-right { margin-left: auto; }
      .error-text { color: var(--vscode-testing-iconFailed, #fca5a5); }

      .chip {
        display: inline-block;
        padding: 2px 8px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.05em;
        border-radius: 3px;
      }
      .chip-GET { background: rgba(78, 201, 176, 0.15); color: var(--method-get); }
      .chip-POST { background: rgba(220, 220, 170, 0.18); color: var(--method-post); }
      .chip-PUT { background: rgba(86, 156, 214, 0.18); color: var(--method-put); }
      .chip-DEL, .chip-DELETE { background: rgba(244, 135, 113, 0.18); color: var(--method-del); }

      /* URL bar */
      .url-row { display: grid; grid-template-columns: auto 1fr auto; gap: 6px; margin-top: 12px; }
      .url-prefix {
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border, transparent);
        padding: 6px 10px;
        font-weight: 700;
        font-size: 11px;
        color: var(--method-get);
        border-radius: 3px;
        align-self: center;
      }
      .url-input {
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, transparent);
        padding: 6px 10px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
        border-radius: 3px;
      }
      .send {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 6px 18px;
        font-weight: 600;
        font-size: 12px;
        border-radius: 3px;
        cursor: pointer;
      }
      .send:hover { background: var(--vscode-button-hoverBackground); }
      .send-extra { display: flex; gap: 6px; margin-top: 8px; }
      .send-extra button {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: none;
        padding: 4px 10px;
        font-size: 11px;
        border-radius: 3px;
        cursor: pointer;
      }
      .send-extra button:hover { background: var(--vscode-button-secondaryHoverBackground); }

      /* Subtabs */
      .subtabs {
        display: flex;
        gap: 0;
        padding: 0 22px;
        border-bottom: 1px solid var(--vscode-panel-border);
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }
      .subtab {
        padding: 8px 12px;
        cursor: pointer;
        position: relative;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .subtab.active {
        color: var(--vscode-foreground);
      }
      .subtab.active::after {
        content: "";
        position: absolute;
        bottom: -1px; left: 0; right: 0;
        height: 2px;
        background: var(--vscode-focusBorder);
      }
      .subtab .count {
        background: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        font-size: 10px;
        padding: 0 6px;
        border-radius: 8px;
        font-weight: 600;
      }
      .subtab .dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--accent);
      }

      /* Request body area */
      .panel-body {
        padding: 14px 22px;
        flex-shrink: 0;
        min-height: 100px;
        font-size: 13px;
        color: var(--vscode-descriptionForeground);
      }
      .panel-body strong { color: var(--vscode-foreground); }
      .panel-body code {
        background: var(--vscode-textCodeBlock-background);
        padding: 1px 5px;
        border-radius: 2px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
      }

      /* Response area */
      .resp {
        flex: 1;
        display: flex;
        flex-direction: column;
        border-top: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editor-background);
        min-height: 0;
        overflow: hidden;
      }
      .resp-empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--vscode-descriptionForeground);
        font-size: 13px;
      }
      .resp-status {
        padding: 10px 22px;
        display: flex;
        align-items: center;
        gap: 20px;
        font-size: 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      .resp-status .k { color: var(--vscode-descriptionForeground); }
      .resp-status .v { font-weight: 700; }
      .resp-status .v.ok { color: var(--vscode-testing-iconPassed, #6ee7a7); }
      .resp-status .v.err { color: var(--vscode-testing-iconFailed, #fca5a5); }
      .resp-body {
        flex: 1;
        overflow: auto;
        padding: 12px 22px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
        line-height: 1.55;
        white-space: pre;
      }

      .compare-wrap { flex: 1; display: grid; grid-template-rows: auto 1fr 1fr; min-height: 0; }
      .compare-bar {
        padding: 8px 22px;
        background: rgba(252, 211, 77, 0.07);
        border-bottom: 1px solid var(--vscode-panel-border);
        font-size: 12px;
      }
      .compare-bar strong { color: var(--vscode-foreground); }
      .compare-side {
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }
      .compare-side + .compare-side { border-top: 1px solid var(--vscode-panel-border); }

      /* Right side examples */
      .side-head {
        padding: 14px 14px 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      .side-head .title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--vscode-foreground);
      }
      .side-head .sub {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        margin-top: 4px;
      }
      .side-list {
        flex: 1;
        overflow: auto;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ex-card {
        background: var(--vscode-list-hoverBackground);
        border: 1px solid transparent;
        border-radius: 4px;
        padding: 10px 12px;
        cursor: pointer;
      }
      .ex-card:hover { border-color: var(--vscode-focusBorder); }
      .ex-card.active {
        border-color: var(--method-get);
        background: rgba(78, 201, 176, 0.08);
      }
      .ex-name {
        font-size: 12px;
        font-weight: 600;
        color: var(--vscode-foreground);
      }
      .ex-meta {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        margin-top: 2px;
        display: flex;
        gap: 10px;
        font-family: var(--vscode-editor-font-family, monospace);
      }
      .ex-status { color: var(--method-get); }
      .ex-preview {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        margin-top: 6px;
        font-family: var(--vscode-editor-font-family, monospace);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .side-empty {
        padding: 20px 14px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
      }
    </style>
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

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const examples = ${serializedExamples};

      const urlInput = document.getElementById("url");
      const respEl = document.getElementById("resp");

      document.getElementById("send").addEventListener("click", () => {
        respEl.innerHTML = '<div class="resp-empty">Sending request…</div>';
        vscode.postMessage({ type: "send", url: urlInput.value });
      });

      document.getElementById("copy").addEventListener("click", () => {
        vscode.postMessage({ type: "copy", url: urlInput.value });
      });

      document.getElementById("compare").addEventListener("click", () => {
        respEl.innerHTML = '<div class="resp-empty">Send the same request to your real service…</div>';
        vscode.postMessage({ type: "compare" });
      });

      // Examples click → render the example's known response directly
      document.querySelectorAll(".ex-card").forEach((card) => {
        card.addEventListener("click", () => {
          document.querySelectorAll(".ex-card").forEach((c) => c.classList.remove("active"));
          card.classList.add("active");
          const i = parseInt(card.dataset.index, 10);
          const ex = examples[i];
          if (!ex) return;
          renderResponse({ status: ex.status, contentType: ex.contentType, body: ex.body, elapsed: 0, size: ex.body.length, isExample: true });
        });
      });

      window.addEventListener("message", (e) => {
        const m = e.data;
        if (m.type === "response") renderResponse(m);
        else if (m.type === "error") renderError(m.message);
        else if (m.type === "compare-result") renderCompare(m);
      });

      function tryPretty(body, contentType) {
        if (!contentType || !contentType.includes("json")) return body;
        try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
      }

      function renderResponse(m) {
        const pretty = tryPretty(m.body, m.contentType);
        const ok = String(m.status).startsWith("2");
        const fromLabel = m.isExample ? '<span class="k">From: Microcks example</span>' : '<span class="k">Time:</span> <span class="v">' + m.elapsed + ' ms</span>';
        respEl.innerHTML = \`
          <div class="resp-status">
            <span><span class="k">Status:</span> <span class="v \${ok ? 'ok' : 'err'}">\${m.status}</span></span>
            \${fromLabel}
            <span><span class="k">Size:</span> <span class="v">\${m.size} B</span></span>
            <span class="push-right"><span class="k">\${escapeText(m.contentType)}</span></span>
          </div>
          <div class="resp-body">\${escapeText(pretty)}</div>
        \`;
      }

      function renderError(message) {
        respEl.innerHTML = \`<div class="resp-empty error-text">⚠ \${escapeText(message)}</div>\`;
      }

      function renderCompare(m) {
        const mockBody = m.mock.error
          ? \`<div class="resp-empty error-text">⚠ \${escapeText(m.mock.error)}</div>\`
          : \`<div class="resp-status"><span><span class="k">Mock status:</span> <span class="v ok">\${m.mock.status}</span></span></div><div class="resp-body">\${escapeText(tryPretty(m.mock.body, m.mock.contentType))}</div>\`;
        const realBody = m.real.error
          ? \`<div class="resp-empty error-text">⚠ \${escapeText(m.real.error)}</div>\`
          : \`<div class="resp-status"><span><span class="k">Real status:</span> <span class="v ok">\${m.real.status}</span></span></div><div class="resp-body">\${escapeText(tryPretty(m.real.body, m.real.contentType))}</div>\`;
        respEl.innerHTML = \`
          <div class="compare-wrap">
            <div class="compare-bar">⇄ <strong>Compare:</strong> mock vs <code>\${escapeText(m.realUrl)}</code></div>
            <div class="compare-side">\${mockBody}</div>
            <div class="compare-side">\${realBody}</div>
          </div>
        \`;
      }

      function escapeText(s) {
        return String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }
    </script>
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
