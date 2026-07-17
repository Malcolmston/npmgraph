import {
  categoryColor,
  categoryLabel,
  categoryOf,
  formatBytes,
  formatCount,
  scorePct,
} from '@/lib/format';
import type { GraphNode, NodeCategory } from '@/lib/types';

function node(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    key: 'pkg@1.0.0',
    name: 'pkg',
    version: '1.0.0',
    level: 1,
    deprecated: false,
    ...overrides,
  };
}

describe('formatBytes', () => {
  it('returns em dash for falsy / undefined input', () => {
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(0)).toBe('—');
  });

  it('formats raw bytes with no decimals', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats kilobytes with one decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes and gigabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
});

describe('formatCount', () => {
  it('returns em dash for null / undefined', () => {
    expect(formatCount(null)).toBe('—');
    expect(formatCount(undefined)).toBe('—');
  });

  it('returns the raw number below 1000', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(500)).toBe('500');
    expect(formatCount(999)).toBe('999');
  });

  it('abbreviates thousands with a K suffix', () => {
    expect(formatCount(1000)).toBe('1K');
    expect(formatCount(1200)).toBe('1.2K');
    expect(formatCount(150000)).toBe('150K');
  });

  it('abbreviates millions and billions', () => {
    expect(formatCount(1_500_000)).toBe('1.5M');
    expect(formatCount(2_000_000_000)).toBe('2B');
  });

  it('preserves the sign for negative counts', () => {
    expect(formatCount(-1200)).toBe('-1.2K');
  });
});

describe('categoryOf', () => {
  it('is vulnerable when vulnerabilities > 0 (highest precedence)', () => {
    expect(categoryOf(node({ vulnerabilities: 1, deprecated: true, level: 0 }))).toBe(
      'vulnerable',
    );
  });

  it('is deprecated when flagged and no vulnerabilities', () => {
    expect(categoryOf(node({ deprecated: true, level: 0 }))).toBe('deprecated');
  });

  it('is root at level 0', () => {
    expect(categoryOf(node({ level: 0 }))).toBe('root');
  });

  it('is transitive otherwise', () => {
    expect(categoryOf(node({ level: 3 }))).toBe('transitive');
    expect(categoryOf(node({ level: 2, vulnerabilities: 0 }))).toBe('transitive');
  });
});

describe('categoryColor / categoryLabel', () => {
  const cats: NodeCategory[] = ['root', 'transitive', 'deprecated', 'vulnerable'];

  it('returns a distinct hex color per category', () => {
    const colors = cats.map(categoryColor);
    expect(new Set(colors).size).toBe(cats.length);
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('maps each category to its expected label', () => {
    expect(categoryLabel('root')).toBe('Direct');
    expect(categoryLabel('transitive')).toBe('Transitive');
    expect(categoryLabel('deprecated')).toBe('Deprecated');
    expect(categoryLabel('vulnerable')).toBe('Vulnerable');
  });
});

describe('scorePct', () => {
  it('returns null when score is missing', () => {
    expect(scorePct(null)).toBeNull();
    expect(scorePct(undefined)).toBeNull();
  });

  it('rounds a 0..1 final score into a 0..100 percentage', () => {
    expect(scorePct({ source: 'npms', final: 0.876 })).toBe(88);
    expect(scorePct({ source: 'npms', final: 1 })).toBe(100);
    expect(scorePct({ source: 'npms', final: 0 })).toBe(0);
  });
});
