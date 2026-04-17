import type { GroupColorMatch } from "./GroupResolver";

export class ColorCache {
  private readonly cache = new Map<string, GroupColorMatch[]>();

  get(path: string): GroupColorMatch[] | null {
    const hit = this.cache.get(path);
    return hit ? hit.slice() : null;
  }

  set(path: string, colors: readonly GroupColorMatch[]): void {
    this.cache.set(path, colors.slice());
  }

  invalidatePath(path: string): void {
    this.cache.delete(path);
  }

  handleRename(oldPath: string, newPath: string): void {
    const oldEntry = this.cache.get(oldPath);
    this.cache.delete(oldPath);
    if (oldEntry) {
      this.cache.set(newPath, oldEntry);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
