const vscode = acquireVsCodeApi();
const examples = JSON.parse(
  document.getElementById("microcks-examples").textContent
);

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
  const fromLabel = m.isExample ? '<span class="k">From: Microcks example</span>' : '<span class="k">Time:</span> <span class="v">' + escapeText(m.elapsed) + ' ms</span>';
  respEl.innerHTML = `
    <div class="resp-status">
      <span><span class="k">Status:</span> <span class="v ${ok ? 'ok' : 'err'}">${escapeText(m.status)}</span></span>
      ${fromLabel}
      <span><span class="k">Size:</span> <span class="v">${escapeText(m.size)} B</span></span>
      <span class="push-right"><span class="k">${escapeText(m.contentType)}</span></span>
    </div>
    <div class="resp-body">${escapeText(pretty)}</div>
  `;
}

function renderError(message) {
  respEl.innerHTML = `<div class="resp-empty error-text">⚠ ${escapeText(message)}</div>`;
}

// LCS over lines; true means the line has no partner on the other side.
function diffFlags(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const fa = new Array(n).fill(true), fb = new Array(m).fill(true);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { fa[i] = false; fb[j] = false; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return [fa, fb];
}

function compareSide(label, side, lines, flags) {
  if (side.error) {
    return `<div class="resp-empty error-text">⚠ ${escapeText(side.error)}</div>`;
  }
  const ok = String(side.status).startsWith("2");
  const body = lines
    .map((line, k) => `<div class="dl${flags && flags[k] ? " chg" : ""}">${escapeText(line) || "&nbsp;"}</div>`)
    .join("");
  return `<div class="resp-status"><span><span class="k">${label} status:</span> <span class="v ${ok ? "ok" : "err"}">${escapeText(side.status)}</span></span></div><div class="resp-body">${body}</div>`;
}

function renderCompare(m) {
  const mockLines = m.mock.error ? [] : tryPretty(m.mock.body, m.mock.contentType).split("\\n");
  const realLines = m.real.error ? [] : tryPretty(m.real.body, m.real.contentType).split("\\n");

  const diffable = !m.mock.error && !m.real.error &&
    mockLines.length <= 2000 && realLines.length <= 2000;
  let fa = null, fb = null, changed = 0;
  if (diffable) {
    const flags = diffFlags(mockLines, realLines);
    fa = flags[0];
    fb = flags[1];
    changed = fa.filter(Boolean).length + fb.filter(Boolean).length;
  }

  const statusMismatch = !m.mock.error && !m.real.error &&
    String(m.mock.status) !== String(m.real.status);

  let summary = "";
  if (diffable && changed === 0 && !statusMismatch) {
    summary = ' — <span class="cmp-same">identical</span>';
  } else if (diffable) {
    summary = ' — <span class="cmp-diff">' + changed + (changed === 1 ? " line differs" : " lines differ") +
      (statusMismatch ? ", status mismatch" : "") + "</span>";
  } else if (statusMismatch) {
    summary = ' — <span class="cmp-diff">status mismatch</span>';
  }

  respEl.innerHTML = `
    <div class="compare-wrap">
      <div class="compare-bar">⇄ <strong>Compare:</strong> mock vs <code>${escapeText(m.realUrl)}</code>${summary}</div>
      <div class="compare-side">${compareSide("Mock", m.mock, mockLines, fa)}</div>
      <div class="compare-side">${compareSide("Real", m.real, realLines, fb)}</div>
    </div>
  `;
}

function escapeText(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
