# Publishing the Microcks VS Code Extension

This runbook is for Microcks maintainers publishing a release of the editor
extension. It covers the Visual Studio Marketplace, Open VSX, and direct VSIX
distribution.

## What is published

The release artifact is a single `.vsix` package identified by the following
fields in `package.json`:

```text
publisher: microcks
name:      microcks-vscode
id:        microcks.microcks-vscode
```

The same VSIX is published to:

- **Visual Studio Marketplace**, the extension registry used by VS Code.
- **Open VSX**, a vendor-neutral registry for editors that use the VS Code
  extension format and are configured to consume Open VSX.
- Optionally, a **GitHub release** for direct installation or testing.

These registries distribute only the editor extension. They do not publish or
bundle the Microcks CLI, a Microcks server, or its container images. At runtime,
the extension locates a compatible CLI configured by the user, installed by the
extension's managed installer, or available on `PATH`. CLI and server releases
remain independent Microcks release processes.

This is not a JetBrains, Eclipse IDE, browser, or standalone desktop extension.
Supporting a different extension API requires a separate integration even when
it can reuse the same Microcks CLI JSON contracts.

## One-time publisher setup

### Visual Studio Marketplace

1. Confirm that the Microcks organization owns or can create the Marketplace
   publisher ID `microcks`. The `publisher` value in `package.json` must match
   that ID exactly.
2. Add the release maintainers or publishing identity to the publisher.
3. Configure automated publishing authentication.

The current GitHub workflow reads a `VSCE_PAT` secret. For this interim setup,
create an Azure DevOps token for **all accessible organizations** with only the
**Marketplace (Manage)** scope and store it in the protected GitHub environment
described below.

> **Migration required:** Microsoft states that global Azure DevOps PATs will
> stop working for this purpose on December 1, 2026. Before that date, replace
> `VSCE_PAT` publishing with Microsoft Entra ID workload identity federation and
> invoke `vsce publish --azure-credential`. Do not introduce a new long-lived
> PAT as the permanent release design.

See the official
[VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
for publisher creation and current authentication instructions.

### Open VSX

1. Create an Eclipse account with the publisher's GitHub username.
2. Sign in to Open VSX and accept the Publisher Agreement.
3. Generate an Open VSX access token for CI.
4. Create or claim the `microcks` namespace. Namespace ownership should belong
   to the Microcks organization rather than an individual maintainer.
5. Store the token as `OVSX_PAT` in the protected GitHub environment.

Open VSX recommends a separate token for each publishing environment. See the
official
[Open VSX publishing guide](https://github.com/EclipseFdn/open-vsx.org/wiki/Publishing-Extensions)
for account, agreement, namespace, and token management.

### GitHub environment

Create an environment named `marketplace` in the `microcks-vscode` repository.
Configure required reviewers for releases and add these environment secrets:

| Secret | Used for |
| --- | --- |
| `VSCE_PAT` | Visual Studio Marketplace publishing until Entra migration |
| `OVSX_PAT` | Open VSX publishing |

Never commit either value or pass it literally on a command line. Rotate a
token immediately if logs or a package expose it.

## Prepare a release

1. Update `CHANGELOG.md` with the user-visible changes.
2. Set the release version in `package.json` and `package-lock.json`. Published
   versions cannot be overwritten, so every release needs a new SemVer version.
3. Confirm that the `publisher`, `name`, `icon`, repository, license, and
   `engines.vscode` metadata are correct.
4. Run the local release checks from the extension root:

```bash
npm ci
npm audit --audit-level=high
npm test
npm run package:vsix
```

`npm run package:vsix` runs the pre-publish compile and lint checks and creates
`microcks-vscode-<version>.vsix`. Install that exact file into a clean VS Code
profile for a final smoke test:

```bash
code --install-extension microcks-vscode-<version>.vsix
```

Verify activation, both tree views, the missing/incompatible CLI recovery UI,
managed CLI installation, a connected service listing, and a dry-run session.

## Publish from a tag

The release workflow in `.github/workflows/release.yml` is the normal publishing
path. It packages once and sends the exact same VSIX to both registries.

1. Merge the reviewed release changes and wait for the main-branch CI checks.
2. Create a signed tag whose version matches `package.json`:

```bash
git tag -s v0.1.0 -m "microcks-vscode v0.1.0"
git push origin v0.1.0
```

3. Open the **Release** GitHub Actions run and approve the `marketplace`
   environment deployment when prompted.
4. Confirm that both publishing steps complete. The commands use
   `--skip-duplicate`, so rerunning a partially successful workflow does not
   fail merely because one registry already received that version.

The tag and `package.json` version are separate inputs. Check that they match
before pushing because the Marketplace version comes from the VSIX manifest,
not from the Git tag.

## Manual recovery

Use manual publishing only to recover one failed registry after the package has
already passed the release checks. Inject credentials through the environment
or a secret manager, then publish the previously built VSIX:

```bash
npx --no-install vsce publish \
  --packagePath microcks-vscode-<version>.vsix \
  --skip-duplicate

npx --no-install ovsx publish \
  microcks-vscode-<version>.vsix \
  --skip-duplicate
```

`vsce` reads `VSCE_PAT`; `ovsx` reads `OVSX_PAT`. After the Entra migration,
the Visual Studio Marketplace command must use `--azure-credential` instead.

Both registries also support browser-based VSIX upload. Keep the command-line
path as the primary release process because it is repeatable and leaves a CI
record.

## Verify the release

After publishing:

1. Confirm the version and README on the Visual Studio Marketplace listing for
   `microcks.microcks-vscode`.
2. Confirm the same version becomes active on the Open VSX listing for
   `microcks/microcks-vscode`. Open VSX processing is asynchronous, so the
   extension can briefly appear deactivated after upload.
3. Install from VS Code by searching for **Microcks** and check the publisher
   identity before installation.
4. Install from an Open VSX-compatible editor and repeat the activation smoke
   test.
5. Record release notes and attach the VSIX to a GitHub release when direct or
   offline installation is part of the release.

## Correcting a bad release

Do not attempt to replace an already published version. Fix the problem,
increment the patch version, rebuild, test, and publish a new tag.

Visual Studio Marketplace supports unpublishing or deleting versions, but
deletion is irreversible and deleted version numbers cannot be reused. Treat
removal as a security or legal-response action, not the normal rollback path.
Coordinate any Open VSX removal with the same care so the two registries do not
silently diverge.
