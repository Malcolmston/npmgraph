const REGISTRY = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org';

type Person = { name?: string; email?: string; url?: string } | string;

type FullVersion = {
  name: string;
  version: string;
  description?: string;
  license?: unknown;
  homepage?: string;
  keywords?: string[];
  repository?: { url?: string } | string;
  maintainers?: Person[];
  author?: Person;
  deprecated?: string;
  dist?: { unpackedSize?: number; fileCount?: number; tarball?: string };
};

type FullPackument = {
  name: string;
  'dist-tags'?: Record<string, string>;
  time?: Record<string, string>;
  maintainers?: Person[];
  versions: Record<string, FullVersion>;
};

export type PackageInfo = {
  name: string;
  version: string;
  description?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  keywords: string[];
  deprecated: string | false;
  maintainers: Array<{ name?: string; email?: string }>;
  author?: { name?: string; email?: string; url?: string };
  dist: { unpackedSize?: number; fileCount?: number };
  published?: { created?: string; modified?: string; thisVersion?: string };
  downloadsLastMonth: number | null;
  score: {
    source: 'npms.io' | 'heuristic';
    final: number;
    quality?: number;
    popularity?: number;
    maintenance?: number;
  } | null;
};

function person(p?: Person): { name?: string; email?: string; url?: string } | undefined {
  if (!p) return undefined;
  if (typeof p === 'string') return { name: p };
  return { name: p.name, email: p.email, url: p.url };
}

function licenseString(license: unknown): string | undefined {
  if (typeof license === 'string') return license;
  if (license && typeof license === 'object' && 'type' in license) {
    return String((license as { type: unknown }).type);
  }
  return undefined;
}

function repoUrl(repo: FullVersion['repository']): string | undefined {
  if (!repo) return undefined;
  const url = typeof repo === 'string' ? repo : repo.url;
  return url?.replace(/^git\+/, '').replace(/\.git$/, '');
}

async function getDownloadsLastMonth(name: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.npmjs.org/downloads/point/last-month/${name}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { downloads?: number };
    return typeof data.downloads === 'number' ? data.downloads : null;
  } catch {
    return null;
  }
}

async function getNpmsScore(name: string): Promise<PackageInfo['score']> {
  try {
    const response = await fetch(
      `https://api.npms.io/v2/package/${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      score?: {
        final?: number;
        detail?: { quality?: number; popularity?: number; maintenance?: number };
      };
    };
    const s = data.score;
    if (!s || typeof s.final !== 'number') return null;
    return {
      source: 'npms.io',
      final: s.final,
      quality: s.detail?.quality,
      popularity: s.detail?.popularity,
      maintenance: s.detail?.maintenance,
    };
  } catch {
    return null;
  }
}

/** Transparent fallback score in [0,1] from signals we already have. */
function heuristicScore(
  info: Omit<PackageInfo, 'score'>,
  updated?: string,
): PackageInfo['score'] {
  let s = 0;
  if (info.repository) s += 0.15;
  if (info.license) s += 0.15;
  if (info.description) s += 0.1;
  if (!info.deprecated) s += 0.2;
  const dl = info.downloadsLastMonth ?? 0;
  if (dl > 0) s += Math.min(0.25, Math.log10(dl + 1) / 8); // ~0.25 around 10M/mo
  if (updated) {
    const ageDays =
      (Date.parse(new Date().toISOString()) - Date.parse(updated)) /
      86_400_000;
    if (Number.isFinite(ageDays) && ageDays < 365) s += 0.15;
    else if (Number.isFinite(ageDays) && ageDays < 730) s += 0.07;
  }
  return { source: 'heuristic', final: Math.min(1, Math.round(s * 100) / 100) };
}

/** Fetch maintainers, metadata, downloads, and a quality score for a package. */
export async function getPackageInfo(spec: string): Promise<PackageInfo> {
  const at = spec.lastIndexOf('@');
  const name = at > 0 ? spec.slice(0, at) : spec;
  const range = at > 0 ? spec.slice(at + 1) : 'latest';

  const response = await fetch(`${REGISTRY}/${name.replace('/', '%2F')}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch "${name}": ${response.status}`);
  }
  const pack = (await response.json()) as FullPackument;

  const version =
    pack['dist-tags']?.[range] && pack.versions[pack['dist-tags'][range]]
      ? pack['dist-tags'][range]
      : pack.versions[range]
        ? range
        : (pack['dist-tags']?.latest ?? Object.keys(pack.versions).at(-1) ?? '');
  const v = pack.versions[version];
  if (!v) throw new Error(`Could not resolve "${name}@${range}"`);

  const maintainers = (v.maintainers ?? pack.maintainers ?? [])
    .map(m => person(m))
    .filter((m): m is { name?: string; email?: string } => Boolean(m));

  const [downloadsLastMonth, npmsScore] = await Promise.all([
    getDownloadsLastMonth(name),
    getNpmsScore(name),
  ]);

  const base: Omit<PackageInfo, 'score'> = {
    name: v.name,
    version: v.version,
    description: v.description,
    license: licenseString(v.license),
    homepage: v.homepage,
    repository: repoUrl(v.repository),
    keywords: v.keywords ?? [],
    deprecated: v.deprecated ?? false,
    maintainers,
    author: person(v.author),
    dist: { unpackedSize: v.dist?.unpackedSize, fileCount: v.dist?.fileCount },
    published: {
      created: pack.time?.created,
      modified: pack.time?.modified,
      thisVersion: pack.time?.[version],
    },
    downloadsLastMonth,
  };

  return {
    ...base,
    score: npmsScore ?? heuristicScore(base, pack.time?.modified),
  };
}
