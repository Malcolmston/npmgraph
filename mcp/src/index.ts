#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { auditDependencies, auditNodes, comparePackages } from './audit.js';
import { buildDependencyGraph, graphToDot } from './graph.js';
import type { DependencyKey } from './graph.js';
import { renderGraphHtml } from './html.js';
import { getPackageInfo } from './packageInfo.js';
import { resolvePackage } from './registry.js';

// Storage should capture the WHOLE recursive tree, so store paths default to a
// very high node cap (still bounded as a runaway guard) rather than the modest
// read-time default.
const FULL_STORE_MAX_NODES = 100_000;
function storeWalkOptions(args: {
  dependencyTypes?: DependencyKey[];
  maxDepth?: number;
  maxNodes?: number;
}) {
  return {
    dependencyTypes: args.dependencyTypes,
    maxDepth: args.maxDepth ?? 100,
    maxNodes: args.maxNodes ?? FULL_STORE_MAX_NODES,
  };
}
import {
  commonDependencies,
  findDependents,
  findTransitiveDependents,
  getStoredGraph,
  mostDependedOn,
  neo4jConfigured,
  persistGraph,
  runCypher,
  shortestDependencyPath,
} from './neo4j.js';

/** Resolve a package spec ("name", "name@range", "@scope/name@range") to its
 * concrete "name@version" key without walking the whole tree. */
async function resolveRootKey(spec: string): Promise<string> {
  const at = spec.lastIndexOf('@');
  const name = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : 'latest';
  const pkg = await resolvePackage(name, version);
  return `${pkg.name}@${pkg.version}`;
}

const server = new McpServer({
  name: 'npmgraph',
  version: '0.1.0',
});

const dependencyTypeSchema = z
  .array(
    z.enum([
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]),
  )
  .optional()
  .describe(
    'Dependency kinds to follow at the top level (deeper levels only follow "dependencies"). Defaults to ["dependencies"].',
  );

const walkShape = {
  package: z
    .string()
    .describe('Package spec, e.g. "react", "react@18", or "@scope/pkg@1.2.3".'),
  dependencyTypes: dependencyTypeSchema,
  maxDepth: z.number().int().min(0).max(25).optional().describe('Max traversal depth (default 10).'),
  maxNodes: z.number().int().min(1).max(5000).optional().describe('Max nodes to collect (default 750).'),
};

function walkOptions(args: {
  dependencyTypes?: DependencyKey[];
  maxDepth?: number;
  maxNodes?: number;
}) {
  return {
    dependencyTypes: args.dependencyTypes,
    maxDepth: args.maxDepth,
    maxNodes: args.maxNodes,
  };
}

