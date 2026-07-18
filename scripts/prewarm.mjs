#!/usr/bin/env node
// Pre-warm the offline caches: for each package in the given list, build its
// dependency graph and persist it to Neo4j. When the API is pointed at the
// verdaccio mirror (docker-compose.offline.yml), this also caches every
// packument/tarball on disk, so the package later resolves with no internet.
//
// Usage:
//   node scripts/prewarm.mjs packages.txt [--api http://localhost:3100]
//                                         [--concurrency 8] [--max-nodes 400]
//
// packages.txt: one package name (optionally name@version) per line; blank
// lines and lines starting with # are ignored. Reads API_WRITE_TOKEN from env
// if the API requires it.
import { readFileSync } from 'node:fs';

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const listPath = process.argv[2];
if (!listPath || listPath.startsWith('--')) {
  console.error(
    'usage: node scripts/prewarm.mjs <packages.txt> [--api URL] [--concurrency N] [--max-nodes N]',
  );
  process.exit(1);
}

const API = arg('--api', process.env.PREWARM_API ?? 'http://localhost:3100');
const CONCURRENCY = Number(arg('--concurrency', '8'));
const MAX_NODES = Number(arg('--max-nodes', '400'));
const TOKEN = process.env.API_WRITE_TOKEN ?? '';

const packages = readFileSync(listPath, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

console.log(
  `Pre-warming ${packages.length} packages via ${API} ` +
    `(concurrency ${CONCURRENCY}, maxNodes ${MAX_NODES})` +
    (TOKEN ? ' [authenticated]' : ''),
);

let done = 0;
let ok = 0;
let failed = 0;
const failures = [];
const started = Date.now();

async function storeOne(pkg) {
  const res = await fetch(`${API}/api/store`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({ package: pkg, maxNodes: MAX_NODES }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  return res.json();
}

async function worker(queue) {
  for (;;) {
    const pkg = queue.shift();
    if (pkg === undefined) return;
    try {
      const r = await storeOne(pkg);
      ok++;
      if (ok % 25 === 0 || packages.length < 50) {
        const rate = (done / ((Date.now() - started) / 1000)).toFixed(1);
        console.log(
          `  [${++done}/${packages.length}] ${pkg} -> ${r.nodesWritten ?? '?'} nodes (${rate}/s)`,
        );
      } else {
        done++;
      }
    } catch (err) {
      failed++;
      done++;
      failures.push(`${pkg}: ${err.message}`);
    }
  }
}

const queue = [...packages];
await Promise.all(
  Array.from({ length: Math.max(1, CONCURRENCY) }, () => worker(queue)),
);

const secs = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\nDone in ${secs}s — ${ok} indexed, ${failed} failed.`);
if (failures.length) {
  console.log('Failures (first 20):');
  for (const f of failures.slice(0, 20)) console.log('  - ' + f);
}
process.exit(failed && ok === 0 ? 1 : 0);
