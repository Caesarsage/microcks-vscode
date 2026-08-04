export function parseRestOperationName(
  name: string
): { method: string; path: string; hasPathParams: boolean } | null {
  const match = /^([A-Z]+)\s+(.+)$/.exec(name.trim());
  if (!match) {
    return null;
  }
  const [, method, path] = match;
  return { method, path, hasPathParams: /\{[^}]+\}/.test(path) };
}
