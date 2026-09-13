# Microcks VS Code Extension

The Microcks VS Code Extension brings the Microcks API mocking and contract
testing workflow into VS Code. The long-term goal is to provide the IDE
experience for Microcks: discover services, import API artifacts, run dry-run
tests, inspect mocks, and move between local, ephemeral, and remote Microcks
environments without leaving the editor.

The extension is deliberately CLI-first. VS Code owns the native editor
experience, while `microcks-cli` remains the single integration layer for
authentication, contexts, local server lifecycle, imports, service queries, and
dry-run execution. When the CLI contract improves, the extension can benefit
without growing a second Microcks control-plane implementation.

## What it does

It currently ships:

- An **Activity Bar** entry that opens the Microcks sidebar.
- A **Services** tree view backed by Microcks CLI JSON commands that lets you expand each service into its operations.
- A **Dry-Run Tests** tree with run, operation, and step-level results plus service filtering.
- A **Context Manager** backed by CLI context and authentication contracts. The extension never reads or stores CLI credentials.
- A **Refresh** action on the view title bar.
- **Start Local Microcks**, **Sign In to Remote Server**, **Import Current API File**, and **Run Dry-Run for API File** commands backed by the Microcks CLI.
- Separate **Selected Server** and **Dry-Run Session** roots in the Services view.
- An **Open Service in Browser** context action on each service.
- An **Operation Inspector** webview with mock invocation, examples, and compare support.

## Architecture at a glance

```text
Developer
  |
  v
VS Code
  |
  v
Microcks Extension
  |
  v
CLI Runner
  |
  v
microcks-cli
  |
  +--> Docker/Podman + ephemeral Microcks for dry-run sessions
  |
  +--> Local or remote Microcks server for connected workflows
```

The extension consumes machine-readable CLI output, including JSON documents
for completed commands and newline-delimited JSON events for watched dry-run
sessions. It does not parse human terminal output and does not read CLI
credentials.

See [Architecture](docs/architecture.md) for the CLI boundary, runtime
requirements, output contracts, state model, and workflow diagrams.
Maintainers can use [Publishing](docs/publishing.md) for Marketplace ownership,
release preparation, automated publishing, recovery, and verification.

## Roadmap

