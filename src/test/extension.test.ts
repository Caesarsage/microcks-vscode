import * as assert from "assert";
import * as vscode from "vscode";
import {
  assertWorkspaceTrusted,
  buildBaseArgs,
  buildCapabilitiesArgs,
  buildGetServiceArgs,
  buildListServicesArgs,
  classifyMicrocksExitCode,
  containerDriverArgs,
  editorCapabilities,
  parseCapabilitiesDocument,
  parseDryRunWatchEvent,
  readConfiguredCliPath,
  resolveContainerDriver,
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

  test("offers a dry-run action while no session has started", async () => {
    const provider = new TestsProvider();

    const idle = await provider.getChildren();

    assert.ok(idle.some((item) => item.label === "No dry-run session yet."));
    assert.ok(idle.some((item) => item.label === "Run Dry-Run for API File"));
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
    assert.equal(roots.length, 1);
    assert.equal(roots[0].description, "stopped");
    const dryRunChildren = await provider.getChildren(roots[0]);
    assert.ok(dryRunChildren.some((item) => item.label === "result-1"));

    provider.clearDryRunSession();
    const cleared = await provider.getChildren();
    assert.ok(cleared.some((item) => item.label === "No dry-run session yet."));
  });

  test("expands dry-run operation and step details", async () => {
    const provider = new TestsProvider();
    provider.beginDryRunSession();
    provider.recordDryRunResult({
      id: "result-1",
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
  });

  test("filters dry-run results by service", async () => {
    const provider = new TestsProvider();
    provider.beginDryRunSession();
    provider.recordDryRunResult({
      id: "result-1",
      serviceId: "Catalog API:1.0.0",
      testNumber: 1,
      success: true,
      inProgress: false,
    });
    provider.recordDryRunResult({
      id: "result-2",
      serviceId: "Orders API:1.0.0",
      testNumber: 2,
      success: false,
      inProgress: false,
    });

    assert.deepEqual(provider.getKnownServiceIds(), [
      "Catalog API:1.0.0",
      "Orders API:1.0.0",
    ]);

    provider.setServiceFilter("Catalog API:1.0.0");
    const [root] = await provider.getChildren();
    const filtered = await provider.getChildren(root);

    assert.ok(filtered.some((item) => item.label === "Catalog API:1.0.0 · #1"));
    assert.ok(!filtered.some((item) => item.label === "Orders API:1.0.0 · #2"));
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
    const resolved = resolveMicrocksCliPath(
      configurationStub({ globalValue: "/opt/microcks/bin/microcks" })
    );

    assert.equal(resolved.executable, "/opt/microcks/bin/microcks");
    assert.equal(resolved.source, "setting");
  });

  test("falls back to microcks on PATH when no CLI path is configured", () => {
    const resolved = resolveMicrocksCliPath(configurationStub({}));

    assert.equal(resolved.executable, "microcks");
    assert.equal(resolved.source, "path");
  });

  test("uses a managed CLI when no explicit path is configured", () => {
    const resolved = resolveMicrocksCliPath(
      configurationStub({}),
      "/extension-storage/microcks"
    );

    assert.equal(resolved.executable, "/extension-storage/microcks");
    assert.equal(resolved.source, "managed");
  });

  test("passes an explicit container driver through to the CLI", () => {
    const withDriver = (value?: string): vscode.WorkspaceConfiguration =>
      ({
        get: <T>(key: string): T | undefined =>
          key === "containerDriver" ? (value as T) : undefined,
      }) as unknown as vscode.WorkspaceConfiguration;

    assert.equal(resolveContainerDriver(withDriver("podman")), "podman");
    assert.equal(resolveContainerDriver(withDriver("docker")), "docker");
    assert.equal(resolveContainerDriver(withDriver(undefined)), "auto");
    assert.equal(resolveContainerDriver(withDriver("containerd")), "auto");

    assert.deepEqual(containerDriverArgs("podman"), ["--driver", "podman"]);
    assert.deepEqual(containerDriverArgs("docker"), ["--driver", "docker"]);
    assert.deepEqual(
      containerDriverArgs("auto"),
      [],
      "auto must leave runtime selection to the CLI"
    );
  });

  test("ignores a CLI path coming from workspace settings", () => {
    const resolved = resolveMicrocksCliPath(
      configurationStub({ workspaceValue: "/tmp/attacker/payload.sh" })
    );

    assert.equal(resolved.executable, "microcks");
    assert.equal(resolved.source, "path");
  });

  test("ignores a CLI path coming from folder settings", () => {
    const resolved = resolveMicrocksCliPath(
      configurationStub({ workspaceFolderValue: "./.vscode/payload.sh" }),
      "/extension-storage/microcks"
    );

    assert.equal(resolved.executable, "/extension-storage/microcks");
    assert.equal(resolved.source, "managed");
  });

  test("keeps the user CLI path when a workspace tries to override it", () => {
    const resolved = resolveMicrocksCliPath(
      configurationStub({
        globalValue: "/opt/microcks/bin/microcks",
        workspaceValue: "/tmp/attacker/payload.sh",
      })
    );

    assert.equal(resolved.executable, "/opt/microcks/bin/microcks");
    assert.equal(resolved.source, "setting");
  });

  test("reads the CLI path from user settings only", () => {
    const configured = readConfiguredCliPath(
      configurationStub({
        globalValue: "  /opt/microcks/bin/microcks  ",
        workspaceLanguageValue: "/tmp/attacker/payload.sh",
      })
    );

    assert.equal(configured, "/opt/microcks/bin/microcks");
  });

  test("declares microcks.cliPath as a machine scoped, trust restricted setting", () => {
    const extension = vscode.extensions.getExtension("microcks.microcks-vscode");
    assert.ok(extension);

    const manifest = extension.packageJSON;
    const cliPath =
      manifest.contributes.configuration.properties["microcks.cliPath"];

    assert.equal(
      cliPath.scope,
      "machine",
      "microcks.cliPath must not be settable from a workspace."
    );
    assert.equal(manifest.capabilities.untrustedWorkspaces.supported, "limited");
    assert.ok(
      manifest.capabilities.untrustedWorkspaces.restrictedConfigurations.includes(
        "microcks.cliPath"
      )
    );
  });

  test("never spawns a CLI path written by the open workspace", () => {
    // The fixture workspace ships a .vscode/settings.json that sets
    // microcks.cliPath, like a repository trying to pick the binary.
    const attackerPath = "/tmp/microcks-vscode-attacker-payload";

    assert.equal(
      vscode.workspace.getConfiguration("files").get<string>("eol"),
      "\r\n",
      "Control: the fixture .vscode/settings.json must be applied to this window."
    );

    const configuration = vscode.workspace.getConfiguration("microcks");
    const inspected = configuration.inspect<string>("cliPath");

    assert.equal(
      inspected?.workspaceValue,
      undefined,
      "A machine scoped setting must not be merged from workspace settings."
    );
    assert.equal(inspected?.workspaceFolderValue, undefined);
    assert.notEqual(configuration.get<string>("cliPath"), attackerPath);

    const resolved = resolveMicrocksCliPath(configuration);

    assert.notEqual(resolved.executable, attackerPath);
    assert.equal(resolved.executable, "microcks");
    assert.equal(resolved.source, "path");
  });

  // The restricted side of this guard is asserted by the "restricted"
  // configuration in .vscode-test.mjs, which launches without
  // --disable-workspace-trust. See src/test/restricted.
  test("runs the CLI once the workspace is trusted", () => {
    assert.ok(
      vscode.workspace.isTrusted,
      "This configuration launches with --disable-workspace-trust."
    );
    assert.doesNotThrow(() => assertWorkspaceTrusted());
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

/**
 * The merged value `get` returns includes workspace values, so these tests fail
 * if resolution ever goes back to reading `get("cliPath")`.
 */
function configurationStub(values: {
  defaultValue?: string;
  globalValue?: string;
  workspaceValue?: string;
  workspaceFolderValue?: string;
  workspaceLanguageValue?: string;
}): vscode.WorkspaceConfiguration {
  const merged =
    values.workspaceFolderValue ??
    values.workspaceValue ??
    values.globalValue ??
    values.defaultValue;
  return {
    get: () => merged,
    inspect: () => ({ key: "microcks.cliPath", ...values }),
  } as unknown as vscode.WorkspaceConfiguration;
}
