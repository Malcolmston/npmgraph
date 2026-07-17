import human from '../../lib/human.ts';
import type { GraphState } from '../GraphDiagram/graph_util.ts';
import { computeHealth } from './graph_health.ts';
import * as styles from './GraphHealth.module.scss';

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string | number;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className={warn ? styles.statWarn : styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
      {hint ? <div className={styles.statHint}>{hint}</div> : null}
    </div>
  );
}

export default function GraphHealth({ graph }: { graph: GraphState }) {
  if (graph.moduleInfos.size === 0) return null;

  const h = computeHealth(graph);
  const sizeHint =
    h.sizedModules < h.moduleCount
      ? `${h.sizedModules}/${h.moduleCount} reported`
      : undefined;

  return (
    <div className={styles.root}>
      <div className={styles[`grade${h.grade.letter}` as keyof typeof styles]}>
        <div className={styles.gradeLetter}>{h.grade.letter}</div>
        <div className={styles.gradeScore}>{h.grade.score}/100</div>
      </div>
      <div className={styles.grid}>
        <Stat label="Modules" value={h.moduleCount} />
        <Stat label="Unique packages" value={h.uniquePackages} />
        <Stat
          label="Install size"
          value={human(h.totalInstallSize, 'B')}
          hint={sizeHint}
        />
        <Stat label="Max depth" value={h.maxDepth} />
        <Stat
          label="Deprecated"
          value={h.deprecatedCount}
          warn={h.deprecatedCount > 0}
        />
        <Stat
          label="Duplicate pkgs"
          value={h.duplicatePackages}
          hint={
            h.duplicateCopies > 0
              ? `+${h.duplicateCopies} extra copies`
              : undefined
          }
          warn={h.duplicatePackages > 0}
        />
        <Stat
          label="Missing license"
          value={h.missingLicenseCount}
          warn={h.missingLicenseCount > 0}
        />
        <Stat
          label="Top license"
          value={h.topLicenses[0]?.[0] ?? '—'}
          hint={h.topLicenses[0] ? `${h.topLicenses[0][1]} modules` : undefined}
        />
      </div>
    </div>
  );
}
