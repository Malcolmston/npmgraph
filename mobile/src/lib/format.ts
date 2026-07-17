import type { GraphNode, NodeCategory, PackageScore } from '@/lib/types';

export function formatBytes(n?: number): string {
  if (!n) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const rounded = i === 0 ? Math.round(value).toString() : value.toFixed(1);
  return `${rounded} ${units[i]}`;
}

export function formatCount(n?: number | null): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs < 1000) return n.toString();
  const units: [number, string][] = [
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1_000, 'K'],
  ];
  for (const [threshold, suffix] of units) {
    if (abs >= threshold) {
      const value = n / threshold;
      const str =
        value % 1 === 0 || value >= 100
          ? Math.round(value).toString()
          : value.toFixed(1);
      return `${str}${suffix}`;
    }
  }
  return n.toString();
}

export function categoryOf(node: GraphNode): NodeCategory {
  if ((node.vulnerabilities ?? 0) > 0) return 'vulnerable';
  if (node.deprecated) return 'deprecated';
  if (node.level === 0) return 'root';
  return 'transitive';
}

export function categoryColor(cat: NodeCategory): string {
  switch (cat) {
    case 'root':
      return '#4f6bed';
    case 'transitive':
      return '#9aa0ad';
    case 'deprecated':
      return '#d9a200';
    case 'vulnerable':
      return '#d64545';
  }
}

export function categoryLabel(cat: NodeCategory): string {
  switch (cat) {
    case 'root':
      return 'Direct';
    case 'transitive':
      return 'Transitive';
    case 'deprecated':
      return 'Deprecated';
    case 'vulnerable':
      return 'Vulnerable';
  }
}

export function scorePct(score?: PackageScore | null): number | null {
  if (typeof score?.final === 'number') return Math.round(score.final * 100);
  return null;
}
