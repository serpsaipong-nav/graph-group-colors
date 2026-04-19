/**
 * Normalize graph renderer `node.id` before `normalizePath()` from Obsidian.
 * Graph ids are usually vault-relative paths but can include `./`, backslashes,
 * or stray leading slashes depending on version and platform.
 */
export function preNormalizeGraphNodeId(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("./")) {
    s = s.slice(2);
  }
  s = s.replace(/\\/g, "/");
  while (s.startsWith("/")) {
    s = s.slice(1);
  }
  return s;
}
