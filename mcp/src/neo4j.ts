import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { DependencyGraph } from './graph.js';

// --- Minimal typed surface for prorm's Neo4jStore ---------------------------

interface Neo4jRunResult {
  records: Array<Record<string, unknown>>;
  keys: string[];
}

interface Neo4jStore {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  run(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<Neo4jRunResult>;
}

interface Neo4jStoreOptions {
  uri: string;
  username?: string;
  password?: string;
  database?: string;
}

type Neo4jStoreCtor = new (options: Neo4jStoreOptions) => Neo4jStore;

// prorm eagerly loads its SQL dialects (and native drivers like better-sqlite3)
// from the package root, so we deep-require just the Neo4j store to avoid
// pulling that whole tree in. Loaded lazily so the MCP server can start (and
// serve the registry-backed tools) even without the Neo4j stack present.
let cachedCtor: Neo4jStoreCtor | undefined;

function loadNeo4jStore(): Neo4jStoreCtor {
  if (cachedCtor) return cachedCtor;
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@mstone6969/prorm'); // .../dist/index.js
  const pkgRoot = path.resolve(path.dirname(entry), '..');
  const mod = require(path.join(pkgRoot, 'dist/nosql/neo4j/index.js')) as {
    Neo4jStore: Neo4jStoreCtor;
  };
  cachedCtor = mod.Neo4jStore;
  return cachedCtor;
}

export function neo4jConfigured(): boolean {
  return Boolean(process.env.NEO4J_URI);
}

function createStore(): Neo4jStore {
  const uri = process.env.NEO4J_URI;
  if (!uri) {
    throw new Error(
      'Neo4j is not configured. Set NEO4J_URI (and NEO4J_USER / NEO4J_PASSWORD) to enable graph persistence.',
    );
  }
  const Store = loadNeo4jStore();
  return new Store({
    uri,
    username: process.env.NEO4J_USER ?? 'neo4j',
    password: process.env.NEO4J_PASSWORD ?? 'neo4j',
    database: process.env.NEO4J_DATABASE,
  });
}

// Uniqueness constraints only need to be ensured once per process. Guarded by
// this flag so we don't issue schema commands on every operation.
let constraintsEnsured = false;

/**
 * Ensure uniqueness constraints exist so the MERGEs in persistGraph /
 * saveGraphState hit an index (and can't duplicate under concurrency).
 * Idempotent — safe to re-run. Neo4j rejects multiple schema commands in one
 * statement, so each runs as its own call.
 */
async function ensureConstraints(store: Neo4jStore): Promise<void> {
  await store.run(
    `CREATE CONSTRAINT package_key IF NOT EXISTS
     FOR (p:Package) REQUIRE p.key IS UNIQUE`,
  );
  await store.run(
    `CREATE CONSTRAINT savedgraph_id IF NOT EXISTS
     FOR (s:SavedGraph) REQUIRE s.id IS UNIQUE`,
  );
}

/** Run a unit of work against a connected store, always disconnecting after. */
async function withStore<T>(fn: (store: Neo4jStore) => Promise<T>): Promise<T> {
  const store = createStore();
  await store.connect();
  if (!constraintsEnsured) {
    // Best-effort: a failure here must not break the actual operation.
    try {
      await ensureConstraints(store);
      constraintsEnsured = true;
    } catch {
      // Ignore — constraints are an optimization, not a correctness gate.
    }
  }
  try {
    return await fn(store);
  } finally {
    await store.disconnect();
  }
}

/**
 * Persist a dependency graph into Neo4j as (:Package)-[:DEPENDS_ON]->(:Package).
 * Idempotent — re-running merges rather than duplicating.
 */
export async function persistGraph(graph: DependencyGraph): Promise<{
  nodesWritten: number;
  edgesWritten: number;
}> {
  return withStore(async store => {
    // Upsert nodes in one batched UNWIND.
    await store.run(
      `UNWIND $nodes AS n
       MERGE (p:Package { key: n.key })
       SET p.name = n.name,
           p.version = n.version,
           p.level = n.level,
           p.deprecated = n.deprecated,
           p.unpackedSize = n.unpackedSize,
           p.license = n.license`,
      { nodes: graph.nodes },
    );

    // Upsert edges.
    await store.run(
      `UNWIND $edges AS e
       MATCH (a:Package { key: e.from })
       MATCH (b:Package { key: e.to })
       MERGE (a)-[:DEPENDS_ON { type: e.type }]->(b)`,
      { edges: graph.edges },
    );

    return { nodesWritten: graph.nodes.length, edgesWritten: graph.edges.length };
  });
}

/**
 * Reconstruct a package's dependency graph from what's already stored in Neo4j.
 * Returns null if the root package isn't in the store (cache miss). Because
 * storing a graph walks every node's dependencies, any stored node carries its
 * full outgoing edges, so the reconstructed subgraph is complete.
 */
export async function getStoredGraph(
  rootKey: string,
): Promise<DependencyGraph | null> {
  return withStore(async store => {
    const nodeResult = await store.run(
      `MATCH path = (root:Package { key: $key })-[:DEPENDS_ON*0..]->(n:Package)
       WITH n, min(length(path)) AS level
       RETURN n.key AS key, n.name AS name, n.version AS version, level,
              n.deprecated AS deprecated, n.unpackedSize AS unpackedSize,
              n.license AS license`,
      { key: rootKey },
    );
    if (nodeResult.records.length === 0) return null;

    const edgeResult = await store.run(
      `MATCH (root:Package { key: $key })-[:DEPENDS_ON*0..]->(a:Package)-[r:DEPENDS_ON]->(b:Package)
       RETURN DISTINCT a.key AS from, b.key AS to, r.type AS type`,
      { key: rootKey },
    );

    const nodes = nodeResult.records.map(r => ({
      key: String(r.key),
      name: String(r.name),
      version: String(r.version),
      level: Number(r.level ?? 0),
      deprecated: Boolean(r.deprecated),
      unpackedSize: r.unpackedSize == null ? undefined : Number(r.unpackedSize),
      license: r.license == null ? undefined : String(r.license),
    }));
    const edges = edgeResult.records.map(r => ({
      from: String(r.from),
      to: String(r.to),
      type: String(r.type) as DependencyGraph['edges'][number]['type'],
    }));

    return {
      root: rootKey,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes,
      edges,
    };
  });
}

/** Packages that (directly) depend on the given package name. */
export async function findDependents(name: string): Promise<
  Array<{ key: string; name: string; version: string; type: string }>
> {
  return withStore(async store => {
    const result = await store.run(
      `MATCH (a:Package)-[r:DEPENDS_ON]->(b:Package { name: $name })
       RETURN DISTINCT a.key AS key, a.name AS name, a.version AS version, r.type AS type
       ORDER BY key`,
      { name },
    );
    return result.records as Array<{
      key: string;
      name: string;
      version: string;
      type: string;
    }>;
  });
}

/** Run an arbitrary Cypher query. */
export async function runCypher(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<Array<Record<string, unknown>>> {
  return withStore(async store => {
    const result = await store.run(cypher, params);
    return result.records;
  });
}

// --- Saved graphs (shareable links) ----------------------------------------

export type SavedGraphState = { search: string; hash: string };

/** Persist a graph's URL state and return a short shareable id. */
export async function saveGraphState(state: SavedGraphState): Promise<string> {
  const id = randomUUID().replace(/-/g, '').slice(0, 12);
  await withStore(async store => {
    await store.run(
      `MERGE (s:SavedGraph { id: $id })
       SET s.search = $search, s.hash = $hash, s.createdAt = timestamp()`,
      { id, search: state.search, hash: state.hash },
    );
  });
  return id;
}

/** Fetch a previously saved graph state by id. */
export async function getSavedGraphState(
  id: string,
): Promise<SavedGraphState | null> {
  return withStore(async store => {
    const result = await store.run(
      `MATCH (s:SavedGraph { id: $id })
       RETURN s.search AS search, s.hash AS hash`,
      { id },
    );
    const row = result.records[0] as SavedGraphState | undefined;
    return row ?? null;
  });
}

// --- Impact / relationship queries -----------------------------------------

/** All packages that transitively depend on the given package name. */
export async function findTransitiveDependents(
  name: string,
  maxDepth = 20,
): Promise<Array<{ key: string; name: string; version: string }>> {
  return withStore(async store => {
    const result = await store.run(
      `MATCH (a:Package)-[:DEPENDS_ON*1..${Math.max(1, Math.floor(maxDepth))}]->(b:Package { name: $name })
       RETURN DISTINCT a.key AS key, a.name AS name, a.version AS version
       ORDER BY key`,
      { name },
    );
    return result.records as Array<{
      key: string;
      name: string;
      version: string;
    }>;
  });
}

/** Shortest dependency path (by package name) from one package to another. */
export async function shortestDependencyPath(
  fromName: string,
  toName: string,
): Promise<string[] | null> {
  return withStore(async store => {
    const result = await store.run(
      `MATCH (a:Package { name: $fromName }), (b:Package { name: $toName }),
             p = shortestPath((a)-[:DEPENDS_ON*]->(b))
       RETURN [n IN nodes(p) | n.key] AS path
       ORDER BY size(path)
       LIMIT 1`,
      { fromName, toName },
    );
    const row = result.records[0] as { path?: string[] } | undefined;
    return row?.path ?? null;
  });
}

/** Packages that every one of the given root package names depends on. */
export async function commonDependencies(
  roots: string[],
): Promise<Array<{ key: string; name: string; sharedBy: number }>> {
  return withStore(async store => {
    const result = await store.run(
      `MATCH (r:Package)-[:DEPENDS_ON*1..]->(d:Package)
       WHERE r.name IN $roots
       WITH d, count(DISTINCT r.name) AS sharedBy
       WHERE sharedBy = size($roots)
       RETURN d.key AS key, d.name AS name, sharedBy
       ORDER BY key`,
      { roots },
    );
    return result.records as Array<{
      key: string;
      name: string;
      sharedBy: number;
    }>;
  });
}

/** The most depended-on packages across everything stored. */
export async function mostDependedOn(
  limit = 20,
): Promise<Array<{ key: string; name: string; dependents: number }>> {
  const safeLimit = Math.max(1, Math.floor(limit));
  return withStore(async store => {
    const result = await store.run(
      `MATCH (a:Package)-[:DEPENDS_ON]->(b:Package)
       WITH b, count(DISTINCT a) AS dependents
       RETURN b.key AS key, b.name AS name, dependents
       ORDER BY dependents DESC, key
       LIMIT ${safeLimit}`,
    );
    return result.records as Array<{
      key: string;
      name: string;
      dependents: number;
    }>;
  });
}
