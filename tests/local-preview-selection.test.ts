import Module from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...args: unknown[]) {
  if (request === 'server-only') return {};
  return originalLoad.call(this, request, ...args);
};

async function helpers() {
  return import('../lib/local-preview.ts');
}

test('registration keeps local preview class and year IDs', async () => {
  const { findLocalClassId, findLocalYearId } = await helpers();
  assert.equal(findLocalClassId([{ id: 'local-1', name: 'Form 1', stream: null }], [], 'local-1'), 'local-1');
  assert.equal(findLocalYearId([{ id: 'local-year', name: '2026/2027' }], [], 'local-year'), 'local-year');
});

test('registration maps synced database IDs back to local preview IDs', async () => {
  const { findLocalClassId, findLocalYearId } = await helpers();
  const classes = [{ id: 'local-1', name: 'Form 1', stream: null }];
  assert.equal(findLocalClassId(classes, [{ id: 'db-1', name: 'Form 1', stream: null }], 'db-1'), 'local-1');
  const years = [{ id: 'local-year', name: '2026/2027' }];
  assert.equal(findLocalYearId(years, [{ id: 'db-year', name: '2026/2027' }], 'db-year'), 'local-year');
});

test('registration rejects unknown class and year IDs', async () => {
  const { findLocalClassId, findLocalYearId } = await helpers();
  assert.equal(findLocalClassId([], [], 'missing'), null);
  assert.equal(findLocalYearId([], [], 'missing'), null);
});
