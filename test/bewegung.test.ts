import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winkelAbstand } from '../src/client/bewegung';

test('Hinwenden nimmt den kürzesten Weg', () => {
  const nahe = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  assert.ok(nahe(winkelAbstand(0, Math.PI / 2), Math.PI / 2));
  // von 350° nach 10° sind es +20°, nicht −340°
  assert.ok(nahe(winkelAbstand((350 * Math.PI) / 180, (10 * Math.PI) / 180), (20 * Math.PI) / 180));
  assert.ok(nahe(winkelAbstand((10 * Math.PI) / 180, (350 * Math.PI) / 180), (-20 * Math.PI) / 180));
  // mehrfache Umdrehungen werden herausgerechnet
  assert.ok(nahe(winkelAbstand(0, 4 * Math.PI + 0.1), 0.1));
});
