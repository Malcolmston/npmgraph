import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffDependencies } from './audit.js';

test('diffDependencies detects a removed dependency', () => {
  const diff = diffDependencies({ left: '^1.0.0' }, {});
  assert.deepEqual(diff.removed, [{ name: 'left', version: '^1.0.0' }]);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.changed, []);
  assert.equal(diff.unchanged, 0);
});

test('diffDependencies detects an added dependency', () => {
  const diff = diffDependencies({}, { right: '^2.0.0' });
  assert.deepEqual(diff.added, [{ name: 'right', version: '^2.0.0' }]);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changed, []);
  assert.equal(diff.unchanged, 0);
});

test('diffDependencies detects a changed version', () => {
  const diff = diffDependencies({ dep: '^1.0.0' }, { dep: '^2.0.0' });
  assert.deepEqual(diff.changed, [
    { name: 'dep', from: '^1.0.0', to: '^2.0.0' },
  ]);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.equal(diff.unchanged, 0);
});

test('diffDependencies counts unchanged dependencies', () => {
  const diff = diffDependencies({ dep: '^1.0.0' }, { dep: '^1.0.0' });
  assert.equal(diff.unchanged, 1);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changed, []);
});

test('diffDependencies handles a mix of all cases', () => {
  const diff = diffDependencies(
    { keep: '^1.0.0', drop: '^1.0.0', bump: '^1.0.0' },
    { keep: '^1.0.0', bump: '^2.0.0', fresh: '^3.0.0' },
  );
  assert.deepEqual(diff.removed, [{ name: 'drop', version: '^1.0.0' }]);
  assert.deepEqual(diff.added, [{ name: 'fresh', version: '^3.0.0' }]);
  assert.deepEqual(diff.changed, [
    { name: 'bump', from: '^1.0.0', to: '^2.0.0' },
  ]);
  assert.equal(diff.unchanged, 1);
});

test('diffDependencies treats undefined maps as empty', () => {
  const diff = diffDependencies(undefined, undefined);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changed, []);
  assert.equal(diff.unchanged, 0);
});
