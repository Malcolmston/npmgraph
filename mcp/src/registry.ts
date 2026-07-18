import { maxSatisfying, valid, validRange } from 'semver';

// `||` (not `??`) so an empty NPM_REGISTRY env still falls back to the public
// registry — compose passes through env vars as "" when unset.
const DEFAULT_REGISTRY =
  process.env.NPM_REGISTRY || 'https://registry.npmjs.org';

export type PackageVersion = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  optionalDependencies?: Record<string, string>;
  deprecated?: string;
  license?: unknown;
  dist?: { unpackedSize?: number };
};

type Packument = {
  name: string;
  'dist-tags'?: Record<string, string>;
  versions: Record<string, PackageVersion>;
};

const packumentCache = new Map<string, Promise<Packument>>();

// Bound concurrent registry requests. Unbounded fan-out over a large tree
// exhausts sockets and gets throttled — a modest cap is both stabler and, in
// practice, faster. Override with NPM_FETCH_CONCURRENCY.
const MAX_CONCURRENT = Number(process.env.NPM_FETCH_CONCURRENCY ?? 24);
const REQUEST_TIMEOUT_MS = Number(process.env.NPM_FETCH_TIMEOUT_MS ?? 15000);
let active = 0;
const waiters: Array<() => void> = [];

// Race-free counting semaphore: the permit count is only ever mutated
// synchronously — either here (grant immediately) or in release() (hand off to
// the next waiter). Never `active++` after an await, which is what deadlocked.
function acquire(): Promise<void> {
  return new Promise<void>(resolve => {
    if (active < MAX_CONCURRENT) {
      active++;
      resolve();
    } else {
      waiters.push(resolve);
    }
  });
}

function release(): void {
  const next = waiters.shift();
  if (next) {
    // Hand the permit straight to the next waiter — count stays the same.
    next();
  } else {
    active--;
  }
}

function fetchPackument(name: string): Promise<Packument> {
  const cached = packumentCache.get(name);
  if (cached) return cached;

  const url = `${DEFAULT_REGISTRY}/${name.replace('/', '%2F')}`;
  const promise = (async () => {
    await acquire();
    try {
      const response = await fetch(url, {
        // Abbreviated ("corgi") metadata — only install-relevant fields, an
        // order of magnitude smaller than the full packument with all history.
        headers: { accept: 'application/vnd.npm.install-v1+json' },
        // A per-request timeout is essential: without it a single stalled or
        // throttled connection holds a concurrency slot forever, and a few of
        // those deadlock the whole walk.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch "${name}": ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as Packument;
    } finally {
      release();
    }
  })();

  packumentCache.set(name, promise);
  // Don't cache failures forever
  promise.catch(() => packumentCache.delete(name));
  return promise;
}

/**
 * Resolve a package name + version-ish spec (range, dist-tag, or exact) to a
 * concrete PackageVersion by querying the npm registry.
 */
export async function resolvePackage(
  name: string,
  spec = 'latest',
): Promise<PackageVersion> {
  const packument = await fetchPackument(name);
  const versions = Object.keys(packument.versions ?? {});
  if (versions.length === 0) {
    throw new Error(`No published versions for "${name}"`);
  }

  let resolved: string | undefined;

  // dist-tag (e.g. "latest", "next")
  if (packument['dist-tags']?.[spec]) {
    resolved = packument['dist-tags'][spec];
  } else if (valid(spec) && packument.versions[spec]) {
    // Exact version
    resolved = spec;
  } else if (validRange(spec)) {
    // Semver range
    resolved = maxSatisfying(versions, spec) ?? undefined;
  }

  // Fall back to latest dist-tag, then highest version
  resolved ??=
    packument['dist-tags']?.latest ?? maxSatisfying(versions, '*') ?? undefined;

  if (!resolved || !packument.versions[resolved]) {
    throw new Error(`Could not resolve "${name}@${spec}"`);
  }

  return packument.versions[resolved];
}
