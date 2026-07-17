import type { PackageVersion } from './registry.js';
import { resolvePackage } from './registry.js';

export type DependencyKey =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

export type GraphEdge = { from: string; to: string; type: DependencyKey };

export type GraphNode = {
  key: string; // name@version
  name: string;
  version: string;
  level: number;
  deprecated: boolean;
  unpackedSize?: number;
  license?: string;
  /** Number of known OSV advisories (set by enrichment, not the walker). */
  vulnerabilities?: number;
};

export type NodeCategory =
  | 'root'
  | 'transitive'
  | 'deprecated'
  | 'vulnerable';

/** Classify a node for coloring. Priority: unsafe > broken > direct > transitive. */
export function nodeCategory(node: GraphNode): NodeCategory {
  if (node.vulnerabilities && node.vulnerabilities > 0) return 'vulnerable';
  if (node.deprecated) return 'deprecated';
  if (node.level === 0) return 'root';
  return 'transitive';
}

/** Fill colors per category — light enough for dark node labels on both themes. */
export const CATEGORY_FILL: Record<NodeCategory, string> = {
  root: '#aec6f6',
  transitive: '#eef1f5',
  deprecated: '#f7d68a',
  vulnerable: '#f2b1ad',
};

export type DependencyGraph = {
  root: string;
  nodeCount: number;
  edgeCount: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type WalkOptions = {
  /** Which dependency kinds to follow at the top level. Deeper levels only
   * follow "dependencies" (mirrors npmgraph's web UI behavior). */
  dependencyTypes?: DependencyKey[];
  /** Maximum depth to traverse (root = 0). Default 10. */
  maxDepth?: number;
  /** Hard cap on nodes to avoid runaway graphs. Default 750. */
  maxNodes?: number;
};

const moduleKey = (name: string, version: string) => `${name}@${version}`;

function licenseString(license: unknown): string | undefined {
  if (typeof license === 'string') return license;
  if (license && typeof license === 'object' && 'type' in license) {
    return String((license as { type: unknown }).type);
  }
  return undefined;
}

/**
 * Walk the npm dependency graph for a package spec and return a flat
 * node/edge representation.
 */
export async function buildDependencyGraph(
  spec: string,
  options: WalkOptions = {},
): Promise<DependencyGraph> {
  const topLevelTypes = new Set<DependencyKey>(
    options.dependencyTypes?.length
      ? options.dependencyTypes
      : ['dependencies'],
  );
  // "dependencies" is always followed.
  topLevelTypes.add('dependencies');

  const maxDepth = options.maxDepth ?? 10;
  const maxNodes = options.maxNodes ?? 750;

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const scheduled = new Set<string>(); // module keys we've queued a visit for
  const pending = new Set<Promise<void>>(); // in-flight visit promises

  const { name, version } = parseSpec(spec);
  const rootPkg = await resolvePackage(name, version);
  const rootKey = moduleKey(rootPkg.name, rootPkg.version);

  function entriesFor(pkg: PackageVersion, level: number) {
    const types: DependencyKey[] =
      level === 0 ? [...topLevelTypes] : ['dependencies'];
    const out: { name: string; spec: string; type: DependencyKey }[] = [];
    for (const type of types) {
      const deps = pkg[type];
      if (!deps) continue;
      for (const [depName, depSpec] of Object.entries(deps)) {
        // Skip optional peer deps
        if (
          type === 'peerDependencies' &&
          pkg.peerDependenciesMeta?.[depName]?.optional
        ) {
          continue;
        }
        out.push({ name: depName, spec: depSpec, type });
      }
    }
    return out;
  }

  // Schedule a package for visiting exactly once. We deliberately do NOT await
  // a child's subtree from inside its parent — that inline await deadlocks on
  // dependency cycles (A waits on B while B waits on A). Instead every visit is
  // tracked in `pending` and drained at the top level, so cycles are harmless.
  function schedule(pkg: PackageVersion, level: number): void {
    const key = moduleKey(pkg.name, pkg.version);
    if (scheduled.has(key)) return;
    scheduled.add(key);
    const p = visit(pkg, level)
      .catch(() => {
        // A failed subtree shouldn't abort the whole walk.
      })
      .finally(() => pending.delete(p));
    pending.add(p);
  }

  async function visit(pkg: PackageVersion, level: number): Promise<void> {
    const key = moduleKey(pkg.name, pkg.version);
    if (nodes.size >= maxNodes) return;

    nodes.set(key, {
      key,
      name: pkg.name,
      version: pkg.version,
      level,
      deprecated: Boolean(pkg.deprecated),
      unpackedSize: pkg.dist?.unpackedSize,
      license: licenseString(pkg.license),
    });

    if (level >= maxDepth) return;

    await Promise.all(
      entriesFor(pkg, level).map(async ({ name: depName, spec: depSpec, type }) => {
        let child: PackageVersion;
        try {
          child = await resolvePackage(depName, depSpec);
        } catch {
          // Unresolvable dependency (e.g. private/removed) — skip silently.
          return;
        }
        const childKey = moduleKey(child.name, child.version);
        edges.push({ from: key, to: childKey, type });
        if (nodes.size < maxNodes) schedule(child, level + 1);
      }),
    );
  }

  // Drain: visits enqueue more visits, so loop until nothing is in flight.
  schedule(rootPkg, 0);
  while (pending.size > 0) {
    await Promise.all([...pending]);
  }

  // Drop edges that point at modules excluded by the node cap.
  const keptEdges = edges.filter(e => nodes.has(e.from) && nodes.has(e.to));

  return {
    root: rootKey,
    nodeCount: nodes.size,
    edgeCount: keptEdges.length,
    nodes: [...nodes.values()],
    edges: keptEdges,
  };
}

function parseSpec(spec: string): { name: string; version: string } {
  // Handle scoped packages: @scope/name@version
  const at = spec.lastIndexOf('@');
  if (at > 0) {
    return { name: spec.slice(0, at), version: spec.slice(at + 1) };
  }
  return { name: spec, version: 'latest' };
}

const EDGE_ATTRS: Record<DependencyKey, string> = {
  dependencies: '[color=black]',
  devDependencies: '[color=black]',
  peerDependencies: '[color=black style=dashed label="peer"]',
  optionalDependencies: '[color=black style=dashed]',
};

/** Render a dependency graph as Graphviz DOT (compatible with npmgraph). */
export function graphToDot(graph: DependencyGraph): string {
  const dotEscape = (s: string) => s.replaceAll('"', '\\"');
  const lines = [
    'digraph {',
    'rankdir="LR"',
    'node [shape=box style="rounded,filled" fontname="Roboto Condensed, sans-serif" fontsize=11 color="#8a94a6"]',
    'edge [fontsize=10]',
    '',
    '// Nodes',
  ];
  for (const node of graph.nodes) {
    const cat = nodeCategory(node);
    // `class` lets the interactive HTML style by category; fillcolor makes the
    // plain SVG/PNG render colored too. Root gets a heavier border.
    const attrs = [
      `class="npmg-${cat}"`,
      `fillcolor="${CATEGORY_FILL[cat]}"`,
      ...(cat === 'root' ? ['penwidth=2', 'color="#4f6bed"'] : []),
      ...(node.vulnerabilities
        ? [`tooltip="${node.vulnerabilities} advisory(ies)"`]
        : []),
    ].join(' ');
    lines.push(`"${dotEscape(node.key)}" [${attrs}]`);
  }
  lines.push('', '// Edges');
  for (const edge of graph.edges) {
    lines.push(
      `"${dotEscape(edge.from)}" -> "${dotEscape(edge.to)}" ${EDGE_ATTRS[edge.type]}`,
    );
  }
  lines.push('}');
  return lines.join('\n');
}
