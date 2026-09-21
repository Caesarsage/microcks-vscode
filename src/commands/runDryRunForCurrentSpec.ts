import { spawn } from "child_process";
import * as vscode from "vscode";
import {
  assertWorkspaceTrusted,
  classifyMicrocksExitCode,
  containerDriverArgs,
  DryRunEventType,
  editorCapabilities,
  ensureWorkspaceTrusted,
  parseDryRunWatchEvent,
  requireCliCapabilities,
  resolveContainerDriver,
} from "../cli";
import { readArtifactMetadata } from "../utils/artifact";
import { shellQuote } from "../utils/shell";
import { MicrocksCommandContext } from "./commandContext";
import { getActiveDryRunWatch, setActiveDryRunWatch } from "./dryRunWatchState";

export function registerRunDryRunForCurrentSpecCommand(
  context: MicrocksCommandContext
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "microcks.runDryRunForCurrentSpec",
    async () => {
      if (!(await ensureWorkspaceTrusted("Running a Microcks dry-run"))) {
        return;
      }
      const artifactPath = await pickArtifactPath();
      if (!artifactPath) {
        return;
      }
      const metadata = readArtifactMetadata(artifactPath);

      const serviceAndVersion = await vscode.window.showInputBox({
        title: "Run Microcks Dry-Run",
        prompt: "Service name and version",
        placeHolder: "E-Commerce Platform API:2.0.0",
        value: metadata.serviceRef,
      });
      if (!serviceAndVersion) {
        return;
      }

      const targetUrl = await vscode.window.showInputBox({
        title: "Run Microcks Dry-Run",
        prompt: "Target endpoint to test",
        placeHolder: "http://localhost:3000",
        validateInput: (value) => {
          if (!value.trim()) {
            return "Enter the target endpoint URL.";
          }
          try {
            const url = new URL(value);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
              return "Use an http:// or https:// URL.";
            }
          } catch {
            return "Enter a valid URL.";
          }
          return undefined;
        },
      });
      if (!targetUrl) {
        return;
      }

      const runnerType = await vscode.window.showQuickPick(
        runnerTypeOptions(metadata.runnerType),
        {
          title: "Run Microcks Dry-Run",
          placeHolder: "Select the Microcks test runner type",
        }
      );
      if (!runnerType) {
        return;
      }

      const filteredOperations = await pickFilteredOperations(metadata.operations);
      const mode = await pickDryRunMode();
      if (!mode) {
        return;
      }

      const executable = context.cliCommand();
      const args = [
        "test",
        "--dry-run",
        "--artifact",
        artifactPath,
        ...containerDriverArgs(resolveContainerDriver()),
      ];
      if (filteredOperations.length > 0) {
        args.push(
          "--filteredOperations",
          JSON.stringify(filteredOperations)
        );
      }
      if (mode === "watch") {
        try {
          await requireCliCapabilities(executable, [
            editorCapabilities.dryRunWatchEventsJson,
          ]);
        } catch (error) {
          await showCliRecovery(error as Error);
          return;
        }
        args.push("--watch", "--output", "json");
      }
      args.push(serviceAndVersion, targetUrl, runnerType);

      await runDryRun(executable, args, {
        watch: mode === "watch",
        context,
      });
    }
  );
}

async function showCliRecovery(error: Error): Promise<void> {
  const choice = await vscode.window.showErrorMessage(
    `Microcks dry-run watch requires a compatible CLI: ${error.message}`,
    "Set CLI Path",
    "Install or Update CLI"
  );
  if (choice === "Set CLI Path") {
    await vscode.commands.executeCommand("microcks.setCliPath");
  } else if (choice === "Install or Update CLI") {
    await vscode.commands.executeCommand("microcks.openCliInstallation");
  }
}

async function pickArtifactPath(): Promise<string | undefined> {
  const document = vscode.window.activeTextEditor?.document;
  if (document && !document.isUntitled) {
    if (document.isDirty) {
      await document.save();
    }
    return document.uri.fsPath;
  }

  const picked = await vscode.window.showOpenDialog({
    title: "Select API spec or collection for Microcks dry-run",
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      "API specs and collections": [
        "yaml",
        "yml",
        "json",
        "graphql",
        "graphqls",
        "proto",
        "wsdl",
        "xml",
      ],
      "All files": ["*"],
    },
  });

  return picked?.[0]?.fsPath;
}

