import typescriptEslint from "typescript-eslint";
import globals from "globals";

const sharedRules = {
  curly: "warn",
  eqeqeq: "warn",
  "no-throw-literal": "warn",
  semi: "warn"
};

export default [
  {
    files: ["**/*.ts"]
  },
  {
    plugins: {
      "@typescript-eslint": typescriptEslint.plugin
    },
    languageOptions: {
      parser: typescriptEslint.parser,
      ecmaVersion: 2022,
      sourceType: "module"
    },
    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "import",
          format: ["camelCase", "PascalCase"]
        }
      ],
      ...sharedRules
    }
  },
  {
    // Webview scripts run in the browser, not in the extension host.
    files: ["webview-ui/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        acquireVsCodeApi: "readonly"
      }
    },
    rules: {
      ...sharedRules,
      "no-undef": "error",
      "no-unused-vars": "warn"
    }
  }
];
