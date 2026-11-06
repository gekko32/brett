// Verifies that coaching mode is fully isolated from combat/Mayhem code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

function readAll(dir: string): string {
  let out = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out += readAll(p);
    else if (/\.(ts|js|mjs)$/.test(entry.name)) out += readFileSync(p, 'utf8') + '\n';
  }
  return out;
}

const serverSrcAll = readAll(join(__dir, '../src/server'));
const clientSrc = readFileSync(join(__dir, '../public/index.html'), 'utf8')
  + '\n' + readAll(join(__dir, '../src/client'));

test('index.html does not contain the word "mayhem"', () => {
  assert.ok(
    !/mayhem/i.test(clientSrc),
    'client code must not contain the word "mayhem" in any form'
  );
});

test('server source does not contain the word "mayhem"', () => {
  assert.ok(
    !/mayhem/i.test(serverSrcAll),
    'server source must not contain the word "mayhem" in any form'
  );
});

test('index.html does not contain gait, walking, or WASD movement tokens', () => {
  const walkingTokens = [
    'gait',
    'tickWalkAnimation',
    'tickWalk',
    'wasdKeys',
    'WALK_SPEED',
    'SPRINT_MULT',
    'walkTarget'
  ];
  for (const token of walkingTokens) {
    assert.ok(
      !clientSrc.includes(token),
      `client code must not contain the walking/gait token "${token}"`
    );
  }
});

test('server source does not contain the rejected custom-skins-listing tokens', () => {
  const rejectedTokens = [
    'SKINS_DIR',
    'listSkins',
    'slugifyForSkin'
  ];
  for (const token of rejectedTokens) {
    assert.ok(
      !serverSrcAll.includes(token),
      `server source must not contain the rejected custom skins token "${token}"`
    );
  }
});


test('add message carries the figure label', () => {
  assert.ok(/type:\s*['"]add['"][\s\S]{0,400}label/.test(clientSrc), 'add payload should include label');
});

// Gerald 06.11.2026: Patricks Ablaufleiste („Phase: Aufstellen (1/4)“) und der
// Spielmodus (CO-OP/WELLE/BOSS) sind entfernt und dürfen nicht zurückkommen.
test('Spielfeld ohne Patricks Ablaufleiste und Spielmodus', () => {
  const html = readFileSync(join(__dir, '../public/index.html'), 'utf8');
  for (const t of ['mountCoachingHud', 'coaching/hud.mjs', 'coop-hud', 'boss-hp']) {
    assert.ok(!html.includes(t), `index.html enthält noch "${t}"`);
  }
});

test('keine Anbindung an Patricks Website-Funktionen (Rundmeldung, 3D-Upload)', () => {
  for (const t of ['admin_broadcast', 'WEBSITE_INTERNAL_URL', 'BRETT_INTERNAL_ADMIN_SECRET', 'attachSkinsUpload']) {
    assert.ok(!serverSrcAll.includes(t), `Server enthält noch "${t}"`);
  }
});
