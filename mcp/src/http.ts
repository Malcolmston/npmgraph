#!/usr/bin/env node
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { auditDependencies, auditNodes } from './audit.js';
import { buildDependencyGraph } from './graph.js';
import type { DependencyGraph, DependencyKey } from './graph.js';
import { renderGraphHtml, renderLandingHtml } from './html.js';
import { getPackageInfo } from './packageInfo.js';
import {
  commonDependencies,
  findTransitiveDependents,
  getSavedGraphState,
  getStoredGraph,
  mostDependedOn,
  neo4jConfigured,
  persistGraph,
  saveGraphState,
  shortestDependencyPath,
} from './neo4j.js';
import { resolvePackage } from './registry.js';

async function resolveRootKey(spec: string): Promise<string> {
  const at = spec.lastIndexOf('@');
  const name = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : 'latest';
  const pkg = await resolvePackage(name, version);
  return `${pkg.name}@${pkg.version}`;
}

// Get a graph, preferring the Neo4j cache; build (and store) on a miss.
async function graphFor(pkg: string): Promise<DependencyGraph> {
  if (neo4jConfigured()) {
    const rootKey = await resolveRootKey(pkg);
    const cached = await getStoredGraph(rootKey);
    if (cached) return cached;
    const graph = await buildDependencyGraph(pkg, { maxNodes: 100_000, maxDepth: 100 });
    await persistGraph(graph);
    return graph;
  }
  return buildDependencyGraph(pkg);
}

// Build the interactive HTML page for a package: cache-aware graph + OSV audit.
async function htmlFor(pkg: string): Promise<string> {
  const graph = await graphFor(pkg);
  try {
    const advisories = await auditNodes(graph.nodes);
    for (const node of graph.nodes) {
      const ids = advisories.get(node.key);
      if (ids) node.vulnerabilities = ids.length;
    }
  } catch {
    // OSV unavailable — render without vulnerability coloring.
  }
  return renderGraphHtml(graph, { apiBase: '/api' });
}

const PORT = Number(process.env.PORT ?? 3100);
// The package shown at the bare "/mcp" URL (no package in the path). Configured
// via docker-compose so it can change without touching URLs.
const DEFAULT_PACKAGE = process.env.DEFAULT_PACKAGE ?? 'expo';

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  contentType = 'application/json',
) {
  const isHtml = contentType.startsWith('text/html');
  const text = isHtml ? String(body) : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': isHtml ? 'text/html; charset=utf-8' : 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': '*',
  });
  res.end(text);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

function walkOptionsFromQuery(params: URLSearchParams) {
  const types = params
    .getAll('dependencyTypes')
    .flatMap(v => v.split(','))
    .filter(Boolean) as DependencyKey[];
  const maxDepth = params.get('maxDepth');
  const maxNodes = params.get('maxNodes');
  return {
    dependencyTypes: types.length ? types : undefined,
    maxDepth: maxDepth ? Number(maxDepth) : undefined,
    maxNodes: maxNodes ? Number(maxNodes) : undefined,
  };
}

function requireNeo4j() {
  if (!neo4jConfigured()) {
    throw new HttpError(503, 'Neo4j not configured (set NEO4J_URI).');
  }
}

// Gate write endpoints behind a shared secret. When API_WRITE_TOKEN is set
// (e.g. on a publicly-tunnelled deployment) callers must present it as
// `Authorization: Bearer <token>` or `x-api-key: <token>`; otherwise anyone who
// finds the URL could write to the database. When unset, writes stay open so
// local development is unchanged.
function requireWriteAuth(req: IncomingMessage) {
  const expected = process.env.API_WRITE_TOKEN;
  if (!expected) return;
  const header = req.headers['authorization'];
  const bearer =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : undefined;
  const apiKey = req.headers['x-api-key'];
  const provided = bearer ?? (typeof apiKey === 'string' ? apiKey : undefined);
  if (provided !== expected) {
    throw new HttpError(401, 'Missing or invalid API write token.');
  }
}

