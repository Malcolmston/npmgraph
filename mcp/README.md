# @npmgraph/mcp

An [MCP](https://modelcontextprotocol.io) server that exposes npm dependency-graph
queries as tools, with optional persistence into a Neo4j graph database via the
[`@mstone6969/prorm`](https://www.npmjs.com/package/@mstone6969/prorm) ORM.

## Tools

| Tool | Description | Needs Neo4j |
|------|-------------|:-----------:|
| `get_dependency_graph` | Walk a package's npm dependency tree → JSON (nodes + edges). | — |
| `get_dependency_dot` | Same walk → Graphviz **DOT** (renderable / paste-able into npmgraph). | — |
| `audit_dependencies` | Check every resolved version against the OSV vulnerability DB. | — |
| `compare_packages` | Diff direct dependencies of two specs (e.g. `react@17` vs `react@18`). | — |
| `store_dependency_graph` | Walk a package and persist it as `(:Package)-[:DEPENDS_ON]->(:Package)`. | ✅ |
| `find_dependents` | Packages in the store that directly depend on a given name. | ✅ |
| `find_transitive_dependents` | Packages that transitively depend on a given name. | ✅ |
| `shortest_dependency_path` | Shortest dependency path between two stored packages. | ✅ |
| `common_dependencies` | Packages that all of several roots depend on. | ✅ |
| `most_depended_on` | Most depended-on packages across everything stored. | ✅ |
| `query_graph_cypher` | Run an arbitrary Cypher query against the stored graphs. | ✅ |

## HTTP API

The same code also ships an HTTP API (`npmgraph-http`, or `pnpm serve`) that backs
the web app's impact queries and **Save-graph** share links. It listens on `PORT`
(default `3100`) with permissive CORS:

| Route | Neo4j |
|-------|:-----:|
| `GET /api/health` | — |
| `GET /api/graph?package=react` | — |
| `GET /api/audit?package=react` | — |
| `POST /api/graphs` `{search,hash}` → `{id}` / `GET /api/graphs/:id` | ✅ |
| `GET /api/dependents/:name` | ✅ |
| `GET /api/path?from=&to=` | ✅ |
| `GET /api/common?roots=a,b` | ✅ |
| `GET /api/most-depended?limit=20` | ✅ |

In the Docker setup nginx proxies `/api` to this service. For local dev (web on a
different port), point the web app at it with
`localStorage['npmgraph:apiBase'] = 'http://localhost:3100'`.

All walk tools accept: `package` (e.g. `react`, `react@18`, `@scope/pkg@1.2.3`),
`dependencyTypes` (top-level dep kinds to follow), `maxDepth`, and `maxNodes`.

## Configuration

The registry-backed tools work with **no configuration**. Persistence tools need
Neo4j, configured via environment variables:

| Variable | Default | Notes |
|----------|---------|-------|
| `NEO4J_URI` | *(unset)* | e.g. `neo4j://localhost:7687`. Persistence is disabled until set. |
| `NEO4J_USER` | `neo4j` | |
| `NEO4J_PASSWORD` | `neo4j` | |
| `NEO4J_DATABASE` | *(server default)* | |
| `NPM_REGISTRY` | `https://registry.npmjs.org` | Point at a private registry if needed. |

## Run locally

```bash
pnpm install
pnpm build
node dist/index.js         # speaks MCP over stdio
```

## Use with Docker Compose

From the repo root, the `graph` profile brings up Neo4j and this server wired
together:

```bash
docker compose --profile graph up -d neo4j       # start the graph DB
docker compose --profile graph run --rm mcp      # run the MCP server (stdio)
```

Neo4j Browser is at http://localhost:7474 (bolt on `7687`).

## Register with an MCP client

Claude Desktop / Claude Code `mcp` config (stdio):

```json
{
  "mcpServers": {
    "npmgraph": {
      "command": "node",
      "args": ["/absolute/path/to/graph/mcp/dist/index.js"],
      "env": {
        "NEO4J_URI": "neo4j://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "npmgraph123"
      }
    }
  }
}
```

Omit the `env` block to run without persistence — the two `get_*` tools still work.