- [x] Activity Bar container and Microcks sidebar
- [x] Services tree backed by CLI JSON
- [x] Selected server and dry-run session roots
- [x] Import current API file
- [x] Start local Microcks
- [x] Connect to remote Microcks through CLI contexts
- [x] Run one-shot and watched dry-run tests
- [x] Operation Inspector with mock invocation, examples, and compare support
- [x] Dry-run tests tree navigation, result details, and service filtering
- [x] Authentication and context management UX
- [ ] Browse test runs stored on a connected server (see [Deferred](#deferred))
- [ ] Add richer mock management actions
- [ ] Add Explorer and editor-title integration for supported API artifacts
- [ ] Publish marketplace screenshots for sidebar, diagnostics, command palette,
  dry-run execution, and Inspector flows
- [ ] Explore AI-assisted API testing workflows after the core extension
  experience is stable

## Deferred

**Browsing test runs from a connected server** is deferred to a future release.

The extension previously showed a **Selected Server** root in its Tests view,
backed by `microcks test list --output json`. That command cannot work against a
Microcks server today: it requests `GET /api/tests`, but the server only exposes
`GET /api/tests/service/{serviceId}` for listing and reserves `POST /api/tests`
for creating a run, so every call returns HTTP 405. The CLI's own tests mock
`/api/tests`, which kept the mismatch from surfacing before release 1.0.3.

Listing also has no unfiltered form to fall back on: the server can only return
tests one service at a time, so the tree's default "all services" load has no
endpoint behind it at all.

Rather than ship a view that always renders an error, the connected root and the
`test.list.json` / `test.get.json` capability requirements were removed. The
**Dry-Run Tests** view keeps every result produced by a dry-run session, which
comes from the CLI event stream and is unaffected.

Reintroducing it needs a CLI change first — `test list` calling the per-service
endpoint and requiring a service id. `microcks test get` already works and can
stay as is.

## Marketplace media checklist

The Marketplace listing should eventually show the product in use rather than
only describe it. Useful screenshots include:

- Microcks Activity Bar and Services tree
- Problems panel or diagnostics surfaced from a contract test
- Command Palette entries for start, connect, import, and dry-run
- Dry-run output and Dry-Run Tests tree state
- Operation Inspector request, response, examples, and compare flow

## Test Locally

### Fast Smoke Test

Use this when you only want to confirm that the extension activates and the VS
Code contributions are wired correctly.

1. **Install dependencies and compile:**
   ```bash
   npm install
   npm run compile
   ```
2. **Open `microcks-vscode/` in VS Code.**
3. **Press F5** and choose the existing **Run Extension** launch config.
4. **In the Extension Development Host window, click the Microcks icon** in the Activity Bar.

Expected result without any Microcks server:

- The extension activates without errors.
- The Microcks Activity Bar container appears.
- The Services view renders action rows instead of a dead-end error.
- Command Palette entries such as `Microcks: Start Local Server`,
  `Microcks: Sign In to Remote Server`, and
  `Microcks: Run Dry-Run for API File` are available.

### Install or Update the CLI

The extension can download the latest stable Microcks CLI release for the
current operating system. Use any of these entry points:

- Click the package icon in the Services view header.
- Run **Microcks: Install or Update CLI** from the Command Palette.
- Use **Install Microcks CLI** or **Update Microcks CLI** from a recovery row
  when the CLI is missing or incompatible.

The extension asks for confirmation, downloads the matching release asset,
verifies its checksum when one is published, stores it in VS Code extension
storage, and selects it as the managed CLI. `microcks.cliPath` continues to take
precedence when explicitly configured.

For faster iteration while editing TypeScript, run this in a terminal before
pressing F5:

```bash
npm run watch
```

### Choose a Local Workflow

After pressing **F5**, use the second VS Code window, the one titled
**Extension Development Host**.

#### Option A: No Long-Running Server

Use this when you want to test the extension UI or run a dry-run against an API
file on disk.

1. Open a saved OpenAPI, AsyncAPI, GraphQL, Postman, or SoapUI file, or be ready
   to choose one from a file picker.
2. Click the Microcks icon in the Activity Bar.
3. Click **Run Dry-Run for API File** in the Services view, or run
   `Microcks: Run Dry-Run for API File` from the Command Palette.
4. Enter:
   - the Microcks service/version, usually prefilled from the file, for example `E-Commerce Platform API:2.0.0`
   - the target endpoint to test, for example `http://localhost:3001`
   - the runner type, usually preselected from the file, for example `OPEN_API_SCHEMA`
   - the operations to test, or no selection to test all operations
   - the dry-run mode: **Run once** or **Watch and browse ephemeral Microcks**

For a local demo in this workspace, start the target API first:

```bash
npm run example:demo-api
```

Then choose this artifact in the file picker:

```text
examples/demo-api/ecommerce-api-openapi.yml
```

When asked which operations to test, select `GET /products`. The demo target API
implements only a subset of the ecommerce spec, so filtering keeps the first
smoke test focused.

The extension does not upload the file to a remote Microcks server.

In **Run once** mode, it runs `microcks test --dry-run --artifact ...`, streams
the result to the **Microcks Dry-Run** output channel, shows a pass/fail
notification, and the CLI tears the temporary container down.

In **Watch and browse ephemeral Microcks** mode, it runs
`microcks test --dry-run --watch --output json` and consumes the CLI's
structured event stream. The Services and Dry-Run Tests trees attach to the
ephemeral server and retain stale results after it stops. Use
`Microcks: Stop Dry-Run Watch` when you are done.

This path depends on a `microcks` CLI that includes the D1 dry-run feature.

#### Option B: Start Local Microcks from VS Code

Use this when you want the extension to browse imported services and invoke
mocks against a local Microcks instance.

1. Click **Start Local Microcks** in the Services view, or run
   `Microcks: Start Local Server`.
2. Wait for Microcks to become reachable at `http://localhost:8585`.
3. The extension auto-connects and refreshes the Services view.
4. Expand services and operations once they load.

This runs `microcks start`, streams logs to the **Microcks Local Server** output
channel, and auto-connects only after the CLI start command succeeds. If the
server starts empty, the Services tree can still show no services until an
artifact is imported into that server.

#### Option C: Sign In to a Remote Microcks Server

Use this when your team already has a shared Microcks instance.

1. Click **Sign In to Remote Server** in the Services view, or run
   `Microcks: Sign In to Remote Server`.
2. Enter the remote Microcks URL and an optional context name.
3. Choose browser SSO or no authentication for an unsecured local/dev server.
4. The CLI creates/selects its context, and the extension refreshes the
   Services view.

Use **Microcks: Switch Context** to select saved contexts, start a local server,
sign in to another server, sign out while keeping a profile, or remove the
current profile. Selecting a context does not imply that its server is online;
the Services tree reports `checking`, `reachable`, or `unreachable` from real
requests.

### Full Server-Backed Manual Test

Use this when you want to exercise the Services tree, mock invocation,
Inspector, examples, and compare flow.

1. **Start Microcks and register a CLI context:**
   ```bash
   microcks start
   ```
   This boots a container, registers a context in `~/.config/microcks/config`, and exposes the server (default `http://localhost:8585`).
2. **Compile and launch the extension:**
   ```bash
   npm run compile
   ```
   Then press **F5** from VS Code.
3. **Open the Microcks view** from the Activity Bar.
4. **Verify the Services tree:**
   - Services load from the active CLI context.
   - Expanding a service loads its operations.
   - Refresh reloads the tree.
5. **Verify service actions:**
   - Right-click a service and run **Open Service in Browser**.
   - Right-click an operation and run **Copy Mock URL**.
6. **Verify mock invocation:**
   - Click a simple `GET` operation without path parameters.
   - A response document opens with the mock response.
7. **Verify the Inspector:**
   - Right-click an operation and run **Open in Inspector**.
   - Click **Send** to call the mock.
   - Click a Microcks example in the right rail, if examples exist for that operation.
   - Click **Send & compare with real service** and provide a local service URL when available.

### What Needs a Server?

No long-running Microcks server required:

- seeing the Microcks Activity Bar view
- seeing the recovery and action rows
- launching **Start Local Microcks** or **Sign In to Remote Server**
- running a dry-run, provided a container runtime and real target API are available

CLI and connected Microcks server required:

- loading imported services with `microcks service list --output json`
- expanding service operations with `microcks service get --output json`
- invoking mocks
- loading Microcks examples in the Inspector
- comparing mock responses with a real service
- importing the current API file into the connected server

The extension checks `microcks capabilities --output json` before using CLI
workflows. If the CLI is missing or incompatible, both views remain visible and
offer a prompted managed install, **Set Microcks CLI Path**, and settings
actions. It does not fall back to the Microcks management REST API.

## How it works

```
microcks-vscode/
  examples/demo-api/        # runnable contract-test target and OpenAPI artifact
  media/                    # Activity Bar and package icons
  design/                   # Static design references, excluded from package
  dist/                     # Bundled extension entrypoint emitted by esbuild
  src/
    extension.ts            # activate() - registers VS Code contribution entrypoints
    cli/                    # CLI execution, capability gate, and JSON contracts
    commands/
      index.ts              # registers all command handlers
      *Command files        # one command handler per file
    config/
      configReader.ts       # resolves the config path passed to the CLI
    mocks/
      mockClient.ts         # builds and invokes user-facing mock URLs
    services/
      serviceDataSource.ts  # CLI-backed Services tree data source
    utils/
      artifact.ts           # extracts API metadata and operations from spec files
      json.ts
      shell.ts              # runs CLI commands and streams output
    test/
      extension.test.ts
    views/
      index.ts              # registers VS Code views
      services/
        servicesProvider.ts # Services TreeDataProvider
        nodes.ts            # Services tree item nodes
      tests/
        testsProvider.ts    # dry-run Tests TreeDataProvider
        nodes.ts            # Tests tree item nodes
    webviews/
      inspectorPanel.ts     # Operation Inspector webview
```

## Configuration

- `microcks.cliPath` — path to the Microcks CLI executable used for service
  and test metadata and all Microcks control-plane workflows. A configured path
  takes precedence over the extension-managed CLI and `microcks` on `PATH`.
  The setting is **machine scoped**: it is read from your User (or Remote)
  settings only. A value placed in a workspace or folder `.vscode/settings.json`
  is ignored, and the extension warns you when it finds one. Use **Microcks: Set
  CLI Path**, which always writes to your user settings.
- `microcks.containerDriver` — container runtime for dry-run tests and **Start
  Local Server**: `auto` (default), `docker`, or `podman`. Anything but `auto`
  is passed to the CLI as `--driver`.

  Set this to `podman` if you run Podman on a machine that also has Docker
  installed. The CLI only auto-detects Podman when Docker is *absent*, so with
  both present it picks Docker, and a dry-run against a stopped Docker daemon
  fails while the container is being created.
- `MICROCKS_CONFIG_DIR` — config directory passed through to the CLI. Defaults
  to `~/.config/microcks`.

## Workspace trust

The extension runs the Microcks CLI as a child process against files in the open
folder, so it declares limited support for untrusted workspaces:

- In a **restricted** workspace the extension activates but never starts the
  CLI. The Services and Tests views explain this and offer **Manage Workspace
  Trust**.
- `microcks.cliPath` is listed as a restricted configuration, so an untrusted
  folder cannot influence which executable would be run.
- Trusting the folder refreshes both views automatically.
