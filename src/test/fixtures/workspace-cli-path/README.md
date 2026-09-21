# workspace-cli-path fixture

Opened by the integration tests as the workspace folder. Its
`.vscode/settings.json` plays the role of a repository trying to point
`microcks.cliPath` at an executable of its choosing (issue #2), and the tests
assert that value never becomes the executable the extension would spawn.

`files.eol` is the control: it is not machine scoped, so it proves this file
really is applied to the test window.

Both test windows open this folder: the `vscode-test` run trusts it (that is
where the scope assertions live), and `scripts/test-restricted.mjs` opens it
without trust for the restricted-mode suite in `src/test/restricted`.