async function pickFilteredOperations(operations: string[]): Promise<string[]> {
  if (operations.length === 0) {
    return [];
  }

  const picked = await vscode.window.showQuickPick(
    operations.map((operation) => ({ label: operation, picked: false })),
    {
      title: "Run Microcks Dry-Run",
      placeHolder:
        "Select operations to test, or press Enter without selecting to test all",
      canPickMany: true,
    }
  );

  return picked?.map((item) => item.label) ?? [];
}

function runnerTypeOptions(inferred?: string): string[] {
  const options = [
    "OPEN_API_SCHEMA",
    "ASYNC_API_SCHEMA",
    "GRAPHQL_SCHEMA",
    "POSTMAN",
    "SOAP_UI",
  ];
  if (!inferred) {
    return options;
  }
  return [inferred, ...options.filter((option) => option !== inferred)];
}

async function pickDryRunMode(): Promise<"once" | "watch" | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "Run once",
        description: "Run the test and tear down the temporary Microcks container",
        mode: "once" as const,
      },
      {
        label: "Watch and browse ephemeral Microcks",
        description:
          "Keep dry-run alive, re-run on file changes, and attach Services tree",
        mode: "watch" as const,
      },
    ],
    {
      title: "Run Microcks Dry-Run",
      placeHolder: "Choose how long the dry-run environment should live",
    }
  );

  return picked?.mode;
}

async function runDryRun(
  executable: string,
  args: string[],
  options: { watch: boolean; context: MicrocksCommandContext }
): Promise<void> {
  const output = vscode.window.createOutputChannel("Microcks Dry-Run");
  output.clear();
  output.show(true);
  output.appendLine(`$ ${formatShellCommand(executable, args)}`);
  output.appendLine("");

  if (options.watch) {
    const activeWatch = getActiveDryRunWatch();
    if (activeWatch) {
      activeWatch.provider.markDryRunStopped();
      activeWatch.testsProvider.markDryRunStopped();
      await stopProcess(activeWatch.process);
      if (getActiveDryRunWatch()?.process === activeWatch.process) {
        setActiveDryRunWatch(undefined);
      }
    }
    // Spawn first: a refused spawn must not leave the trees showing a live
    // session with no process behind it. No event can arrive in between, the
    // handlers are asynchronous and this block is not.
    const child = startDryRunProcess(executable, args, output, options);
    options.context.provider.beginDryRunSession();
    options.context.testsProvider.beginDryRunSession();
    setActiveDryRunWatch({
      process: child,
      provider: options.context.provider,
      testsProvider: options.context.testsProvider,
    });
    vscode.window.showInformationMessage(
      "Microcks dry-run watch started. The Services tree will attach when the ephemeral server is ready."
    );
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Running Microcks dry-run...",
    },
    () => waitForDryRunProcess(executable, args, output, options)
  );
}

function stopProcess(process: ReturnType<typeof spawn>): Promise<void> {
  if (process.exitCode !== null || process.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const forceTimer = setTimeout(() => process.kill("SIGKILL"), 15_000);
    process.once("close", () => {
      clearTimeout(forceTimer);
      resolve();
    });
    process.once("error", () => {
      clearTimeout(forceTimer);
      resolve();
    });
    process.kill("SIGINT");
  });
}

