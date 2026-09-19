import { readdirSync } from "fs";
import { join } from "path";
import Mocha from "mocha";

/**
 * Entry point for `--extensionTestsPath`. See scripts/test-restricted.mjs for
 * why this suite is launched separately from `vscode-test`.
 */
export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", color: true });
  for (const file of readdirSync(__dirname).filter((name) =>
    name.endsWith(".test.js")
  )) {
    mocha.addFile(join(__dirname, file));
  }

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} restricted-workspace test(s) failed.`));
        return;
      }
      resolve();
    });
  });
}
