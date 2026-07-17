import { buildDependencyGraph } from './graph.js';
import type { WalkOptions } from './graph.js';
import { resolvePackage } from './registry.js';

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';

type OsvQuery = {
  package: { name: string; ecosystem: 'npm' };
  version: string;
};

type OsvBatchResponse = {
  results: Array<{ vulns?: Array<{ id: string }> }>;
};

export type VulnerablePackage = {
  key: string;
  name: string;
  version: string;
  vulnerabilities: string[];
};

export type AuditResult = {
  root: string;
  scanned: number;
  vulnerablePackages: VulnerablePackage[];
  totalVulnerabilities: number;
};

/**
 * Walk a package's dependency graph and check every resolved version against
 * the OSV vulnerability database (batch query, no auth required).
 */
export async function auditDependencies(
  spec: string,
  options: WalkOptions = {},
): Promise<AuditResult> {
  const graph = await buildDependencyGraph(spec, options);
  const advisories = await auditNodes(graph.nodes);

  const vulnerablePackages: VulnerablePackage[] = [];
  let totalVulnerabilities = 0;
  for (const node of graph.nodes) {
    const ids = advisories.get(node.key);
    if (!ids?.length) continue;
    totalVulnerabilities += ids.length;
    vulnerablePackages.push({
      key: node.key,
      name: node.name,
      version: node.version,
      vulnerabilities: ids,
    });
  }

  return {
    root: graph.root,
    scanned: graph.nodes.length,
    vulnerablePackages,
    totalVulnerabilities,
  };
}

/**
 * Look up OSV advisories for an already-resolved set of nodes (no walking).
 * Returns a map of module key → advisory ids for the vulnerable ones.
 */
export async function auditNodes(
  nodes: Array<{ key: string; name: string; version: string }>,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (nodes.length === 0) return out;

  const queries: OsvQuery[] = nodes.map(node => ({
    package: { name: node.name, ecosystem: 'npm' },
    version: node.version,
  }));

  const response = await fetch(OSV_BATCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ queries }),
  });
  if (!response.ok) {
    throw new Error(
      `OSV query failed: ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as OsvBatchResponse;

  data.results.forEach((result, index) => {
    const ids = result.vulns?.map(v => v.id) ?? [];
    if (ids.length > 0) out.set(nodes[index].key, ids);
  });
  return out;
}

export type DependencyDiff = {
  from: string;
  to: string;
  added: Array<{ name: string; version: string }>;
  removed: Array<{ name: string; version: string }>;
  changed: Array<{ name: string; from: string; to: string }>;
  unchanged: number;
};

/** Pure diff of two dependency maps (no network). */
export function diffDependencies(
  depsA: Record<string, string> | undefined,
  depsB: Record<string, string> | undefined,
): Pick<DependencyDiff, 'added' | 'removed' | 'changed' | 'unchanged'> {
  const a = depsA ?? {};
  const b = depsB ?? {};
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);

  const added: DependencyDiff['added'] = [];
  const removed: DependencyDiff['removed'] = [];
  const changed: DependencyDiff['changed'] = [];
  let unchanged = 0;

  for (const name of [...names].sort()) {
    const inA = a[name];
    const inB = b[name];
    if (inA && !inB) removed.push({ name, version: inA });
    else if (!inA && inB) added.push({ name, version: inB });
    else if (inA && inB && inA !== inB)
      changed.push({ name, from: inA, to: inB });
    else unchanged++;
  }

  return { added, removed, changed, unchanged };
}

/** Diff the direct dependencies of two package specs (e.g. two versions). */
export async function comparePackages(
  specA: string,
  specB: string,
): Promise<DependencyDiff> {
  const [a, b] = await Promise.all([
    resolveSpec(specA),
    resolveSpec(specB),
  ]);

  const { added, removed, changed, unchanged } = diffDependencies(
    a.dependencies,
    b.dependencies,
  );

  return {
    from: `${a.name}@${a.version}`,
    to: `${b.name}@${b.version}`,
    added,
    removed,
    changed,
    unchanged,
  };
}

async function resolveSpec(spec: string) {
  const at = spec.lastIndexOf('@');
  const name = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : 'latest';
  return resolvePackage(name, version);
}
