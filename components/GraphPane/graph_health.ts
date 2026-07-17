import type { GraphState } from '../GraphDiagram/graph_util.ts';

export type Health = {
  moduleCount: number;
  uniquePackages: number;
  totalInstallSize: number;
  sizedModules: number;
  maxDepth: number;
  deprecatedCount: number;
  duplicatePackages: number;
  duplicateCopies: number;
  missingLicenseCount: number;
  topLicenses: [string, number][];
  grade: { letter: string; score: number };
};

export function computeHealth(graph: GraphState): Health {
  const infos = [...graph.moduleInfos.values()];
  const versionsByName = new Map<string, Set<string>>();
  const licenseCounts = new Map<string, number>();

  let totalInstallSize = 0;
  let sizedModules = 0;
  let maxDepth = 0;
  let deprecatedCount = 0;
  let missingLicenseCount = 0;

  for (const { module, level } of infos) {
    if (module.isStub) continue;

    maxDepth = Math.max(maxDepth, level);

    const size = module.unpackedSize;
    if (typeof size === 'number') {
      totalInstallSize += size;
      sizedModules++;
    }

    if (module.package.deprecated) deprecatedCount++;

    let versions = versionsByName.get(module.name);
    if (!versions) {
      versions = new Set();
      versionsByName.set(module.name, versions);
    }
    if (module.version) versions.add(module.version);

    const licenses = module.getLicenses();
    if (licenses.length === 0) {
      missingLicenseCount++;
    } else {
      for (const license of licenses) {
        licenseCounts.set(license, (licenseCounts.get(license) ?? 0) + 1);
      }
    }
  }

  let duplicatePackages = 0;
  let duplicateCopies = 0;
  for (const versions of versionsByName.values()) {
    if (versions.size > 1) {
      duplicatePackages++;
      duplicateCopies += versions.size - 1;
    }
  }

  const topLicenses = [...licenseCounts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 4);

  const moduleCount = infos.filter(i => !i.module.isStub).length;

  return {
    moduleCount,
    uniquePackages: versionsByName.size,
    totalInstallSize,
    sizedModules,
    maxDepth,
    deprecatedCount,
    duplicatePackages,
    duplicateCopies,
    missingLicenseCount,
    topLicenses,
    grade: computeGrade({
      moduleCount,
      deprecatedCount,
      duplicatePackages,
      missingLicenseCount,
    }),
  };
}

// A rough, transparent health score: start at 100 and deduct for risk signals,
// scaled by graph size so a single issue in a huge graph isn't over-weighted.
export function computeGrade({
  moduleCount,
  deprecatedCount,
  duplicatePackages,
  missingLicenseCount,
}: {
  moduleCount: number;
  deprecatedCount: number;
  duplicatePackages: number;
  missingLicenseCount: number;
}) {
  const denom = Math.max(moduleCount, 1);
  const deprecatedRatio = deprecatedCount / denom;
  const duplicateRatio = duplicatePackages / denom;
  const missingLicenseRatio = missingLicenseCount / denom;

  const score = Math.max(
    0,
    Math.round(
      100 -
        deprecatedRatio * 220 -
        missingLicenseRatio * 160 -
        duplicateRatio * 120,
    ),
  );

  const letter =
    score >= 90
      ? 'A'
      : score >= 80
        ? 'B'
        : score >= 70
          ? 'C'
          : score >= 60
            ? 'D'
            : 'F';

  return { letter, score };
}