function jsonContent(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function textContent(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function errorContent(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

server.registerTool(
  'get_dependency_graph',
  {
    title: 'Get npm dependency graph (JSON)',
    description:
      'Resolve and walk the npm dependency tree for a package, returning a JSON graph of nodes (name@version, level, deprecation, size, license) and edges.',
    inputSchema: walkShape,
  },
  async args => {
    try {
      const graph = await buildDependencyGraph(args.package, walkOptions(args));
      return jsonContent(graph);
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'get_dependency_dot',
  {
    title: 'Get npm dependency graph (Graphviz DOT)',
    description:
      'Resolve and walk the npm dependency tree for a package, returning Graphviz DOT source (renderable with graphviz or pasted into npmgraph).',
    inputSchema: walkShape,
  },
  async args => {
    try {
      const graph = await buildDependencyGraph(args.package, walkOptions(args));
      return textContent(graphToDot(graph));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'get_dependency_html',
  {
    title: 'Get dependency graph as interactive HTML',
    description:
      "Render a package's dependency graph as self-contained, interactive HTML (Graphviz layout, drag-to-pan, wheel-to-zoom, +/−/fit buttons; no external assets). Uses the Neo4j-stored graph when available, otherwise walks the registry (and stores it if Neo4j is configured). Set bodyOnly:true for Claude-Artifact-ready content (no document skeleton).",
    inputSchema: {
      ...walkShape,
      bodyOnly: z
        .boolean()
        .optional()
        .describe(
          'Return only the page content (scoped style + markup + script), no <!doctype>/<html>/<head>/<body> — the form a Claude Artifact expects.',
        ),
      audit: z
        .boolean()
        .optional()
        .describe(
          'Check nodes against OSV and color vulnerable packages (default true).',
        ),
    },
  },
  async args => {
    try {
      let graph;
      if (neo4jConfigured()) {
        const rootKey = await resolveRootKey(args.package);
        const cached = await getStoredGraph(rootKey);
        if (cached) {
          graph = cached;
        } else {
          graph = await buildDependencyGraph(args.package, storeWalkOptions(args));
          await persistGraph(graph);
        }
      } else {
        graph = await buildDependencyGraph(args.package, walkOptions(args));
      }
      // Enrich with OSV advisories so "unsafe" packages get colored.
      if (args.audit !== false) {
        try {
          const advisories = await auditNodes(graph.nodes);
          for (const node of graph.nodes) {
            const ids = advisories.get(node.key);
            if (ids) node.vulnerabilities = ids.length;
          }
        } catch {
          // OSV unavailable — render without vulnerability coloring.
        }
      }
      const html = await renderGraphHtml(graph, { bodyOnly: args.bodyOnly });
      return { content: [{ type: 'text' as const, text: html }] };
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'store_dependency_graph',
  {
    title: 'Store dependency graph in Neo4j',
    description:
      'Walk a package dependency graph and persist it into Neo4j (via the prorm ORM) as (:Package)-[:DEPENDS_ON]->(:Package). Requires NEO4J_URI to be configured.',
    inputSchema: walkShape,
  },
  async args => {
    try {
      if (!neo4jConfigured()) {
        return errorContent(
          new Error('Neo4j not configured — set NEO4J_URI to use this tool.'),
        );
      }
      const graph = await buildDependencyGraph(
        args.package,
        storeWalkOptions(args),
      );
      const written = await persistGraph(graph);
      return jsonContent({ root: graph.root, ...written });
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'find_dependents',
  {
    title: 'Find dependents (Neo4j)',
    description:
      'Query previously-stored graphs in Neo4j for packages that directly depend on the given package name.',
    inputSchema: {
      name: z.string().describe('Package name to find dependents of.'),
    },
  },
  async args => {
    try {
      if (!neo4jConfigured()) {
        return errorContent(
          new Error('Neo4j not configured — set NEO4J_URI to use this tool.'),
        );
      }
      const dependents = await findDependents(args.name);
      return jsonContent({ name: args.name, count: dependents.length, dependents });
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'query_graph_cypher',
  {
    title: 'Run Cypher against stored graphs (Neo4j)',
    description:
      'Run a read-only Cypher query against the stored dependency graphs in Neo4j. Requires NEO4J_URI.',
    inputSchema: {
      cypher: z.string().describe('Cypher query to execute.'),
      params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Optional query parameters.'),
    },
  },
  async args => {
    try {
      if (!neo4jConfigured()) {
        return errorContent(
          new Error('Neo4j not configured — set NEO4J_URI to use this tool.'),
        );
      }
      const records = await runCypher(args.cypher, args.params ?? {});
      return jsonContent({ count: records.length, records });
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'audit_dependencies',
  {
    title: 'Audit dependencies for vulnerabilities (OSV)',
    description:
      "Walk a package's dependency graph and check every resolved version against the OSV vulnerability database. No Neo4j required.",
    inputSchema: walkShape,
  },
  async args => {
    try {
      const result = await auditDependencies(args.package, walkOptions(args));
      return jsonContent(result);
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'get_package_info',
  {
    title: 'Get package info, maintainers & score',
    description:
      'Fetch a package’s metadata (description, license, homepage, repository, keywords, deprecation), its maintainers/author ("the programmers"), install size, last-month downloads, and a quality score (npms.io if available, otherwise a transparent heuristic from repo/license/downloads/recency signals).',
    inputSchema: {
      package: z
        .string()
        .describe('Package spec, e.g. "react" or "react@18".'),
    },
  },
  async args => {
    try {
      return jsonContent(await getPackageInfo(args.package));
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'compare_packages',
  {
    title: 'Compare two package versions',
    description:
      'Diff the direct dependencies of two package specs (e.g. "react@17" vs "react@18") — added, removed, and version-changed deps.',
    inputSchema: {
      packageA: z.string().describe('First package spec, e.g. "react@17".'),
      packageB: z.string().describe('Second package spec, e.g. "react@18".'),
    },
  },
  async args => {
    try {
      const diff = await comparePackages(args.packageA, args.packageB);
      return jsonContent(diff);
    } catch (error) {
      return errorContent(error);
    }
  },
);

function requireNeo4j() {
  if (!neo4jConfigured()) {
    throw new Error('Neo4j not configured — set NEO4J_URI to use this tool.');
  }
}

server.registerTool(
  'get_or_build_graph',
  {
    title: 'Get dependency graph (Neo4j-cached)',
    description:
      "Return the package's dependency graph from Neo4j if it has already been stored (cache hit), otherwise walk it from the npm registry, persist it, and return it. Requires Neo4j. The response includes a `source` of \"neo4j\" or \"built\".",
    inputSchema: walkShape,
  },
  async args => {
    try {
      requireNeo4j();
      const rootKey = await resolveRootKey(args.package);
      const cached = await getStoredGraph(rootKey);
      if (cached) {
        return jsonContent({ source: 'neo4j', ...cached });
      }
      const graph = await buildDependencyGraph(
        args.package,
        storeWalkOptions(args),
      );
      await persistGraph(graph);
      return jsonContent({ source: 'built', ...graph });
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'find_transitive_dependents',
  {
    title: 'Find transitive dependents (Neo4j)',
    description:
      'All packages in the store that transitively depend on the given package name.',
    inputSchema: {
      name: z.string().describe('Package name.'),
      maxDepth: z.number().int().min(1).max(50).optional(),
    },
  },
  async args => {
    try {
      requireNeo4j();
      const dependents = await findTransitiveDependents(args.name, args.maxDepth);
      return jsonContent({ name: args.name, count: dependents.length, dependents });
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'shortest_dependency_path',
  {
    title: 'Shortest dependency path (Neo4j)',
    description:
      'Shortest dependency path (by package name) from one stored package to another.',
    inputSchema: {
      from: z.string().describe('Start package name.'),
      to: z.string().describe('Target package name.'),
    },
  },
  async args => {
    try {
      requireNeo4j();
      const path = await shortestDependencyPath(args.from, args.to);
      return jsonContent({ from: args.from, to: args.to, path, found: path !== null });
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'common_dependencies',
  {
    title: 'Common dependencies (Neo4j)',
    description:
      'Packages that every one of the given root package names transitively depends on.',
    inputSchema: {
      roots: z
        .array(z.string())
        .min(2)
        .describe('Two or more root package names.'),
    },
  },
  async args => {
    try {
      requireNeo4j();
      const shared = await commonDependencies(args.roots);
      return jsonContent({ roots: args.roots, count: shared.length, shared });
    } catch (error) {
      return errorContent(error);
    }
  },
);

server.registerTool(
  'most_depended_on',
  {
    title: 'Most depended-on packages (Neo4j)',
    description: 'The most depended-on packages across everything stored.',
    inputSchema: {
      limit: z.number().int().min(1).max(200).optional(),
    },
  },
  async args => {
    try {
      requireNeo4j();
      const ranked = await mostDependedOn(args.limit ?? 20);
      return jsonContent({ count: ranked.length, packages: ranked });
    } catch (error) {
      return errorContent(error);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logging; stdout is the JSON-RPC channel.
  console.error(
    `npmgraph MCP server ready (Neo4j ${neo4jConfigured() ? 'configured' : 'not configured'}).`,
  );
}

main().catch(error => {
  console.error('Fatal error starting npmgraph MCP server:', error);
  process.exit(1);
});
