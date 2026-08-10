import * as assert from "assert";
import * as vscode from "vscode";
import {
  buildBaseArgs,
  buildCapabilitiesArgs,
  buildGetServiceArgs,
  buildGetTestArgs,
  buildListServicesArgs,
  buildListTestsArgs,
  classifyMicrocksExitCode,
  editorCapabilities,
  parseCapabilitiesDocument,
  parseDryRunWatchEvent,
  resolveMicrocksCliPath,
  selectArchive,
} from "../cli";
import { CliServicesDataSource } from "../services";
import { ServicesProvider } from "../views/services";
import { TestsProvider } from "../views/tests";
import { serializeForInlineScript } from "../webviews/inspectorPanel";

suite("Microcks extension", () => {
  test("registers the Services view and commands", async () => {
    const extension = vscode.extensions.getExtension("microcks.microcks-vscode");

    assert.ok(extension, "Microcks extension should be available in the extension host.");

    await extension.activate();

    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes("microcks.refreshServices"));
    assert.ok(commands.includes("microcks.refreshTests"));
    assert.ok(commands.includes("microcks.startLocalServer"));
    assert.ok(commands.includes("microcks.connectRemoteServer"));
    assert.ok(commands.includes("microcks.runDryRunForCurrentSpec"));
    assert.ok(commands.includes("microcks.setCliPath"));
    assert.ok(commands.includes("microcks.openCliInstallation"));
    assert.ok(commands.includes("microcks.filterTests"));
    assert.ok(commands.includes("microcks.clearTestFilter"));
    assert.ok(commands.includes("microcks.signOutContext"));
    assert.ok(commands.includes("microcks.clearDryRunSession"));
    assert.ok(commands.includes("microcks.importCurrentFile"));
  });
});

suite("Microcks tree state", () => {
  test("marks a selected server unreachable after its service request fails", async () => {
    const provider = new ServicesProvider();
    provider.setConnectedTarget({
      serverUrl: "http://localhost:8585",
      dataSource: {
        listServices: async () => {
          throw new Error("connection refused");
        },
        getServiceDetail: async () => {
          throw new Error("connection refused");
        },
      },
    });

    const [root] = await provider.getChildren();
    const children = await provider.getChildren(root);
    assert.ok(
      children.some((item) => item.label === "Microcks server is not reachable.")
    );

    const [updatedRoot] = await provider.getChildren();
    assert.equal(updatedRoot.label, "Selected Server");
    assert.equal(updatedRoot.description, "unreachable");
  });

  test("keeps connected and dry-run service roots separate", async () => {
    const provider = new ServicesProvider();

    assert.equal((await provider.getChildren()).length, 1);
    provider.beginDryRunSession();
    assert.equal((await provider.getChildren()).length, 2);
    provider.markDryRunStopped();
    assert.equal((await provider.getChildren()).length, 2);
    provider.clearDryRunSession();
    assert.equal((await provider.getChildren()).length, 1);
  });

  test("retains dry-run test results after the session stops", async () => {
    const provider = new TestsProvider();
    provider.beginDryRunSession();
    provider.recordDryRunResult({
      id: "result-1",
      success: false,
      inProgress: false,
    });
    provider.markDryRunStopped();

    const roots = await provider.getChildren();
    assert.equal(roots.length, 2);
    const dryRunChildren = await provider.getChildren(roots[1]);
    assert.ok(dryRunChildren.some((item) => item.label === "result-1"));

    provider.clearDryRunSession();
    assert.equal((await provider.getChildren()).length, 1);
  });

  test("loads full connected test details and operation steps on expansion", async () => {
    const provider = new TestsProvider();
    let detailRequests = 0;
    provider.setConnectedDataSource({
      listTests: async () => [{
        id: "test-1",
        serviceId: "Catalog API:1.0.0",
        testNumber: 7,
        success: false,
        inProgress: false,
      }],
      getTest: async (id) => {
        detailRequests += 1;
        return {
          id,
          serviceId: "Catalog API:1.0.0",
          testNumber: 7,
          success: false,
          inProgress: false,
          testCaseResults: [{
            operationName: "GET /products",
            success: false,
            elapsedTime: 42,
            testStepResults: [{
              requestName: "default",
              success: false,
              message: "price must be a number",
            }],
          }],
        };
      },
    });

    const [root] = await provider.getChildren();
    const runs = await provider.getChildren(root);
    const run = runs.find((item) => item.label === "Catalog API:1.0.0 · #7");
    assert.ok(run);

    const details = await provider.getChildren(run);
    const operation = details.find((item) => item.label === "GET /products");
    assert.ok(operation);
    const steps = await provider.getChildren(operation);
    assert.ok(steps.some((item) => item.label === "default"));

    await provider.getChildren(run);
    assert.equal(detailRequests, 1, "full test details should be cached");
  });

  test("filters connected tests by service through the CLI query", async () => {
    const provider = new TestsProvider();
    let requestedServiceId: string | undefined;
    provider.setConnectedDataSource({
      listTests: async (query) => {
        requestedServiceId = query?.serviceId;
        return [{
          id: "test-1",
          serviceId: "Catalog API:1.0.0",
          success: true,
          inProgress: false,
        }];
      },
      getTest: async (id) => ({
        id,
        success: true,
        inProgress: false,
      }),
    });

    let [root] = await provider.getChildren();
    await provider.getChildren(root);
    assert.deepEqual(provider.getKnownServiceIds(), ["Catalog API:1.0.0"]);

    provider.setServiceFilter("Catalog API:1.0.0");
    [root] = await provider.getChildren();
    const filtered = await provider.getChildren(root);
    assert.equal(requestedServiceId, "Catalog API:1.0.0");
    assert.ok(filtered.some((item) => item.label === "Clear Test Filter"));
  });
});

