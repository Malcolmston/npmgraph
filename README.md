# npmgraph

A tool for exploring npm modules and dependencies. Available online at https://npmgraph.js.org/.

**Be sure to check out [the new npmgraph CLI](https://github.com/npmgraph/npmgraph-cli).**

## URL API

`npmgraph` diagrams can be configured using the URL parameters below.

NOTE: With the exception of the `q` (query) parameter, these are **not** search parameters. These parameters are stored in the location _`hash`_, using normal URL query param encoding.

### `q` (search param)

Comma-separated list of module names or URLs.

**Example**: Graph the `send` module (official NPM registry):

https://npmgraph.js.org/?q=send

### `collapse` (hash param)

Comma-separated list of modules to collapse

**Example**: Graph `send, collapsing the `debug`and`http-errors` subtrees

https://npmgraph.js.org/?q=send#collapse=debug%2Chttp-errors

### `color` (hash param)

"Colorization" mode (a.k.a "Colorize by..." field in UI). Currently supports the following values:

| `color=...`   | Graph nodes colored by...                                                         |
| ------------- | --------------------------------------------------------------------------------- |
| `moduleType`  | `package.json#type` value                                                         |
| `bus`         | # of maintainers ("bus" = [bus factor](https://en.wikipedia.org/wiki/Bus_factor)) |
| `outdated`    | Degree of `version` outdated-ness                                                 |
| `maintenance` | npms.io score                                                                     |

**Example**: Graph `send`, colorize by module type:

https://npmgraph.js.org/?q=send#color=moduleType

### `deps` (hash param)

Comma-separated list of the _types_ dependencies to include for modules at the top-level of the graph. (Lower-level modules only ever show `dependencies`).

`dependencies` is always included.

**Example**: Graph `send`, include `devDependencies`:

https://npmgraph.js.org/?q=send#deps=devDependencies

### `hide` (hash param)

If defined (e.g. `...#hide`), hides the inspector.

**Example**: Graph `send`, close the inspector

https://npmgraph.js.org/?q=send@0.18.0#view=closed

### `packages` (hash param, **JSON-encoded**)

JSON-encoded array of `package.json` contents for any custom / proprietary modules included in the graph.

**Example**: Graph that includes custom "foo" and "bar" modules, with "foo" as the root module.

https://npmgraph.js.org/?q=foo%401.2.3#packages=%5B%7B%22name%22%3A%22foo%22%2C%22version%22%3A%221.2.3%22%2C%22dependencies%22%3A%7B%22send%22%3A%220.18.0%22%2C%22bar%22%3A%223.2.1%22%7D%7D%2C%7B%22name%22%3A%22bar%22%2C%22version%22%3A%223.2.1%22%2C%22dependencies%22%3A%7B%22debug%22%3A%222.6.9%22%7D%7D%5D

Generated with:

```js
const fooPackage = {
  // package.json for "foo"
  name: 'foo',
  version: '1.2.3',
  dependencies: { send: '0.18.0', bar: '3.2.1' },
};
const barPackage = {
  // package.json for "bar"
  name: 'bar',
  version: '3.2.1',
  dependencies: { debug: '2.6.9' },
};

const url = new URL('https://npmgraph.js.org');
url.hash = new URLSearchParams({
  packages: JSON.stringify([fooPackage, barPackage]),
});
url.searchParams.set('q', `${fooPackage.name}@${fooPackage.version}`);

url.toString(); // Returns the above URL
```

### `select` (hash param)

Select a module or category of modules.

Values should have one of the following forms:
| | |
|---|---|
| `exact:<module key>` | Select a specific module |
| `name:<module name>` | Select modules by name, all versions |
| `license:<license string>` | Select modules by license |
| `maintainer:<maintainer name>` | Select modules by maintainer name |

**Example**: Graph `send`, selecting `fresh@0.5.2`

https://npmgraph.js.org/?q=send@0.18.0#select=fresh%400.5.2

### `sizing` (hash param)

If present, modules will be scaled to reflect their unpacked size

**Example**: Graph `send`, selecting `fresh@0.5.2`

https://npmgraph.js.org/?q=send#sizing

### `zoom` (hash param)

Specify zoom mode.

|     |                 |
| --- | --------------- |
| `w` | Fit view width  |
| `h` | Fit view height |

**Example**: Graph `send`, fit view width

https://npmgraph.js.org/?q=send@0.18.0#zoom=w

## Running locally

`NPMGraph` is built with `parcel`. To run in your local dev environment:

```shell
$ git clone https://github.com/npmgraph/npmgraph.git
$ cd npmgraph
$ npm install
$ npm start
```

---

## Local development & deployment (this fork)

This is a fork of [npmgraph](https://github.com/npmgraph/npmgraph) with a number of
local additions: a Docker Compose deployment, a graph-database backend, an MCP
server, and some extra app features. Everything above still applies; this section
documents what's specific to this fork.

### Package manager

This fork uses **pnpm** (the version is pinned via the `packageManager` field in
`package.json`). If you have a recent Node.js, enable it with `corepack enable`.

```shell
pnpm install        # install dependencies
pnpm start          # Parcel dev server on http://localhost:1234
pnpm build          # production build into ./dist
pnpm test           # format + lint + typecheck + unit tests + build
```

### Docker Compose

The repo ships a `docker-compose.yml` with several services and profiles.

**Production build (default):**

```shell
docker compose up --build
```

This builds the static site with Parcel and serves it via nginx. The web app is
published on host port **8091** (`http://localhost:8091`). Pass
`--build-arg`/`BUGSNAG_KEY` to bake in a Bugsnag key at build time.

**Hot-reload dev server (`dev` profile):**

```shell
docker compose --profile dev up dev
```

Runs the Parcel dev server in a container with the source bind-mounted, on
`http://localhost:1234`.

**Graph backend (`graph` profile):**

```shell
docker compose --profile graph up neo4j        # just the Neo4j database
docker compose --profile graph run --rm mcp    # the MCP server (stdio)
docker compose --profile graph up              # neo4j + mcp + api together
```

This brings up:

- **Neo4j** (`neo4j:5-community`) — Browser at `http://localhost:7474`, bolt at
  `bolt://localhost:7687`.
- **mcp** — the MCP server (see below), talking to Neo4j over stdio.
- **api** — the HTTP API on port **3100**, which backs the web app's impact
  queries and share links. nginx proxies `/api` to this service, so in the
  production container the API is reachable at `http://localhost:8091/api/...`.

**Public tunnel (ngrok):** an `ngrok` service can expose the web app on a
shareable https URL. It needs an ngrok authtoken — set `NGROK_AUTHTOKEN` in your
environment or `.env`. The ngrok inspector is published on host port **4041**
(`http://localhost:4041`).

### New app features

Beyond upstream npmgraph, this fork's web UI adds:

- **Interactive pan/zoom** on the SVG dependency graph, with a reset control.
- An expanded **Export menu**: export the graph as **SVG, PNG, JSON, DOT,
  Mermaid, CSV, or Markdown**, copy exports to the clipboard, and use
  **"Save & copy link"** to persist a graph and get a shareable link (backed by
  the HTTP API).
- A graph **Health scorecard** in the Report pane.

### MCP server

The `mcp/` directory contains `@npmgraph/mcp`, a
[Model Context Protocol](https://modelcontextprotocol.io) server. See
[`mcp/README.md`](./mcp/README.md) for full details. In brief, it exposes:

- npm **dependency-graph** tools (walk a package's tree → JSON or Graphviz DOT).
- An **OSV vulnerability audit** of resolved versions.
- **Package comparison** (diff direct dependencies of two specs).
- **Neo4j-backed impact queries** over stored graphs: direct/transitive
  dependents, shortest dependency path, common dependencies, and most-depended-on
  packages (plus arbitrary Cypher).

The registry-backed tools need no configuration; the impact queries require Neo4j.
You can attach the server to Claude Code with `claude mcp add` (see
`mcp/README.md` for the stdio config and environment variables).

### Environment variables

Copy `.env.example` to `.env` and fill in the values it documents:

- `BUGSNAG_KEY` — Bugsnag error-reporting key (baked into the build).
- `NGROK_AUTHTOKEN` / `NGROK_DOMAIN` — authtoken and reserved static domain for
  the ngrok public-tunnel service (the domain pins the URL across restarts).
- `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` / `NEO4J_DATABASE` — Neo4j
  connection. Leave `NEO4J_URI` empty to use the local `neo4j` container, or set
  it to an AuraDB URI for a hosted database.
- `NPM_REGISTRY` — npm registry to resolve from. Empty = public registry; the
  offline overlay points it at the verdaccio mirror.
- `API_WRITE_TOKEN` — shared secret for the write endpoints (`POST /api/store`,
  `/api/graphs`). Set it on any publicly-exposed deployment; callers then send
  `Authorization: Bearer <token>`. Empty = writes open (local dev only).

### Offline mirror

The whole stack can run with no cloud dependencies — a local Neo4j plus a
[verdaccio](https://verdaccio.org/) npm-registry mirror. Once a package has been
indexed, it resolves with **no internet at all**.

```bash
# Bring up the offline stack (local Neo4j + verdaccio + API + web).
docker compose -f docker-compose.yml -f docker-compose.offline.yml \
  --profile graph up -d npmgraph neo4j verdaccio api

# Pre-warm the caches: builds each package's graph through verdaccio (caching
# every packument on disk) and persists it to the local Neo4j.
node scripts/prewarm.mjs packages.txt        # one package name per line
```

After pre-warming, cached packages render even with the machine disconnected —
verdaccio serves packuments/tarballs from disk and the graphs come straight from
the local Neo4j. Vulnerability audit (OSV), download counts, and quality scores
are the only features that need the internet, and they degrade gracefully when
it's absent.
