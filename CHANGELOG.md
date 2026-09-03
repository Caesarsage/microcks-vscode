# Change Log

All notable changes to the Microcks VS Code extension will be documented in this file.

## [Unreleased]

- Added CLI-backed Services and Tests trees, local/remote context flows, structured dry-run watch sessions, managed CLI installation, API import, and the Operation Inspector.
- Added `microcks.containerDriver` (`auto` / `docker` / `podman`), passed to the CLI as `--driver` for dry-run tests and Start Local Server. Podman users on machines that also have Docker installed previously had no way to run either, because the CLI only auto-detects Podman when Docker is absent.
- A dry-run watch that exits non-zero now reports an error instead of a neutral "exited with code N" notification, and one that dies before its `ready` event points at the container runtime and offers to open the driver setting.
- Deferred browsing test runs from a connected server to a future release. `microcks test list` requests `GET /api/tests`, which Microcks answers with HTTP 405, so the Tests view's **Selected Server** root could never load. The view is now **Dry-Run Tests** and shows dry-run session results only; the `test.list.json` and `test.get.json` capability requirements were dropped. See "Deferred" in the README.
