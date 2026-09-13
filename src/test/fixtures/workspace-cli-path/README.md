# workspace-cli-path fixture

Opened by the integration tests as the workspace folder. Its
`.vscode/settings.json` plays the role of a repository trying to point
`microcks.cliPath` at an executable of its choosing (issue #2), and the tests
assert that value never becomes the executable the extension would spawn.

`files.eol` is the control: it is not machine scoped, so it proves this file
really is applied to the test window.