suite("Microcks CLI foundation", () => {
  test("classifies known CLI exit codes", () => {
    assert.equal(classifyMicrocksExitCode(0).kind, "success");
    assert.equal(classifyMicrocksExitCode(1).kind, "contract-test-failed");
    assert.equal(classifyMicrocksExitCode(2).kind, "usage");
    assert.equal(classifyMicrocksExitCode(11).kind, "connection");
    assert.equal(classifyMicrocksExitCode(12).kind, "api");
    assert.equal(classifyMicrocksExitCode(13).kind, "not-found");
    assert.equal(classifyMicrocksExitCode(14).kind, "environment");
    assert.equal(classifyMicrocksExitCode(20).kind, "generic");
    assert.equal(classifyMicrocksExitCode(null).kind, "terminated");
    assert.equal(classifyMicrocksExitCode(99).kind, "generic");
  });

  test("resolves configured CLI path before PATH lookup", () => {
    const configuration = {
      get: <T>(key: string): T | undefined =>
        key === "cliPath" ? ("/opt/microcks/bin/microcks" as T) : undefined,
    } as unknown as vscode.WorkspaceConfiguration;

    const resolved = resolveMicrocksCliPath(configuration);

    assert.equal(resolved.executable, "/opt/microcks/bin/microcks");
    assert.equal(resolved.source, "setting");
  });

  test("falls back to microcks on PATH when no CLI path is configured", () => {
    const configuration = {
      get: <T>(): T | undefined => undefined,
    } as unknown as vscode.WorkspaceConfiguration;

    const resolved = resolveMicrocksCliPath(configuration);

    assert.equal(resolved.executable, "microcks");
    assert.equal(resolved.source, "path");
  });

  test("uses a managed CLI when no explicit path is configured", () => {
    const configuration = {
      get: <T>(): T | undefined => undefined,
    } as unknown as vscode.WorkspaceConfiguration;

    const resolved = resolveMicrocksCliPath(
      configuration,
      "/extension-storage/microcks"
    );

    assert.equal(resolved.executable, "/extension-storage/microcks");
    assert.equal(resolved.source, "managed");
  });

  test("builds shared CLI context arguments", () => {
    const args = buildBaseArgs({
      executable: "microcks",
      microcksUrl: "http://localhost:8585",
      contextName: "local",
      configPath: "/tmp/microcks-config",
    });

    assert.deepEqual(args, [
      "--microcksURL",
      "http://localhost:8585",
      "--microcks-context",
      "local",
      "--config",
      "/tmp/microcks-config",
    ]);
  });

  test("parses the CLI editor capability contract", () => {
    assert.deepEqual(buildCapabilitiesArgs(), [
      "capabilities",
      "--output",
      "json",
    ]);

    const document = parseCapabilitiesDocument(JSON.stringify({
      schemaVersion: "v1",
      cliVersion: "1.0.3",
      capabilities: Object.values(editorCapabilities),
    }));

    assert.equal(document.schemaVersion, "v1");
    assert.ok(document.capabilities.includes("service.list.json"));
  });

  test("builds service JSON command arguments", () => {
    assert.deepEqual(buildListServicesArgs(1, 25), [
      "service",
      "list",
      "--page",
      "1",
      "--size",
      "25",
      "--output",
      "json",
    ]);
    assert.deepEqual(buildGetServiceArgs("Catalog API:1.0.0"), [
      "service",
      "get",
      "Catalog API:1.0.0",
      "--output",
      "json",
    ]);
  });

  test("builds test JSON command arguments", () => {
    assert.deepEqual(buildListTestsArgs({ serviceId: "svc-1", size: 10 }), [
      "test",
      "list",
      "--page",
      "0",
      "--size",
      "10",
      "--output",
      "json",
      "--serviceId",
      "svc-1",
    ]);
    assert.deepEqual(buildGetTestArgs("test-1"), [
      "test",
      "get",
      "test-1",
      "--output",
      "json",
    ]);
  });

  test("creates CLI-backed service data source", () => {
    const source = new CliServicesDataSource({
      executable: "microcks",
      microcksUrl: "http://localhost:8585",
    });

    assert.ok(source);
  });

  test("parses a structured dry-run result event", () => {
    const event = parseDryRunWatchEvent(JSON.stringify({
      type: "test-result",
      timestamp: "2026-08-02T10:00:00Z",
      testResultId: "result-1",
      result: {
        id: "result-1",
        success: false,
        inProgress: false,
      },
    }));

    assert.equal(event.type, "test-result");
    assert.equal(event.result?.id, "result-1");
  });

  test("rejects malformed dry-run events", () => {
    assert.throws(
      () => parseDryRunWatchEvent('{"type":"ready"}'),
      /invalid dry-run watch event/
    );
  });

  test("selects a release archive for the current platform contract", () => {
    const asset = selectArchive(
      [
        {
          name: "microcks_1.2.3_Linux_x86_64.tar.gz",
          browser_download_url: "https://example.invalid/linux",
        },
        {
          name: "microcks_1.2.3_Darwin_all.tar.gz",
          browser_download_url: "https://example.invalid/darwin",
        },
      ],
      "darwin",
      "arm64"
    );

    assert.equal(asset.name, "microcks_1.2.3_Darwin_all.tar.gz");
  });

  test("escapes values embedded in Inspector scripts", () => {
    const serialized = serializeForInlineScript({
      body: "</script><script>alert(1)</script>&\u2028",
    });

    assert.ok(!serialized.includes("</script>"));
    assert.ok(serialized.includes("\\u003c/script\\u003e"));
    assert.ok(serialized.includes("\\u0026"));
    assert.ok(serialized.includes("\\u2028"));
  });
});
