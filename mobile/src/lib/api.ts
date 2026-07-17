import { API_BASE } from '@/lib/config';
import type { AuditResult, DependencyGraph, PackageInfo } from '@/lib/types';

async function getJson<T>(path: string): Promise<T> {
  // `ngrok-skip-browser-warning` bypasses ngrok's interstitial (which otherwise
  // returns an HTML page with no CORS headers). The API allows this header in
  // its CORS preflight response.
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'ngrok-skip-browser-warning': 'true', accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function getGraph(pkg: string): Promise<DependencyGraph> {
  return getJson<DependencyGraph>(`/graph?package=${encodeURIComponent(pkg)}`);
}

export async function getPackageInfo(pkg: string): Promise<PackageInfo> {
  return getJson<PackageInfo>(`/package-info?package=${encodeURIComponent(pkg)}`);
}

export async function getAudit(pkg: string): Promise<AuditResult> {
  return getJson<AuditResult>(`/audit?package=${encodeURIComponent(pkg)}`);
}

export async function getDependents(name: string): Promise<{
  name: string;
  dependents: { key: string; name: string; version: string }[];
}> {
  return getJson(`/dependents/${encodeURIComponent(name)}`);
}

export async function getMostDepended(limit = 20): Promise<{
  packages: { key: string; name: string; dependents: number }[];
}> {
  return getJson(`/most-depended?limit=${limit}`);
}
