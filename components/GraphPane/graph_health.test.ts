import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GraphState } from '../GraphDiagram/graph_util.ts';
import { computeGrade, computeHealth } from './graph_health.ts';

type FakeModuleSpec = {
  name: string;
  version: string;
  deprecated?: boolean;
  unpackedSize?: number;
  licenses?: string[];
  isStub?: boolean;
  level?: number;
};

function makeInfo({
  name,
  version,
  deprecated = false,
  unpackedSize = 0,
  licenses = ['MIT'],
  isStub = false,
  level = 0,
}: FakeModuleSpec) {
  return {
    module: {
      isStub,
      name,
      version,
      key: `${name}@${version}`,
      package: { deprecated },
      unpackedSize,
      getLicenses: () => licenses,
    },
    level,
    upstream: new Set(),
    downstream: new Set(),
  };
}

function makeGraph(specs: FakeModuleSpec[]): GraphState {
  const moduleInfos = new Map(
    specs.map(spec => {
      const info = makeInfo(spec);
      return [info.module.key, info];
    }),
  );
  const entryModules = new Set(
    specs
      .filter(spec => spec.level === 0)
      .map(spec => `${spec.name}@${spec.version}`),
  );
  return {
    moduleInfos,
    entryModules,
    failedEntryModules: new Map(),
  } as unknown as GraphState;
}

void test('computeGrade: clean graph scores 100 → A', () => {
  const grade = computeGrade({
    moduleCount: 10,
    deprecatedCount: 0,
    duplicatePackages: 0,
    missingLicenseCount: 0,
  });
  assert.equal(grade.score, 100);
  assert.equal(grade.letter, 'A');
});

void test('computeGrade: mostly deprecated scores low → F', () => {
  const grade = computeGrade({
    moduleCount: 10,
    deprecatedCount: 9,
    duplicatePackages: 0,
    missingLicenseCount: 0,
  });
  assert.ok(grade.score < 60, `expected score < 60, got ${grade.score}`);
  assert.equal(grade.letter, 'F');
});

void test('computeHealth: computes core stats and excludes stubs', () => {
  const health = computeHealth(
    makeGraph([
      { name: 'a', version: '1.0.0', unpackedSize: 100, level: 0 },
      { name: 'b', version: '2.0.0', unpackedSize: 200, level: 1 },
      {
        name: 'c',
        version: '3.0.0',
        unpackedSize: 300,
        level: 2,
        isStub: true,
      },
    ]),
  );

  assert.equal(health.moduleCount, 2, 'stub excluded from moduleCount');
  assert.equal(health.uniquePackages, 2);
  assert.equal(health.totalInstallSize, 300, 'sum of non-stub unpackedSize');
  assert.equal(health.maxDepth, 1, 'stub level ignored');
});

void test('computeHealth: counts deprecated modules', () => {
  const health = computeHealth(
    makeGraph([
      { name: 'a', version: '1.0.0', deprecated: true },
      { name: 'b', version: '1.0.0', deprecated: false },
    ]),
  );

  assert.equal(health.deprecatedCount, 1);
});

void test('computeHealth: detects duplicate packages', () => {
  const health = computeHealth(
    makeGraph([
      { name: 'dup', version: '1.0.0' },
      { name: 'dup', version: '2.0.0' },
      { name: 'solo', version: '1.0.0' },
    ]),
  );

  assert.equal(health.duplicatePackages, 1);
  assert.equal(health.duplicateCopies, 1);
  assert.equal(health.uniquePackages, 2);
});
