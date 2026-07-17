import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  graphToCsv,
  graphToJson,
  graphToMarkdown,
  graphToMermaid,
} from './graph_export.ts';
import type { GraphState } from './graph_util.ts';

type FakeOptions = {
  deprecated?: string;
  size?: number;
  licenses?: string[];
};

const fakeModule = (key: string, options: FakeOptions = {}) => ({
  key,
  name: key.split('@')[0],
  version: key.split('@')[1],
  isUnnamed: false,
  package: { deprecated: options.deprecated },
  unpackedSize: options.size,
  getLicenses: () => options.licenses ?? ['MIT'],
});

function makeGraph(): GraphState {
  const foo = fakeModule('foo@1.0.0', { size: 100 });
  const bar = fakeModule('bar@2.0.0', { deprecated: 'old', licenses: ['ISC'] });

  type Dep = { module: ReturnType<typeof fakeModule>; type: string };

  const fooInfo = {
    module: foo,
    level: 0,
    upstream: new Set<Dep>(),
    downstream: new Set<Dep>([{ module: bar, type: 'dependencies' }]),
  };
  const barInfo = {
    module: bar,
    level: 1,
    upstream: new Set<Dep>([{ module: foo, type: 'dependencies' }]),
    downstream: new Set<Dep>(),
  };

  return {
    moduleInfos: new Map([
      [foo.key, fooInfo],
      [bar.key, barInfo],
    ]),
    entryModules: new Set([foo]),
  } as unknown as GraphState;
}

void test('graphToMermaid produces a flowchart with node lines', () => {
  const output = graphToMermaid(makeGraph());
  assert.ok(output.startsWith('graph LR'));
  assert.ok(output.includes('["foo@1.0.0"]'));
});

void test('graphToCsv has header and one row per module', () => {
  const lines = graphToCsv(makeGraph()).split('\n');
  assert.equal(
    lines[0],
    'key,name,version,level,deprecated,unpackedSize,licenses,dependencyCount',
  );
  assert.equal(lines.length, 3);
});

void test('graphToMarkdown includes a table header', () => {
  const output = graphToMarkdown(makeGraph());
  assert.ok(output.includes('| Module |'));
});

void test('graphToJson returns npmgraph metadata and modules', () => {
  const json = graphToJson(makeGraph());
  assert.equal(json.generatedBy, 'npmgraph');
  assert.equal(json.moduleCount, 2);
  assert.equal(json.modules.length, 2);
});
