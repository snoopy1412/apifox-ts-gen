import { homedir } from "node:os";
import { join, normalize, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const windowsDrivePattern = /^[a-zA-Z]:[\\/]/;

/**
 * Resolve a path from the configuration file so that common authoring shorthand
 * (leading slashes, tildes) map to project-relative directories.
 */
export function resolveConfigPath(
  rawPath: string,
  configDir: string,
  projectRoot: string
): string {
  if (!rawPath) return rawPath;

  let value = rawPath.trim();
  if (!value) return value;

  if (value.startsWith("file://")) {
    return fileURLToPath(value);
  }

  if (value.startsWith("~")) {
    return normalize(join(homedir(), value.slice(1)));
  }

  if (windowsDrivePattern.test(value)) {
    return normalize(value);
  }

  if (value.startsWith("//")) {
    return normalize("/" + value.replace(/^\/+/, ""));
  }

  if (value.startsWith("/")) {
    const relativePart = value.replace(/^\/+/, "");
    return normalize(join(projectRoot, relativePart));
  }

  if (isAbsolute(value)) {
    return normalize(value);
  }

  return normalize(resolve(configDir, value));
}