async function route(
  req: IncomingMessage,
  url: URL,
): Promise<{ status: number; body: unknown; contentType?: string }> {
  const { pathname, searchParams } = url;
  const method = req.method ?? 'GET';

  // Bare "/mcp" shows the default package's graph directly — no package in the
  // URL. Specific packages live at "/mcp/<package>".
  if (method === 'GET' && (pathname === '/mcp' || pathname === '/mcp/')) {
    return { status: 200, contentType: 'text/html', body: await htmlFor(DEFAULT_PACKAGE) };
  }
  const prettyMatch = /^\/mcp\/(.+)$/.exec(pathname);
  if (prettyMatch && method === 'GET') {
    const pkg = decodeURIComponent(prettyMatch[1]);
    return { status: 200, contentType: 'text/html', body: await htmlFor(pkg) };
  }
  // Search landing (reachable at the root and API roots).
  if (method === 'GET' && ['/', '/api', '/api/'].includes(pathname)) {
    return { status: 200, contentType: 'text/html', body: renderLandingHtml() };
  }

  // Health
  if (pathname === '/api/health' || pathname === '/health') {
    return { status: 200, body: { ok: true, neo4j: neo4jConfigured() } };
  }

  // Package metadata, maintainers & score
  if (pathname === '/api/package-info' && method === 'GET') {
    const pkg = searchParams.get('package');
    if (!pkg) throw new HttpError(400, 'Missing ?package');
    return { status: 200, body: await getPackageInfo(pkg) };
  }

  // Interactive HTML graph (color-coded + OSV audit; live node info via /api).
  if (pathname === '/api/html' && method === 'GET') {
    const pkg = searchParams.get('package');
    if (!pkg) throw new HttpError(400, 'Missing ?package');
    return { status: 200, contentType: 'text/html', body: await htmlFor(pkg) };
  }

  // Registry-backed (no DB needed)
  if (pathname === '/api/graph' && method === 'GET') {
    const pkg = searchParams.get('package');
    if (!pkg) throw new HttpError(400, 'Missing ?package');
    return {
      status: 200,
      body: await buildDependencyGraph(pkg, walkOptionsFromQuery(searchParams)),
    };
  }

  if (pathname === '/api/audit' && method === 'GET') {
    const pkg = searchParams.get('package');
    if (!pkg) throw new HttpError(400, 'Missing ?package');
    return {
      status: 200,
      body: await auditDependencies(pkg, walkOptionsFromQuery(searchParams)),
    };
  }

  // Saved graphs (share links)
  if (pathname === '/api/graphs' && method === 'POST') {
    requireWriteAuth(req);
    requireNeo4j();
    const body = await readJson(req);
    const id = await saveGraphState({
      search: String(body.search ?? ''),
      hash: String(body.hash ?? ''),
    });
    return { status: 201, body: { id } };
  }

  if (pathname === '/api/store' && method === 'POST') {
    requireWriteAuth(req);
    requireNeo4j();
    const body = await readJson(req);
    const pkg = String(body.package ?? '').trim();
    if (!pkg) throw new HttpError(400, 'Missing "package"');
    const graph = await buildDependencyGraph(pkg, {
      dependencyTypes: body.dependencyTypes as DependencyKey[] | undefined,
      maxDepth: body.maxDepth as number | undefined,
      maxNodes: body.maxNodes as number | undefined,
    });
    const written = await persistGraph(graph);
    return { status: 201, body: { root: graph.root, ...written } };
  }

  const savedMatch = /^\/api\/graphs\/([\w-]+)$/.exec(pathname);
  if (savedMatch && method === 'GET') {
    requireNeo4j();
    const state = await getSavedGraphState(savedMatch[1]);
    if (!state) throw new HttpError(404, 'Saved graph not found');
    return { status: 200, body: state };
  }

  // Impact queries (Neo4j)
  const dependentsMatch = /^\/api\/dependents\/(.+)$/.exec(pathname);
  if (dependentsMatch && method === 'GET') {
    requireNeo4j();
    const name = decodeURIComponent(dependentsMatch[1]);
    return {
      status: 200,
      body: { name, dependents: await findTransitiveDependents(name) },
    };
  }

  if (pathname === '/api/path' && method === 'GET') {
    requireNeo4j();
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (!from || !to) throw new HttpError(400, 'Missing ?from and ?to');
    return {
      status: 200,
      body: { from, to, path: await shortestDependencyPath(from, to) },
    };
  }

  if (pathname === '/api/common' && method === 'GET') {
    requireNeo4j();
    const roots = searchParams
      .getAll('roots')
      .flatMap(v => v.split(','))
      .filter(Boolean);
    if (roots.length < 2) throw new HttpError(400, 'Provide >= 2 ?roots');
    return { status: 200, body: { roots, shared: await commonDependencies(roots) } };
  }

  if (pathname === '/api/most-depended' && method === 'GET') {
    requireNeo4j();
    const limit = Number(searchParams.get('limit') ?? 20);
    return { status: 200, body: { packages: await mostDependedOn(limit) } };
  }

  throw new HttpError(404, `Not found: ${method} ${pathname}`);
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  route(req, url)
    .then(({ status, body, contentType }) => send(res, status, body, contentType))
    .catch((error: unknown) => {
      if (error instanceof HttpError) {
        send(res, error.status, { error: error.message });
      } else {
        send(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
});

server.listen(PORT, () => {
  console.error(
    `npmgraph HTTP API listening on :${PORT} (Neo4j ${neo4jConfigured() ? 'configured' : 'not configured'}).`,
  );
});
