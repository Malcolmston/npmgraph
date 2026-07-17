import type { GraphState } from './graph_util.ts';

/** Serializable JSON representation of the current dependency graph. */
export function graphToJson(graph: GraphState) {
  const modules = [...graph.moduleInfos.values()].map(info => ({
    key: info.module.key,
    name: info.module.name,
    version: info.module.version,
    level: info.level,
    deprecated: Boolean(info.module.package.deprecated),
    unpackedSize: info.module.unpackedSize,
    licenses: info.module.getLicenses(),
    dependencies: [...info.downstream].map(({ module, type }) => ({
      key: module.key,
      type,
    })),
  }));

  return {
    generatedBy: 'npmgraph',
    entryModules: [...graph.entryModules].map(m => m.key),
    moduleCount: modules.length,
    modules,
  };
}

/** Render the graph as a Mermaid flowchart. */
export function graphToMermaid(graph: GraphState) {
  const infos = [...graph.moduleInfos.values()];
  // Stable, mermaid-safe ids (keys contain @, /, etc.)
  const ids = new Map<string, string>();
  for (const [i, info] of infos.entries()) {
    ids.set(info.module.key, `n${i}`);
  }

  const lines = ['graph LR'];
  for (const info of infos) {
    const id = ids.get(info.module.key)!;
    const label = info.module.key.replaceAll('"', "'");
    lines.push(`  ${id}["${label}"]`);
  }
  for (const info of infos) {
    const fromId = ids.get(info.module.key)!;
    for (const { module, type } of info.downstream) {
      const toId = ids.get(module.key);
      if (!toId) continue;
      // Dashed arrow for peer deps, solid otherwise
      const arrow = type === 'peerDependencies' ? '-.->|peer|' : '-->';
      lines.push(`  ${fromId} ${arrow} ${toId}`);
    }
  }
  return lines.join('\n');
}

export function csvEscape(value: string | number | boolean | undefined) {
  const s = String(value ?? '');
  return /[",\n]/v.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Flat CSV of every module in the graph. */
export function graphToCsv(graph: GraphState) {
  const header = [
    'key',
    'name',
    'version',
    'level',
    'deprecated',
    'unpackedSize',
    'licenses',
    'dependencyCount',
  ];
  const rows = [...graph.moduleInfos.values()].map(info =>
    [
      info.module.key,
      info.module.name,
      info.module.version,
      info.level,
      Boolean(info.module.package.deprecated),
      info.module.unpackedSize,
      info.module.getLicenses().join(' '),
      info.downstream.size,
    ]
      .map(value => csvEscape(value))
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

/** Markdown table of every module in the graph. */
export function graphToMarkdown(graph: GraphState) {
  const entryNames = [...graph.entryModules].map(m => m.name).join(', ');
  const rows = [...graph.moduleInfos.values()]
    .toSorted(
      (a, b) => a.level - b.level || a.module.key.localeCompare(b.module.key),
    )
    .map(info => {
      const licenses = info.module.getLicenses().join(', ') || '—';
      const deprecated = info.module.package.deprecated ? '⚠️' : '';
      return `| ${info.module.key} | ${info.level} | ${licenses} | ${deprecated} |`;
    });
  return [
    `# Dependencies of ${entryNames || 'graph'}`,
    '',
    `${graph.moduleInfos.size} modules`,
    '',
    '| Module | Depth | Licenses | Deprecated |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}
