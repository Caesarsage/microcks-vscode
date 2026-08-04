import * as os from "os";
import * as path from "path";

/**
 * Path passed to the CLI. The extension never reads credentials or contexts
 * from this file; those remain owned by Microcks CLI commands.
 */
export function defaultConfigPath(): string {
  const envDir = process.env.MICROCKS_CONFIG_DIR;
  if (envDir) {
    return path.join(envDir, "config");
  }
  return path.join(os.homedir(), ".config", "microcks", "config");
}
