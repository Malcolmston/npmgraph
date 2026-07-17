import { getApiBase } from './savedGraph.ts';

/**
 * Typed client for the Neo4j-backed graph-DB HTTP API (proxied at `/api`
 * behind nginx; base resolved by `getApiBase()`). Every endpoint requires the
 * `graph` compose profile to be running — calls reject with a descriptive
 * Error otherwise so callers can surface a hint to the user.
 */

/** Aggregated node/edge counts returned when persisting one or more packages. */
export type StoreCounts = {
  nodes: number;
  edges: number;
};

/** A dependent module as returned by `GET /api/dependents/:name`. */
export type Dependent = {
  key?: string;
  name?: string;
  version?: string;
};

async function readJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    throw new Error(
      `${action} failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

/**
 * Walk + persist each package into the graph DB (one `POST /api/store` per
 * package), returning the summed node/edge counts across all packages.
 */
async function storeOne(pkg: string): Promise<Partial<StoreCounts>> {
  const response = await fetch(`${getApiBase()}/store`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ package: pkg }),
  });
  return readJson<Partial<StoreCounts>>(response, 'Store');
}

export async function storeGraph(packages: string[]): Promise<StoreCounts> {
  const results = await Promise.all(packages.map(async pkg => storeOne(pkg)));

  const total: StoreCounts = { nodes: 0, edges: 0 };
  for (const counts of results) {
    total.nodes += counts.nodes ?? 0;
    total.edges += counts.edges ?? 0;
  }

  return total;
}

/** Fetch modules that depend on `name`. */
export async function getDependents(name: string): Promise<Dependent[]> {
  const response = await fetch(
    `${getApiBase()}/dependents/${encodeURIComponent(name)}`,
  );
  return readJson<Dependent[]>(response, 'Dependents lookup');
}

/**
 * Fetch the shortest dependency path between two packages, as an ordered array
 * of node names/keys (empty when there is no path).
 */
export async function getShortestPath(
  from: string,
  to: string,
): Promise<string[]> {
  const query = new URLSearchParams({ from, to });
  const response = await fetch(`${getApiBase()}/path?${query.toString()}`);
  return readJson<string[]>(response, 'Path lookup');
}

/** A most-depended-upon module row. */
export type MostDepended = {
  key?: string;
  name?: string;
  count?: number;
};

/** Fetch the most-depended-upon modules in the graph DB. */
export async function getMostDepended(limit = 20): Promise<MostDepended[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(
    `${getApiBase()}/most-depended?${query.toString()}`,
  );
  return readJson<MostDepended[]>(response, 'Most-depended lookup');
}
