import * as fs from "fs";
import * as yaml from "js-yaml";

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "options",
  "trace",
]);

export interface ArtifactMetadata {
  serviceRef?: string;
  runnerType?: string;
  operations: string[];
}

export function readArtifactMetadata(artifactPath: string): ArtifactMetadata {
  const raw = fs.readFileSync(artifactPath, "utf8");
  const parsed = yaml.load(raw) as Record<string, unknown> | undefined;
  if (!parsed || typeof parsed !== "object") {
    return { operations: [] };
  }

  if (typeof parsed.openapi === "string") {
    return readOpenApiMetadata(parsed);
  }

  if (typeof parsed.asyncapi === "string") {
    return readAsyncApiMetadata(parsed);
  }

  return readPostmanMetadata(parsed);
}

function readOpenApiMetadata(parsed: Record<string, unknown>): ArtifactMetadata {
  const info = readObject(parsed.info);
  const title = readString(info?.title);
  const version = readString(info?.version);
  const paths = readObject(parsed.paths);
  const operations: string[] = [];

  for (const [resourcePath, pathItem] of Object.entries(paths ?? {})) {
    const methods = readObject(pathItem);
    for (const method of Object.keys(methods ?? {})) {
      if (HTTP_METHODS.has(method.toLowerCase())) {
        operations.push(`${method.toUpperCase()} ${resourcePath}`);
      }
    }
  }

  return {
    serviceRef: title && version ? `${title}:${version}` : undefined,
    runnerType: "OPEN_API_SCHEMA",
    operations,
  };
}

function readAsyncApiMetadata(parsed: Record<string, unknown>): ArtifactMetadata {
  const info = readObject(parsed.info);
  const title = readString(info?.title);
  const version = readString(info?.version);

  return {
    serviceRef: title && version ? `${title}:${version}` : undefined,
    runnerType: "ASYNC_API_SCHEMA",
    operations: [],
  };
}

function readPostmanMetadata(parsed: Record<string, unknown>): ArtifactMetadata {
  const info = readObject(parsed.info);
  const name = readString(info?.name);
  return {
    serviceRef: name,
    runnerType: name ? "POSTMAN" : undefined,
    operations: [],
  };
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
