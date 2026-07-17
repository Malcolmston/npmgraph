import { PARAM_SAVED } from './constants.ts';

/**
 * Base URL for the npmgraph HTTP API (the Neo4j-backed service in `mcp/`).
 *
 * Resolution order:
 * 1. An explicit `localStorage['npmgraph:apiBase']` override (trailing slash
 *    stripped), e.g. "http://localhost:3100".
 * 2. The Parcel dev server (`pnpm start` on http://localhost:1234, or another
 *    bare-localhost dev port), where there is no proxy — defaults to the API
 *    service's host-mapped port, "http://localhost:3100".
 * 3. Otherwise a same-origin `/api` path, which is proxied to the API service
 *    by nginx in the Docker/production build (and works for ngrok origins too).
 */
export function getApiBase(): string {
  try {
    const override = localStorage.getItem('npmgraph:apiBase');
    if (override) return override.replace(/\/$/, '');
  } catch {
    // localStorage unavailable — fall through to defaults.
  }

  // In dev there's no nginx proxy, so `/api` would 404. Detect the Parcel dev
  // server (default port 1234, or any non-web bare-localhost port) and talk to
  // the API service directly. Real deployments (nginx, ngrok origins) fall
  // through to the same-origin `/api` path below.
  const { hostname, port } = location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isWebPort = port === '' || port === '80' || port === '443';
  if (port === '1234' || (isLocalhost && !isWebPort)) {
    return 'http://localhost:3100';
  }

  return '/api';
}

type SavedState = { search: string; hash: string };

/**
 * Persist the current graph's URL state (query + settings) to the API and
 * return a shareable link that reloads it.
 */
export async function saveCurrentGraph(): Promise<string> {
  const body: SavedState = {
    search: location.search,
    hash: location.hash,
  };

  const response = await fetch(`${getApiBase()}/graphs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Save failed: ${response.status} ${response.statusText}`);
  }
  const { id } = (await response.json()) as { id: string };

  const url = new URL(location.href);
  url.search = `?${PARAM_SAVED}=${encodeURIComponent(id)}`;
  url.hash = '';
  return url.toString();
}

/**
 * If the current URL carries a `?saved=<id>`, fetch the stored state, restore
 * it, and reload. Returns true if a restore is in progress (the caller should
 * skip normal app initialization).
 */
export function maybeRestoreSavedGraph(): boolean {
  const id = new URLSearchParams(location.search).get(PARAM_SAVED);
  if (!id) return false;

  void (async () => {
    try {
      const response = await fetch(
        `${getApiBase()}/graphs/${encodeURIComponent(id)}`,
      );
      if (!response.ok) throw new Error(`${response.status}`);
      const state = (await response.json()) as SavedState;

      const url = new URL(location.href);
      url.search = state.search ?? '';
      url.hash = state.hash ?? '';
      location.replace(url.toString());
    } catch {
      // Restore failed — drop the param and load the empty app.
      const url = new URL(location.href);
      url.search = '';
      location.replace(url.toString());
    }
  })();

  return true;
}
