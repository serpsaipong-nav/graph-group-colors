export interface ColorGroup {
  query: string;
  color: {
    rgb: number;
    a?: number;
  };
}

export interface GraphConfig {
  colorGroups?: ColorGroup[];
}

export interface GroupColorMatch {
  rgb: number;
  alpha: number;
  query: string;
}

export interface GroupResolverOptions {
  maxColorsPerNode?: number;
}

interface NoteContext {
  path: string;
  tags: readonly string[];
}

function normalizeTag(tag: string): string {
  const trimmed = tag.trim();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export class GroupResolver {
  private groups: ColorGroup[] = [];
  private maxColorsPerNode: number;

  constructor(options: GroupResolverOptions = {}) {
    this.maxColorsPerNode = Math.max(2, Math.floor(options.maxColorsPerNode ?? 6));
  }

  setMaxColorsPerNode(maxColorsPerNode: number): void {
    this.maxColorsPerNode = Math.max(2, Math.floor(maxColorsPerNode));
  }

  loadGroups(config: GraphConfig): void {
    this.groups = Array.isArray(config.colorGroups) ? config.colorGroups.slice() : [];
  }

  resolveForFile(path: string, tags: readonly string[]): GroupColorMatch[] {
    const context: NoteContext = { path, tags };
    const results: GroupColorMatch[] = [];

    for (const group of this.groups) {
      if (results.length >= this.maxColorsPerNode) {
        break;
      }
      if (!group?.query || !group?.color || typeof group.color.rgb !== "number") {
        continue;
      }

      if (this.matchesQuery(group.query, context)) {
        results.push({
          rgb: group.color.rgb,
          alpha: typeof group.color.a === "number" ? group.color.a : 1,
          query: group.query
        });
      }
    }

    return results;
  }

  private matchesQuery(query: string, context: NoteContext): boolean {
    const terms = query
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 0);

    if (terms.length === 0) {
      return false;
    }

    for (const term of terms) {
      const negated = term.startsWith("-");
      const normalizedTerm = negated ? term.slice(1) : term;
      const matched = this.matchesTerm(normalizedTerm, context);
      if (negated ? matched : !matched) {
        return false;
      }
    }

    return true;
  }

  private matchesTerm(term: string, context: NoteContext): boolean {
    if (term.startsWith("tag:")) {
      const tagQuery = normalizeTag(term.slice(4));
      return context.tags.some((tag) => {
        const normalized = normalizeTag(tag);
        return normalized === tagQuery || normalized.startsWith(`${tagQuery}/`);
      });
    }
    if (term.startsWith("path:")) {
      const queryPath = this.unquote(term.slice(5)).trim();
      return queryPath.length > 0 && context.path.includes(queryPath);
    }
    if (term.startsWith("file:")) {
      const queryFile = this.unquote(term.slice(5)).trim();
      const fileName = context.path.split("/").at(-1) ?? context.path;
      return queryFile.length > 0 && fileName.includes(queryFile);
    }
    return false;
  }

  private unquote(value: string): string {
    if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) {
      return value.slice(1, -1);
    }
    return value;
  }
}
