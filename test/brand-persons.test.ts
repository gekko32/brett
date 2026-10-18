// brett/test/brand-persons.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPersonsForBrand } from '../public/assets/coaching/brand.mjs';

const PERSONS = [
  { key: 'portrait-a', label: 'A', brand: 'korczewski' },
  { key: 'portrait-b', label: 'B', brand: 'korczewski' },
  { key: 'generic-1', label: 'Generic' },
];

test('mentolder hides korczewski-tagged persons', () => {
  const out = filterPersonsForBrand(PERSONS, 'mentolder');
  assert.deepEqual(out.map((p: any) => p.key), ['generic-1']);
});

test('korczewski shows its own persons + untagged', () => {
  const out = filterPersonsForBrand(PERSONS, 'korczewski');
  assert.deepEqual(out.map((p: any) => p.key), ['portrait-a', 'portrait-b', 'generic-1']);
});

test('unknown/undefined brand fails safe — hides all brand-tagged persons', () => {
  const out = filterPersonsForBrand(PERSONS, undefined);
  assert.deepEqual(out.map((p: any) => p.key), ['generic-1']);
});
