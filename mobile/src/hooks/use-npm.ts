import React from 'react';

import { getAudit, getGraph, getPackageInfo } from '@/lib/api';
import type { AuditResult, DependencyGraph, PackageInfo } from '@/lib/types';

export function useDebounce<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = React.useState<T>(value);

  React.useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(handle);
  }, [value, ms]);

  return debounced;
}

type FetchState<T> = { data: T | null; loading: boolean; error: string | null };

function useFetch<T>(
  fetcher: (pkg: string) => Promise<T>,
  pkg?: string,
): FetchState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!pkg) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let ignore = false;
    setLoading(true);
    setError(null);

    fetcher(pkg)
      .then((result) => {
        if (ignore) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setData(null);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (ignore) return;
        setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [pkg]);

  return { data, loading, error };
}

export function usePackageInfo(pkg?: string): FetchState<PackageInfo> {
  return useFetch(getPackageInfo, pkg);
}

export function useGraph(pkg?: string): FetchState<DependencyGraph> {
  return useFetch(getGraph, pkg);
}

export function useAudit(pkg?: string): FetchState<AuditResult> {
  return useFetch(getAudit, pkg);
}
