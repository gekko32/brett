import { test } from 'node:test';
import assert from 'node:assert/strict';
import { naechsteHaltung } from '../src/client/presets-logik';

test('Haltung umschalten: erneuter Klick führt zurück zum Stehen', () => {
  assert.equal(naechsteHaltung('stand', 'tpose'), 'tpose');
  assert.equal(naechsteHaltung('tpose', 'tpose'), 'stand');
  assert.equal(naechsteHaltung('kneel', 'prone'), 'prone');
  assert.equal(naechsteHaltung(undefined, 'kneel'), 'kneel');
});

test('Stehen lässt sich nicht auflösen', () => {
  assert.equal(naechsteHaltung('stand', 'stand'), 'stand');
});
