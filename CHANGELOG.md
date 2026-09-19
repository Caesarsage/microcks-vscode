# Change Log

All notable changes to the Microcks VS Code extension will be documented in this file.

## [Unreleased]

- Added CLI-backed Services and Tests trees, local/remote context flows, structured dry-run watch sessions, managed CLI installation, API import, and the Operation Inspector.
- Added `microcks.containerDriver` (`auto` / `docker` / `podman`), passed to the CLI as `--driver` for dry-run tests and Start Local Server. Podman users on machines that also have Docker installed previously had no way to run either, because the CLI only auto-detects Podman when Docker is absent.
- A dry-run watch that exits non-zero now reports an error instead of a neutral "exited with code N" notification, and one that dies before its `ready` event points at the container runtime and offers to open the driver setting.
- Deferred browsing test runs from a connected server to a future release. `microcks test list` requests `GET /api/tests`, which Microcks answers with HTTP 405, so the Tests view's **Selected Server** root could never load. The view is now **Dry-Run Tests** and shows dry-run session results only; the `test.list.json` and `test.get.json` capability requirements were dropped. See "Deferred" in the README.

### Security

- Fixed arbitrary code execution from an untrusted workspace via
  `microcks.cliPath` ([#2](https://github.com/Caesarsage/microcks-vscode/issues/2)).
  The setting is now `machine` scoped, so a repository's
  `.vscode/settings.json` can no longer choose the executable the extension
  spawns: VS Code filters the value out and flags it in the settings editor,
  and the resolver reads the user value only. **Microcks: Set CLI Path** now
  writes to user settings.
- Declared `capabilities.untrustedWorkspaces` (`limited`) and stopped starting
  the Microcks CLI while the window is in restricted mode. The Services view
  explains restricted mode and links to workspace trust management, and
  refreshes once trust is granted; the dry-run and CLI installation commands
  ask for trust before running.