function startDryRunProcess(
  executable: string,
  args: string[],
  output: vscode.OutputChannel,
  options: { watch: boolean; context: MicrocksCommandContext }
): ReturnType<typeof spawn> {
  // Spawns directly instead of going through executeMicrocksCli.
  assertWorkspaceTrusted();
  const child = spawn(executable, args, { shell: false });
  let stdoutBuffer = "";
  let reachedReady = false;

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (!options.watch) {
      output.append(text);
      return;
    }
    stdoutBuffer += text;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        reachedReady ||=
          handleDryRunEvent(line, output, options.context) === "ready";
      }
    }
  });
  child.stderr.on("data", (chunk: Buffer) => output.append(chunk.toString()));
  child.on("error", (error) => {
    output.appendLine(`\nFailed to start Microcks CLI: ${error.message}`);
    vscode.window.showErrorMessage(`Microcks dry-run failed: ${error.message}`);
  });
  child.on("close", (code, signal) => {
    const activeWatch = getActiveDryRunWatch();
    if (activeWatch?.process === child) {
      if (activeWatch.forceStopTimer) {
        clearTimeout(activeWatch.forceStopTimer);
      }
      activeWatch.provider.markDryRunStopped();
      activeWatch.testsProvider.markDryRunStopped();
      setActiveDryRunWatch(undefined);
    }
    if (options.watch) {
      if (signal || code === 0) {
        vscode.window.showInformationMessage(
          signal
            ? `Microcks dry-run watch stopped (${signal}).`
            : "Microcks dry-run watch stopped."
        );
      } else {
        void showWatchFailure(code, reachedReady, output);
      }
    } else if (code === 0) {
      vscode.window.showInformationMessage("Microcks dry-run passed.");
    } else {
      vscode.window.showErrorMessage(
        "Microcks dry-run failed. See the Microcks Dry-Run output."
      );
    }
  });

  return child;
}

// A watch that dies before its "ready" event never got a container runtime, so
// point at the driver setting rather than at the CLI's own exit code.
async function showWatchFailure(
  code: number | null,
  reachedReady: boolean,
  output: vscode.OutputChannel
): Promise<void> {
  const exit = `exit code ${code}`;
  const message = reachedReady
    ? `Microcks dry-run watch failed: ${classifyMicrocksExitCode(code).label} (${exit}).`
    : `Microcks dry-run watch could not start its ephemeral Microcks container (${exit}). Check that your container runtime is running.`;
  const actions = reachedReady
    ? ["Show Output"]
    : ["Show Output", "Change Container Driver"];

  const choice = await vscode.window.showErrorMessage(message, ...actions);
  if (choice === "Show Output") {
    output.show(true);
  } else if (choice === "Change Container Driver") {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "microcks.containerDriver"
    );
  }
}

function waitForDryRunProcess(
  executable: string,
  args: string[],
  output: vscode.OutputChannel,
  options: { watch: boolean; context: MicrocksCommandContext }
): Promise<void> {
  return new Promise((resolve) => {
    const child = startDryRunProcess(executable, args, output, options);
    child.on("error", () => resolve());
    child.on("close", () => resolve());
  });
}

function handleDryRunEvent(
  line: string,
  output: vscode.OutputChannel,
  context: MicrocksCommandContext
): DryRunEventType | undefined {
  let event;
  try {
    event = parseDryRunWatchEvent(line);
  } catch (error) {
    output.appendLine(`Invalid dry-run event: ${(error as Error).message}`);
    output.appendLine(line);
    return undefined;
  }

  output.appendLine(`[${event.type}] ${event.message ?? event.service ?? ""}`.trim());
  switch (event.type) {
    case "ready":
      if (event.endpoint) {
        context.provider.attachDryRunTarget(context.targetForUrl(event.endpoint));
        vscode.window.showInformationMessage(
          `Services and Tests attached to dry-run Microcks at ${event.endpoint}.`
        );
      }
      break;
    case "imported":
      context.provider.refresh();
      break;
    case "test-result":
      if (event.result) {
        context.testsProvider.recordDryRunResult(event.result);
      }
      break;
    case "error":
      if (event.message) {
        vscode.window.showWarningMessage(`Microcks dry-run: ${event.message}`);
      }
      break;
    case "stopped":
      context.provider.markDryRunStopped();
      context.testsProvider.markDryRunStopped();
      break;
    default:
      break;
  }
  return event.type;
}

function formatShellCommand(executable: string, args: string[]): string {
  return [
    executable === "microcks" ? executable : shellQuote(executable),
    ...args.map(shellQuote),
  ].join(" ");
}
