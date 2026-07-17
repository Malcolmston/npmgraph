import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphToDot } from './graph.js';
import type { DependencyGraph } from './graph.js';

const graph: DependencyGraph = {
  root: 'a@1',
  nodeCount: 2,
  edgeCount: 1,
  nodes: [
    { key: 'a@1', name: 'a', version: '1', level: 0, deprecated: false },
    { key: 'b@1', name: 'b', version: '1', level: 1, deprecated: false },
  ],
  edges: [{ from: 'a@1', to: 'b@1', type: 'dependencies' }],
};

test('graphToDot renders a DOT digraph header', () => {
  const dot = graphToDot(graph);
  assert.ok(dot.startsWith('digraph {'), 'should start with "digraph {"');
  assert.ok(dot.includes('rankdir="LR"'), 'should set rankdir');
});

test('graphToDot marks the root node distinctly', () => {
  const dot = graphToDot(graph);
  // Root nodes get the "root" category class and a heavier colored border.
  assert.match(dot, /"a@1" \[[^\]]*class="npmg-root"[^\]]*penwidth=2/);
});

test('graphToDot colors nodes by category', () => {
  const dot = graphToDot(graph);
  // The transitive child b@1 is filled with the transitive category color.
  assert.match(dot, /"b@1" \[[^\]]*class="npmg-transitive"/);
  assert.ok(dot.includes('style="rounded,filled"'), 'nodes should be filled');
});

test('graphToDot renders edges with EDGE_ATTRS for the type', () => {
  const dot = graphToDot(graph);
  assert.ok(
    dot.includes('"a@1" -> "b@1" [color=black]'),
    'dependencies edge should use [color=black]',
  );
});

test('graphToDot uses dashed peer edge attributes', () => {
  const peerGraph: DependencyGraph = {
    ...graph,
    edges: [{ from: 'a@1', to: 'b@1', type: 'peerDependencies' }],
  };
  const dot = graphToDot(peerGraph);
  assert.ok(
    dot.includes('"a@1" -> "b@1" [color=black style=dashed label="peer"]'),
    'peer edge should be dashed with a label',
  );
});
