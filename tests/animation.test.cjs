const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const draws = [];
const ctx = new Proxy(
  {},
  {
    get: (o, k) =>
      o[k] ??
      ((...args) => {
        if (k === 'drawImage') draws.push(args);
      }),
    set: (o, k, v) => ((o[k] = v), true)
  }
);

const element = () => ({
  classList: { add() {}, remove() {}, toggle() {} },
  append() {},
  firstChild: {},
  textContent: '',
  getContext: () => ctx
});

const nodes = new Map();
const document = {
  querySelector: s => {
    if (!nodes.has(s)) nodes.set(s, element());
    return nodes.get(s);
  },
  querySelectorAll: () => [],
  createElement: element
};

class Image {
  complete = true;
  get naturalWidth() {
    return this.src?.includes('-selected') ? 2172 : 1536;
  }
  get naturalHeight() {
    return this.src?.includes('-selected') ? 724 : 1024;
  }
}

const sandbox = {
  document,
  Image,
  window: { addEventListener() {} },
  navigator: { getGamepads: () => [] },
  requestAnimationFrame() {},
  Math,
  console
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/characters/idle-alignment.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8'), sandbox);

const run = code => vm.runInContext(code, sandbox);
const pose = () => JSON.parse(run('JSON.stringify(playerSpritePose(players[0]))'));

// Idle alignment changes only the destination X, preserving every source cell
// and its original proportions, for all four athletes and six frames.
for (let athlete = 0; athlete < 4; athlete++) {
  for (let frame = 0; frame < 6; frame++) {
    run(`reset();players[${athlete}].vx=0;players[${athlete}].motionClock=${(frame + 0.1) / 4};`);
    draws.length = 0;
    run(`drawPlayerSprite(players[${athlete}]);`);
    const d = draws.at(-1);
    assert.equal(d[0], run(`animatedPlayerArt[${athlete}]`));
    assert.deepEqual(d.slice(1, 5), [frame * 256, 0, 256, 256]);
    assert.equal(d[5], -56 + run(`IDLE_ALIGNMENT_X[${athlete}][${frame}]`) * 112 / 256);
    assert.deepEqual(d.slice(6), [-112 * 246 / 256, 112, 112]);
  }
}

// Sample real animation clocks, ensuring every new drawing is reached.
for (const [speed, row] of [
  [0, 0],
  [245, 1]
]) {
  run(`reset();players[0].vx=${speed};updatePlayerMotion(players[0],0,true);`);
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    run('tickPlayerAnimation(players[0],1/60);updatePlayerMotion(players[0],1/60,true);');
    const p = pose();
    assert.equal(p.row, row);
    seen.add(p.frame);
  }
  assert.equal(seen.size, speed ? 12 : 6);
}

for (const action of ['attack', 'quick', 'double', 'feint']) {
  run(`reset();showAction(players[0],${JSON.stringify(action)});`);
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const p = pose();
    if (p.row === 2) seen.add(p.frame);
    run('tickPlayerAnimation(players[0],1/60);');
  }
  assert.equal(seen.size, 6);
  assert.notEqual(pose().row, 2);
  run(`showAction(players[0],${JSON.stringify(action)});`);
  assert.equal(pose().frame, 0);
}

// Use the real update/physics path: all six jump stages, then idle recovery.
run('mode=5;reset();running=true;serveTimer=100;keys.add("ArrowUp");');
const jumpFrames = new Set();
let airborne = false;
for (let i = 0; i < 90; i++) {
  run('update(1/120);');
  if (i === 0) run('keys.clear();');
  const p = pose();
  if (p.row === 3) jumpFrames.add(p.frame);
  airborne ||= run('players[0].y<FLOOR');
  if (i === 30) {
    const before = run('JSON.stringify([players,time])');
    run('paused=true;update(.2);paused=false;');
    assert.equal(run('JSON.stringify([players,time])'), before);
  }
}
for (let i = 0; i < 50; i++) {
  run('update(1/120);');
  const p = pose();
  if (p.row === 3) jumpFrames.add(p.frame);
}
assert(airborne);
assert.deepEqual([...jumpFrames].sort(), [0, 1, 2, 3, 4, 5]);
assert.equal(pose().row, 0);

// An attack close to the ground must yield to the landing pose.
run('showAction(players[0],"attack");players[0].landTime=.1;');
assert.deepEqual(pose(), { row: 3, frame: 5 });

// The original toss/receive cells are unchanged for all four athletes.
for (let i = 0; i < 4; i++) {
  for (const [action, frame] of [
    ['set', 4],
    ['receive', 3]
  ]) {
    run(`reset();showAction(players[${i}],${JSON.stringify(action)});drawPlayer(players[${i}]);`);
    const call = draws.at(-1);
    assert.equal(call[0].src, 'assets/volleyball-players-v2.png');
    assert.deepEqual(call.slice(1, 5), [frame * 256, i * 256, 256, 256]);
  }
}

// Each character gets its own atlas; partial and total load failures are safe.
for (let i = 0; i < 4; i++) {
  run(`reset();drawPlayer(players[${i}]);`);
  assert.equal(draws.at(-1)[0], run(`animatedPlayerArt[${i}]`));
  run(`animatedPlayerArt[${i}].complete=false;drawPlayer(players[${i}]);`);
  assert.equal(draws.at(-1)[0].src, 'assets/volleyball-players-v2.png');
  run(`animatedPlayerArt[${i}].complete=true;`);
}

run('reset();playerArt.complete=false;showAction(players[0],"set");drawPlayer(players[0]);');
assert.equal(draws.at(-1)[0], run('animatedPlayerArt[0]'));
run('animatedPlayerArt[0].complete=false;');
const count = draws.length;
run('drawPlayer(players[0]);');
assert.equal(draws.length, count);

run('playerArt.complete=true;animatedPlayerArt[0].complete=true;mode=0;reset();running=true;');
for (let i = 0; i < 1800; i++) {
  run('update(1/60);for(const p of players)drawPlayer(p);');
}
assert(run('players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))'));

// All four selected atlases use 12 native-size cells; each falls back independently.
for (let athlete = 0; athlete < 4; athlete++) {
  for (let frame = 0; frame < 12; frame++) {
    run(
      `reset();players[${athlete}].vx=245;players[${athlete}].motionClock=${(frame + 0.25) / 24};drawPlayer(players[${athlete}]);`
    );
    const c = draws.at(-1);
    assert.equal(c[0], run(`selectedRunArt[${athlete}]`));
    assert.deepEqual(c.slice(1, 5), [(frame % 6) * 362, Math.floor(frame / 6) * 362, 362, 362]);
  }
  run(`selectedRunArt[${athlete}].complete=false;drawPlayer(players[${athlete}]);`);
  assert.equal(draws.at(-1)[0], run(`animatedPlayerArt[${athlete}]`));
  assert.equal(draws.at(-1)[1], 5 * 256);
  run(`selectedRunArt[${athlete}].complete=true;`);
}

assert(!fs.readFileSync('game.js', 'utf8').includes('-run-v4'));
assert(!fs.readFileSync('character-preview.html', 'utf8').includes('-run-v4'));
console.log('PASS: all 48 selected run cells, independent loading fallbacks, idle/attack/jump, pause, original set/receive, 30s COM smoke test.');
