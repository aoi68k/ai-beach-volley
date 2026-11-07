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
    if (this.src?.includes('serve-v1')) return 1774;
    return this.src?.includes('flying-receive')
      ? 2064
      : /toss-hit|receive-hit/.test(this.src)
        ? 1254
        : this.src?.includes('-selected')
          ? 2172
          : 1536;
  }
  get naturalHeight() {
    if (this.src?.includes('serve-v1')) return 887;
    return this.src?.includes('flying-receive')
      ? 1536
      : /toss-hit|receive-hit/.test(this.src)
        ? 1254
        : this.src?.includes('-selected')
          ? 724
          : 1024;
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
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8'), sandbox);

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

// Each jump/landing foot edge stays on the physics anchor without resizing.
const jumpFeet = [[250,250,221,207,250,250], [248,248,215,206,237,248],
  [251,251,210,212,251,251], [251,251,225,212,251,251]];
for (let athlete = 0; athlete < 4; athlete++) {
  for (let frame = 0; frame < 6; frame++) {
    const age = [0, .08, .2, .3, .4, 0][frame];
    const vy = [-650, -500, -300, 0, 300, 0][frame];
    run(`reset();Object.assign(players[${athlete}], {y:FLOOR-${frame === 5 ? 0 : 100}, jumpAge:${age}, vy:${vy}, landTime:${frame === 5 ? .1 : 0}});`);
    draws.length = 0;
    run(`drawPlayerSprite(players[${athlete}]);`);
    const d = draws.at(-1);
    assert.deepEqual(d.slice(1, 5), [frame * 256, 768, 256, 256]);
    assert.equal(d[6] + jumpFeet[athlete][frame] * d[8] / 256, 0);
    assert.deepEqual(d.slice(7), [112, 112]);
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
  assert.deepEqual([...seen], action === 'feint' ? [0, 1, 2, 3, 4, 5] : [4, 5]);
  assert.notEqual(pose().row, 2);
  run(`showAction(players[0],${JSON.stringify(action)});`);
  assert.equal(pose().frame, action === 'feint' ? 0 : 4);
}

// Airborne shot input holds cell 3 until actual ball contact starts cells 5 -> 6.
run('mode=5;reset();serveTimer=0;players[0].y=FLOOR-130;players[0].vy=0;ball.x=1000;keys.add("KeyZ");updateActivePlayer(players[0],0,[]);');
assert.deepEqual(pose(), { row: 2, frame: 2 });
assert.equal(run('ball.lastHitter'), null);
run('keys.clear();updateActivePlayer(players[0],0,[]);');
assert.notEqual(pose().row, 2);
run('players[0].y=FLOOR;updateActivePlayer(players[0],0,[]);players[0].y=FLOOR-130;keys.add("KeyZ");ball.x=players[0].x;ball.y=players[0].y-39;updateActivePlayer(players[0],0,[]);keys.clear();');
assert.equal(run('ball.lastHitter===players[0]'), true);
assert.deepEqual(pose(), { row: 2, frame: 4 });
run('tickPlayerAnimation(players[0],.12);');
assert.deepEqual(pose(), { row: 2, frame: 5 });

// Jump + A on the first airborne tick must never use the ground receive pose.
for (const contact of [false, true]) {
  run(`mode=5;reset();serveTimer=0;ball.x=${contact ? 'players[0].x' : '1000'};ball.y=FLOOR-39;keys.add("ArrowUp");keys.add("KeyZ");updateActivePlayer(players[0],1/120,[]);keys.clear();`);
  assert.equal(run('players[0].y < FLOOR && players[0].y > FLOOR-35'), true);
  assert.deepEqual(pose(), { row: 2, frame: contact ? 4 : 2 });
  if (contact) {
    assert.equal(run('ball.lastShot'), 'attack');
    run('tickPlayerAnimation(players[0],.12);');
    assert.deepEqual(pose(), { row: 2, frame: 5 });
  }
}
// Even immediately before landing, A is an attack until the feet reach the sand.
run('reset();serveTimer=0;players[0].y=FLOOR-.5;players[0].vy=100;ball.x=players[0].x;ball.y=FLOOR-39;keys.add("KeyZ");updateActivePlayer(players[0],0,[]);keys.clear();');
assert.equal(run('ball.lastShot'), 'attack');
assert.deepEqual(pose(), { row: 2, frame: 4 });
run('reset();serveTimer=0;ball.x=players[0].x;ball.y=FLOOR-39;keys.add("KeyZ");updateActivePlayer(players[0],0,[]);keys.clear();');
assert.equal(run('ball.lastShot'), 'receive');
assert.deepEqual(pose(), { receive: true, frame: 1 });

// Use the real update/physics path: all six jump stages, then idle recoveryFrames.
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

// The original toss ready/receive cells are unchanged for all four athletes.
for (let i = 0; i < 4; i++) {
  for (const [action, frame] of [
    ['set', 4],
    ['receive', 3]
  ]) {
    run(`reset();showAction(players[${i}],${JSON.stringify(action)});players[${i}].setAge=.3;players[${i}].receiveAge=.3;drawPlayer(players[${i}]);`);
    const call = draws.at(-1);
    assert.equal(call[0].src, 'assets/volleyball-players-v2.png');
    assert.deepEqual(call.slice(1, 5), [frame * 256, i * 256, 256, 256]);
  }
}

// Receive hit uses one new cell per athlete, then returns to the existing stance.
for (let i = 0; i < 4; i++) {
  run(`reset();showAction(players[${i}],"receive");drawPlayer(players[${i}]);`);
  const d = draws.at(-1);
  assert.equal(d[0], run('receiveHitArt'));
  assert.deepEqual(d.slice(1, 5), [(i % 2) * 627, Math.floor(i / 2) * 627, 627, 627]);
  assert.equal(d[6], -100 * [606, 607, 605, 605][i] / 627);
  assert.deepEqual(d.slice(7), [100, 100]);
  run(`tickPlayerAnimation(players[${i}],.299);`);
  assert.equal(run(`playerSpritePose(players[${i}]).receive`), true);
  run(`tickPlayerAnimation(players[${i}],.001);drawPlayer(players[${i}]);`);
  assert.equal(draws.at(-1)[0], run('playerArt'));
  run(`showAction(players[${i}],"receive");receiveHitArt.complete=false;drawPlayer(players[${i}]);`);
  assert.equal(draws.at(-1)[0], run('playerArt'));
  assert.deepEqual(draws.at(-1).slice(1, 5), [3 * 256, i * 256, 256, 256]);
  run(`playerArt.complete=false;drawPlayer(players[${i}]);`);
  assert.equal(draws.at(-1)[0], run(`animatedPlayerArt[${i}]`));
  run('receiveHitArt.complete=true;playerArt.complete=true;');
}

// Each character gets its own atlas; partial and total load failures are safe.
for (let i = 0; i < 4; i++) {
  run(`reset();drawPlayer(players[${i}]);`);
  assert.equal(draws.at(-1)[0], run(`animatedPlayerArt[${i}]`));
  run(`animatedPlayerArt[${i}].complete=false;drawPlayer(players[${i}]);`);
  assert.equal(draws.at(-1)[0].src, 'assets/volleyball-players-v2.png');
  run(`animatedPlayerArt[${i}].complete=true;`);
}

run('reset();playerArt.complete=false;showAction(players[0],"set");players[0].setAge=.3;drawPlayer(players[0]);');
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
      `reset();players[${athlete}].vx=${athlete < 2 ? 245 : -245};players[${athlete}].motionClock=${(frame + 0.25) / 24};drawPlayer(players[${athlete}]);`
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

// Backward movement reverses the full running loop for both teams and wraps safely.
for (let athlete = 0; athlete < 4; athlete++) {
  for (let phase = 0; phase < 24; phase++) {
    run(`reset();players[${athlete}].vx=${athlete < 2 ? -245 : 245};players[${athlete}].motionClock=${(phase + .25) / 24};drawPlayer(players[${athlete}]);`);
    const d = draws.at(-1);
    const frame = 11 - phase % 12;
    assert.equal(d[0], run(`selectedRunArt[${athlete}]`));
    assert.deepEqual(d.slice(1, 5), [(frame % 6) * 362, Math.floor(frame / 6) * 362, 362, 362]);
  }
  run(`selectedRunArt[${athlete}].complete=false;drawPlayer(players[${athlete}]);`);
  assert.equal(draws.at(-1)[0], run(`animatedPlayerArt[${athlete}]`));
  assert.equal(draws.at(-1)[1], 0);
  run(`selectedRunArt[${athlete}].complete=true;`);
}
assert(!fs.readFileSync('js/game.js', 'utf8').includes('back-dash'));
assert(!fs.readFileSync('js/game.js', 'utf8').includes('-run-v4'));
assert(!fs.readFileSync('character-preview.html', 'utf8').includes('-run-v4'));
// The block hitbox selects fixed source cell 3; recoveryFrames selects source cell 5.
for (let athlete = 0; athlete < 4; athlete++) {
  run(`reset();players[${athlete}].y=FLOOR-100;showAction(players[${athlete}], 'block');players[${athlete}].blockFrames=.4;`);
  for (const remaining of [.4, .2, .001, 0]) {
    run(`players[${athlete}].blockFrames=${remaining};drawPlayer(players[${athlete}]);`);
    const call = draws.at(-1);
    assert.equal(call[0].src, 'assets/characters/block-v1.png');
    assert.deepEqual(call.slice(1, 5), [(remaining > 0 ? 2 : 4) * 256, athlete * 256, 256, 256]);
  }
}
// A successful interception removes the hitbox and shows source cell 4.
run("reset();players[0].y=FLOOR-100;players[0].x=NET-30;players[0].blockFrames=.3;showAction(players[0],'block');ball.x=players[0].x;ball.y=players[0].y-75;ball.lastSide=1;ball.lastShot='attack';");
assert.equal(run('tryBlock(players[0])'), true);
assert.deepEqual(pose(), { block: true, frame: 3 });
run("showAction(players[0], 'block');players[0].blockFrames=.4;");
assert.deepEqual(pose(), { block: true, frame: 2 });
run('players[0].blockFrames=0;');
assert.deepEqual(pose(), { block: true, frame: 4 });
run('players[0].y=FLOOR;players[0].landTime=.1;');
assert.deepEqual(pose(), { row: 3, frame: 5 });
// Missing block art uses the original overhead pose, then the v3 fallback.
run("reset();players[0].y=FLOOR-100;players[0].blockFrames=.4;blockArt.complete=false;drawPlayer(players[0]);");
assert.equal(draws.at(-1)[0].src, 'assets/volleyball-players-v2.png');
assert.equal(draws.at(-1)[1], 4 * 256);
run('playerArt.complete=false;drawPlayer(players[0]);');
assert.equal(draws.at(-1)[0], run('animatedPlayerArt[0]'));
run('blockArt.complete=true;playerArt.complete=true;');

// Toss input uses the existing ready frame; only contact selects the new art.
run('mode=5;reset();serveTimer=0;ball.x=1000;keys.add("KeyX");updateActivePlayer(players[0],0,[]);');
assert.deepEqual(pose(), { legacy: true, frame: 4 });
assert.equal(run('ball.lastHitter'), null);
run('keys.clear();updateActivePlayer(players[0],0,[]);');
assert.equal(pose().row, 0);
run('keys.add("KeyX");ball.x=players[0].x;ball.y=players[0].y-39;updateActivePlayer(players[0],0,[]);keys.clear();');
assert.equal(run('ball.lastShot'), 'set');
assert.deepEqual(pose(), { toss: true, frame: 1 });
run('tickPlayerAnimation(players[0],.3);');
assert.deepEqual(pose(), { legacy: true, frame: 4 });
for (let i=0;i<4;i++) {
  run(`reset();showAction(players[${i}],'set');drawPlayer(players[${i}]);`);
  const call=draws.at(-1);
  assert.equal(call[0].src, 'assets/characters/toss-hit-v2.png');
  assert.deepEqual(call.slice(1,5), [(i%2)*627, i < 2 ? 0 : 606, 627, i < 2 ? 606 : 648]);
}
run('tossHitArt.complete=false;drawPlayer(players[3]);');
assert.equal(draws.at(-1)[0].src, 'assets/volleyball-players-v2.png');
run('playerArt.complete=false;drawPlayer(players[3]);');
assert.equal(draws.at(-1)[0], run('animatedPlayerArt[3]'));
run('tossHitArt.complete=true;playerArt.complete=true;');

// Ground receive preparation holds while A is pressed, and releases without a cooldown.
const courtW = run('W'), courtNet = run('NET');
const p0InitX = run('INITIAL_PLAYER_X[0]');
run('mode=5;reset();ball.x=1000;keys.add("KeyZ");updateActivePlayer(players[0],1/60,[]);');
assert.equal(run('players[0].receiveReady'), true);
assert.deepEqual(pose(), { legacy: true, frame: 3 });
run('keys.add("ArrowLeft");updateActivePlayer(players[0],1/60,[]);');
assert.equal(run('players[0].x'), p0InitX);
assert.equal(run('players[0].vx'), 0);
run('keys.delete("KeyZ");updateActivePlayer(players[0],1/60,[]);keys.clear();');
assert.equal(run('players[0].receiveReady'), false);
assert(run('players[0].x') < p0InitX);
assert.equal(run('players[0].recoveryFrames'), 0);
// Jump+A and B take priority; holding A still hits as soon as the ball arrives.
run('reset();ball.x=1000;keys.add("KeyZ");updateActivePlayer(players[0],1/60,[]);keys.add("ArrowUp");updateActivePlayer(players[0],1/60,[]);keys.clear();');
assert.equal(run('players[0].receiveReady'), false);
assert.equal(run('players[0].attackReady'), true);
assert(run('players[0].y < FLOOR'));
run('reset();ball.x=1000;keys.add("KeyZ");keys.add("KeyX");updateActivePlayer(players[0],1/60,[]);keys.clear();');
assert.equal(run('players[0].receiveReady'), false);
assert.deepEqual(pose(), { legacy: true, frame: 4 });
run('reset();serveTimer=0;ball.x=1000;keys.add("KeyZ");updateActivePlayer(players[0],1/60,[]);ball.x=players[0].x;ball.y=FLOOR-39;updateActivePlayer(players[0],1/60,[]);keys.clear();');
assert.equal(run('ball.lastShot'), 'receive');
assert.equal(run('players[0].receiveReady'), false);
assert(run('players[0].recoveryFrames > 0'));
// Gamepad A uses the same stance and COMs keep approaching until in range.
run('reset();ball.x=1000;updateActivePlayer(players[0],1/60,[{axes:[0,0],buttons:Array.from({length:16},(_,i)=>({pressed:i===2}))}]);');
assert.equal(run('players[0].receiveReady'), true);
run('mode=0;reset();ball.x=400;ball.y=450;ball.vx=0;ball.vy=0;updateActivePlayer(players[0],1/60,[]);');
assert.equal(run('players[0].receiveReady'), false);
assert(run('players[0].x') > p0InitX);

// Ground toss preparation and lingering toss/receive poses cannot slide.
run('mode=5;reset();ball.x=1000;keys.add("ArrowRight");keys.add("KeyX");updateActivePlayer(players[0],.016,[]);');
assert.equal(run('players[0].x'), p0InitX);
assert.equal(run('players[0].vx'), 0);
assert.deepEqual(pose(), { legacy: true, frame: 4 });
run('keys.delete("KeyX");updateActivePlayer(players[0],.016,[]);keys.clear();');
assert(run('players[0].x') > p0InitX);
for (const action of ['set','receive']) {
  run(`reset();ball.x=1000;showAction(players[0],'${action}');players[0].recoveryFrames=0;keys.add("ArrowRight");updateActivePlayer(players[0],.016,[]);`);
  assert.equal(run('players[0].x'), p0InitX);
  assert.equal(run('players[0].vx'), 0);
  run('players[0].actionFrames=.001;updateActivePlayer(players[0],.016,[]);keys.clear();');
  assert(run('players[0].x') > p0InitX);
}
// Jump remains locked after input recovery ends, until the ground pose expires.
for (const action of ['set', 'receive']) {
  for (const fps of [30, 60, 120]) {
    run(`mode=5;reset();ball.x=1000;showAction(players[0],'${action}');players[0].recoveryFrames=0;keys.add('ArrowUp');`);
    for (let tick = 0; tick < fps / 2; tick++) {
      run(`updateActivePlayer(players[0],${1 / fps},[]);`);
      assert.equal(run('players[0].y'), run('FLOOR'));
      assert.equal(run('players[0].vy'), 0);
    }
    run(`players[0].actionFrames=0;updateActivePlayer(players[0],${1 / fps},[]);keys.clear();`);
    assert(run('players[0].y < FLOOR'));
    assert(run('players[0].vy < 0'));
  }
}
// Holding toss preparation also plants the feet until the button is released.
run("reset();ball.x=1000;keys.add('KeyX');keys.add('ArrowUp');updateActivePlayer(players[0],1/60,[]);");
assert.equal(run('players[0].y'), run('FLOOR'));
run("keys.delete('KeyX');updateActivePlayer(players[0],1/60,[]);keys.clear();");
assert(run('players[0].y < FLOOR'));

// Airborne momentum remains available; a ground movement lock does not affect it.
run("reset();ball.x=1000;players[0].y=FLOOR-100;players[0].vx=100;showAction(players[0],'set');updateActivePlayer(players[0],.016,[]);");
assert(run('players[0].x') > p0InitX);
// A COM teammate still approaches a distant second touch before taking its stance.
run('mode=0;reset();ball.x=400;ball.y=450;ball.vx=0;ball.vy=0;ball.touchSide=0;ball.teamTouches=1;players[1].cooldownFrames=2;updateActivePlayer(players[0],.016,[]);');
assert.equal(run('players[0].setReady'), false);
assert(run('players[0].x') > p0InitX);

// Flying receive: ground A when ball is horizontally distant dives faster/further, pops ball higher, and has longer 3-stage recoveryFrames.
run('mode=5;reset();serveTimer=0;ball.x=players[0].x;ball.y=FLOOR-39;keys.add("KeyZ");updateActivePlayer(players[0],0,[]);keys.clear();');
const normalReceiveVy = run('ball.vy');
const normalReceiveRecovery = run('players[0].recoveryFrames');

run('mode=5;reset();serveTimer=0;ball.x=players[0].x+160;ball.y=FLOOR-35;ball.vx=0;ball.vy=0;keys.add("KeyZ");keys.add("ArrowRight");');
const seenFlyingFrames = new Set();
for (let i = 0; i < 65; i++) {
  run('updateActivePlayer(players[0],1/60,[]);');
  if (i === 0) run('keys.clear();');
  const p = pose();
  if (p.flying) seenFlyingFrames.add(p.frame);
}
assert.equal(run('ball.lastShot'), 'flying');
assert(run('ball.vy') < normalReceiveVy);
assert(run('ACTION_RECOVERY_FRAMES.flying') > normalReceiveRecovery);
assert.deepEqual([...seenFlyingFrames].sort(), [0, 1, 2]);
assert.equal(pose().row, 0);

// A alone or the wrong direction never dives; either ball-facing direction does.
for (const direction of [-1, 1]) {
  for (const lever of [-1, 0, 1]) {
    run(`mode=5;reset();serveTimer=0;players[0].x=300;ball.x=300+${direction}*160;ball.y=FLOOR-35;ball.vx=0;ball.vy=0;keys.add("KeyZ");`);
    if (lever) run(`keys.add('${lever < 0 ? 'ArrowLeft' : 'ArrowRight'}');`);
    run('updateActivePlayer(players[0],0,[]);keys.clear();');
    assert.equal(run('players[0].action === "flying"'), lever === direction);
    if (lever === direction) assert.equal(run('players[0].diveDir'), direction);
  }
}

// All 4 athletes render all 3 flying receive cells and fall back safely when unloaded.
for (let athlete = 0; athlete < 4; athlete++) {
  for (const [frame, age] of [
    [0, 0.05],
    [1, 0.35],
    [2, 0.7]
  ]) {
    run(`reset();showAction(players[${athlete}],'flying');players[${athlete}].diveAge=${age};drawPlayer(players[${athlete}]);`);
    const call = draws.at(-1);
    assert.equal(call[0].src, 'assets/characters/flying-receive-v1.png');
    assert.deepEqual(call.slice(1, 5), [frame * 688, athlete * 384, 688, 384]);
  }
}
run("reset();showAction(players[2],'flying');flyingReceiveArt.complete=false;drawPlayer(players[2]);");
assert.equal(draws.at(-1)[0].src, 'assets/volleyball-players-v2.png');
assert.equal(draws.at(-1)[1], 3 * 256);
run('playerArt.complete=false;drawPlayer(players[2]);');
assert.equal(draws.at(-1)[0], run('animatedPlayerArt[2]'));
run('flyingReceiveArt.complete=true;playerArt.complete=true;');

// Frame-authored lockouts expire after the same simulation time at 30/60/120Hz.
for (const hz of [30,60,120]) {
  run('mode=5;reset();running=true;serveTimer=100;players[0].recoveryFrames=30;players[0].cooldownFrames=17;players[0].actionFrames=54;');
  for(let i=0;i<hz/2-1;i++) run(`updateActivePlayer(players[0],${1/hz},[]);`);
  assert(run('players[0].recoveryFrames') > 0);
  run(`updateActivePlayer(players[0],${1/hz},[]);`);
  assert.equal(run('players[0].recoveryFrames'),0);
  assert.equal(run('players[0].cooldownFrames'),0);
  assert(Math.abs(run('players[0].actionFrames')-24)<1e-6);
}
run('players[0].recoveryFrames=18;paused=true;update(.2);paused=false;');
assert.equal(run('players[0].recoveryFrames'),18);
run('reset();ball.doubleAttack=true;hit(players[0],true);');
assert.equal(run('players[0].recoveryFrames'),72);
assert.equal(run('players[0].cooldownFrames'),17);
assert.equal(run('players[0].actionFrames'),54);
assert(run('Object.values(FRAME_RULES).every(Number.isInteger)'));
assert(run('Object.values(ACTION_RECOVERY_FRAMES).every(Number.isInteger)'));

// Running kicks sand backward; neutral, airborne and wall-blocked movement do not.
for (const direction of [-1,1]) {
  run(`mode=5;reset();running=true;serveTimer=100;players[0].x=300;keys.add('${direction<0?'ArrowLeft':'ArrowRight'}');`);
  for(let i=0;i<15;i++)run('updateActivePlayer(players[0],1/60,[]);');
  run('keys.clear();');
  assert(run('particles.some(p=>p.kind==="sand")'));
  assert(run(`particles.filter(p=>p.kind==='sand').every(p=>Math.sign(p.vx)===${-direction})`));
}
for (const setup of ['', 'players[0].y=FLOOR-300;', 'players[0].x=clampCourtX(-100,0);keys.add("ArrowLeft");']) {
  run(`reset();running=true;serveTimer=100;${setup}`);
  for(let i=0;i<15;i++)run('updateActivePlayer(players[0],1/60,[]);');
  run('keys.clear();');
  assert.equal(run('particles.length'),0);
}
run('reset();running=true;serveTimer=100;keys.add("ArrowRight");');
for(let i=0;i<15;i++)run('update(1/60);');
run('keys.clear();');
const sandBeforePause=run('JSON.stringify(particles)');
run('paused=true;update(.2);paused=false;');
assert.equal(run('JSON.stringify(particles)'),sandBeforePause);
run('running=false;');
for(let i=0;i<60;i++)run('update(1/60);');
assert.equal(run('particles.filter(p=>p.kind==="sand").length'),0);
run('reset();');
assert.equal(run('particles.length'),0);

// Real jump physics emits one takeoff burst and one landing burst, never each frame.
run("mode=5;reset();running=true;serveTimer=100;var originalImpactEmitter=emitImpactSand;var impactEvents=[];emitImpactSand=(p,event,strength)=>{impactEvents.push(event);originalImpactEmitter(p,event,strength);};keys.add('ArrowUp');update(1/60);keys.clear();");
assert.equal(run('particles.filter(p=>p.event==="jump").length'),35);
assert(run('particles.some(p=>p.event==="jump" && p.streak)'));
for(let i=0;i<80;i++)run('update(1/60);');
assert.equal(run('impactEvents.join(",")'),'jump,land');
assert(run('particles.some(p=>p.event==="land" && p.puff)'));
run('emitImpactSand=originalImpactEmitter;running=false;');
for(let i=0;i<60;i++)run('update(1/60);');
assert.equal(run('particles.length'),0);

// One shared speed overlay appears only on normal attack contact, never wind-up/follow-through.
for (let i=0;i<4;i++) {
  run(`reset();showAction(players[${i}],'attack');`);
  draws.length=0;run(`drawAttackSwoosh(players[${i}]);`);
  assert.equal(draws.length,1);
  assert.equal(draws[0][0].src,'assets/effects/attack-swoosh-v1.png');
  run(`tickPlayerAnimation(players[${i}],seconds(FRAME_RULES.attackContact));`);
  draws.length=0;run(`drawAttackSwoosh(players[${i}]);`);assert.equal(draws.length,0);
}
for (const action of ['set','receive','block','quick','double','feint','flying']) {
  run(`reset();showAction(players[0],'${action}');`);
  draws.length=0;run('drawAttackSwoosh(players[0]);');assert.equal(draws.length,0);
}
run("reset();players[0].y=FLOOR-100;players[0].attackReady=true;");
draws.length=0;run('drawAttackSwoosh(players[0]);');assert.equal(draws.length,0);

// Ball spin follows speed, freezes while stationary/paused, and remains time-based.
run('reset();ball.vx=120;ball.vy=0;updateBallSpin(.1);');
const slowSpin=run('ball.rotation');
run('ball.rotation=0;ball.vx=960;updateBallSpin(.1);');
assert(Math.abs(run('ball.rotation')-slowSpin*8)<1e-9);
run('ball.vx=0;ball.vy=0;');const stoppedSpin=run('ball.rotation');
run('updateBallSpin(1);');assert.equal(run('ball.rotation'),stoppedSpin);
run('running=true;paused=true;ball.vx=720;update(.1);');assert.equal(run('ball.rotation'),stoppedSpin);
run('paused=false;');
for(const hz of [30,60,120]) {
  run('reset();ball.vx=400;ball.vy=0;');
  for(let i=0;i<hz;i++)run(`updateBallSpin(${1/hz});`);
  assert(Math.abs(run('ball.rotation')-6)<1e-8);
}

// Slow balls have no afterimages; faster balls gain opacity and a longer history.
run('reset();ball.vy=0;ball.vx=300;recordBallTrail();');
assert.equal(run('ballTrailStyle().count'), 0);
draws.length = 0;
run('drawBallTrail(attackBallShape());');
assert.equal(draws.length, 0);
run('ball.vx=500;');
const mediumTrail = JSON.parse(run('JSON.stringify(ballTrailStyle())'));
run('ball.vx=-960;ball.vy=0;for(let i=0;i<30;i++){ball.x-=16;recordBallTrail();}');
assert.equal(run('ball.trail.length'), 14);
assert(run('ballTrailStyle().alpha') > mediumTrail.alpha);
assert(run('ballTrailStyle().count') > mediumTrail.count);
draws.length = 0;
run('drawBallTrail(attackBallShape());');
assert.equal(draws.length, 14);
run('ball.vx=0;ball.vy=960;');
assert.equal(run('ballTrailStyle().count'), 14);
run('ball.vx=100;ball.vy=0;recordBallTrail();');
assert.equal(run('ball.trail.length'), 0);
assert.equal(run('ballTrailStyle().alpha'), 0);
run('ball.vx=960;recordBallTrail();serve(0);');
assert.equal(run('ball.trail.length'), 0);

// Solo checks share match controls and physics, with a repeating, score-free ball.
run('startCharacterCheck();');
const checkStartX = run('NET - 100');
assert.equal(run('players.length'), 1);
assert.equal(run('players[0].human'), 1);
assert(run('window.rallyGame.snapshot().ball !== null'));
assert.equal(run('serveTimer'), 0);
run("keys.add('ArrowRight');update(.1);");
assert(run('players[0].x') > checkStartX);
run("keys.delete('ArrowRight');keys.add('ArrowLeft');update(.2);");
assert(run('players[0].x') < checkStartX);
assert.equal(run('playerSpritePose(players[0]).selectedRun'), true);
// Neutral jumps cannot steer in midair; running jumps retain takeoff velocity.
run('startCharacterCheck();keys.add("ArrowUp");update(1/60);keys.clear();keys.add("ArrowRight");update(1/60);keys.clear();');
assert.equal(run('players[0].vx'), 0);
assert.equal(run('players[0].x'), checkStartX);
run('startCharacterCheck();keys.add("ArrowRight");keys.add("ArrowUp");update(1/60);keys.clear();keys.add("ArrowLeft");update(1/60);keys.clear();');
assert.equal(run('players[0].vx'), run('HUMAN_SPEED'));
run('for(let i=0;i<90;i++)update(1/60);');
assert.equal(run('players[0].y'), run('FLOOR'));
assert(run('players[0].x <= NET-28'));
// Compare the entire player state through the common pipeline for normal and check modes.
for (const setup of [
  'keys.add("ArrowRight");keys.add("ArrowUp");',
  'ball.x=players[0].x;ball.y=FLOOR-39;keys.add("KeyZ");',
  'ball.x=players[0].x;ball.y=FLOOR-39;keys.add("KeyX");',
  'players[0].y=FLOOR-100;ball.x=NET+100;keys.add("KeyX");',
  'players[0].y=FLOOR-100;ball.x=NET+100;keys.add("KeyZ");',
  'ball.x=players[0].x+160;ball.y=FLOOR-35;keys.add("ArrowRight");keys.add("KeyZ");'
]) {
  const results=[];
  for (const check of [false, true]) {
    run(`startCharacterCheck();characterCheck=${check};${setup}update(1/60);keys.clear();`);
    results.push(run('JSON.stringify(players[0])'));
  }
  assert.equal(results[0], results[1]);
}
run('startCharacterCheck();paused=true;keys.add("ArrowRight");');
const soloX = run('players[0].x');
const soloBallY = run('ball.y');
run('update(.1);');
assert.equal(run('players[0].x'), soloX);
assert.equal(run('ball.y'), soloBallY);
run('startCharacterCheck();');
assert.equal(run('players[0].x'), checkStartX);
assert.equal(run('paused'), false);
// Repeated landings relaunch on alternating sides without score, point events or pauses.
for (let i=0;i<4;i++) {
  run('ball.y=FLOOR-ball.r-1;ball.vy=200;updateBall(1/60);');
  assert.equal(run('ball.x'), courtNet + (i%2===0 ? 42 : -42));
  assert.equal(run('ball.vx'), 0);
  assert.equal(run('ball.vy'), -620);
  assert.equal(run('pointEnd'), null);
  assert.equal(run('winner'), false);
  assert.equal(run('score.join(",")'), '0,0');
  assert.equal(run('serveTimer'), 0);
  assert.equal(run('audioEvents.some(e=>e.name==="point"||e.name==="win")'), false);
}
run('for(let i=0;i<600;i++)update(1/60);');
assert.equal(run('score.join(",")'), '0,0');
assert.equal(run('pointEnd'), null);
assert(run('running && ball.y < FLOOR'));
run('window.rallyGame.start();');
assert.equal(run('characterCheck'), false);
assert.equal(run('players.length'), 4);
assert(run('ball !== null'));

// Solo gauge gain is 2 points per second, independent of FPS, and pauses with the game.
for (const hz of [30, 60, 120]) {
  run('startCharacterCheck();');
  run(`for(let i=0;i<${hz};i++)update(${1 / hz});`);
  assert.equal(run('players[0].gauge'), 2);
  assert.equal(run('players[0].specials'), 0);
  run(`for(let i=0;i<${hz * 4};i++)update(${1 / hz});`);
  assert.equal(run('players[0].gauge'), 0);
  assert.equal(run('players[0].specials'), 1);
}
run('startCharacterCheck();update(.5);paused=true;update(3);');
assert.equal(run('players[0].gauge'), 0);
run('paused=false;update(.5);');
assert.equal(run('players[0].gauge'), 2);
run('update(.5);startCharacterCheck();update(.5);');
assert.equal(run('players[0].gauge'), 0);
run('window.rallyGame.start();serveTimer=100;update(1);');
assert(run('players.every(p=>p.gauge===0&&p.specials===0)'));

// Gauge rewards occur on crossing, once per return, with both teams treated equally.
for (const side of [0, 1]) {
  for (const [touches, bonus] of [[1, 1], [2, 2], [3, 3], [4, 1], [5, 0], [8, 0]]) {
    const hitter = side * 2;
    run(`reset();ball.lastHitter=players[${hitter}];ball.touchSide=${side};ball.teamTouches=${touches};ball.x=NET+${side ? 1 : -1};ball.y=200;ball.vx=${side ? -120 : 120};ball.vy=0;awardBallReturn();`);
    assert.equal(run(`players[${hitter}].gauge`), 0);
    run('updateBall(1/60);');
    assert.equal(run(`players[${hitter}].gauge`), bonus + 2);
    assert.equal(run(`players[${hitter + 1}].gauge`), bonus);
    assert.equal(run(`players[${side ? 0 : 2}].gauge`), 0);
    run('awardBallReturn();updateBall(1/60);');
    assert.equal(run(`players[${hitter}].gauge`), bonus + 2);
    assert.equal(run('ball.teamTouches'), 0);
    // A teammate touching again starts a fresh touch sequence after a return.
    run(`recordTouch(players[${hitter + 1}]);`);
    assert.equal(run('ball.teamTouches'), 1);
  }
}
// Crossing below the net, automatic serves, and dead balls give no points.
run('reset();ball.x=NET+1;ball.y=200;awardBallReturn();');
assert.equal(run('players[0].gauge'), 0);
run('ball.lastHitter=players[0];recordTouch(players[0]);ball.y=NETTOP;awardBallReturn();');
assert.equal(run('players[0].gauge'), 0);
run('ball.y=200;pointEnd={side:0,time:1};awardBallReturn();');
assert.equal(run('players[0].gauge'), 0);
// The whole reward converts to one special at 10+, with no overflow retained.
run('reset();players[0].gauge=8;players[1].gauge=7;ball.lastHitter=players[0];ball.touchSide=0;ball.teamTouches=3;ball.x=NET+1;ball.y=200;awardBallReturn();');
assert.equal(run('players[0].gauge'), 0);
assert.equal(run('players[1].gauge'), 0);
assert.equal(run('players[0].specials'), 1);
assert.equal(run('players[1].specials'), 1);
run('players[0].gauge=4;serve(1);');
assert.equal(run('players[0].gauge'), 4);
assert.equal(run('players[0].specials'), 1);
run('reset();');
assert(run('players.every(p=>p.gauge===0&&p.specials===0)'));

// Receives gain loft; normal and high tosses keep the same landing target.
run('mode=5;reset();ball.x=300;ball.y=FLOOR-39;hit(players[0],false,"receive");');
const receiveVy = run('ball.vy');
const previousReceiveVy = (run('FLOOR') - 14 - run('FLOOR-39') - .5 * run('GRAVITY') * 1.25 ** 2) / 1.25;
assert(receiveVy < previousReceiveVy);
for (const side of [0, 1]) {
  for (const high of [false, true]) {
    run(`reset();ball.x=${side ? 900 : 300};ball.y=FLOOR-39;hit(players[${side * 2}],true,undefined,false,false,${high});`);
    assert.equal(run('ball.vy'), high ? -520 : -410);
    const landingX = run('ball.x+ball.vx*((-ball.vy+Math.sqrt(ball.vy*ball.vy+2*GRAVITY*(FLOOR-14-ball.y)))/GRAVITY)');
    assert(Math.abs(landingX - (side ? courtNet + 95 : courtNet - 95)) < 1e-8);
  }
}
// Each keyboard and the gamepad can request high toss through the shared input path.
for (const [index, downKey, setKey] of [[0,'ArrowDown','KeyX'],[1,'KeyC','KeyV'],[2,'KeyN','KeyM'],[3,'Numpad5','Numpad2']]) {
  run(`mode=5;reset();serveTimer=0;ball.x=players[${index}].x;ball.y=FLOOR-39;keys.add('${downKey}');keys.add('${setKey}');updateActivePlayer(players[${index}],0,[]);keys.clear();`);
  assert.equal(run('ball.lastShot'), 'set');
  assert.equal(run('ball.vy'), -520);
}
for (const dpad of [false, true]) {
  run(`reset();serveTimer=0;ball.x=players[0].x;ball.y=FLOOR-39;updateActivePlayer(players[0],0,[{axes:[0,${dpad ? 0 : 1}],buttons:Array.from({length:16},(_,i)=>({pressed:i===1||(${dpad}&&i===13)}))}]);`);
  assert.equal(run('ball.vy'), -520);
}

// Specials cap at nine for both return rewards and timed check-mode gains.
run('players[0].specials=8;players[0].gauge=8;addGauge(players[0],2);');
assert.equal(run('players[0].specials'), 9);
run('addGauge(players[0],10);');
assert.equal(run('players[0].specials'), 9);
assert.equal(run('players[0].gauge'), 0);
run('startCharacterCheck();players[0].specials=9;players[0].gauge=8;for(let i=0;i<60;i++)update(1/60);');
assert.equal(run('players[0].specials'), 9);
assert.equal(run('players[0].gauge'), 0);

// Real quick/double contacts select distinct glows; receptions and serves clear them.
run('mode=5;reset();players[0].y=FLOOR-100;ball.x=players[0].x;ball.y=players[0].y-39;ball.lastShot="set";ball.lastSide=0;ball.vy=-200;hit(players[0],false);');
assert.equal(run('ball.quickAttack'), true);
assert.equal(run('ball.doubleAttack'), false);
assert.equal(run('ballGlowColor()'), '#ffe13b');
run('players[1].y=FLOOR;hit(players[1],false,"receive");');
assert.equal(run('ball.quickAttack'), false);
assert.equal(run('ballGlowColor()'), null);
run('reset();players[0].y=FLOOR-100;ball.x=players[0].x;ball.y=players[0].y-39;ball.lastWasReturn=true;ball.lastHitter=players[1];ball.lastShot="attack";hit(players[0],false);');
assert.equal(run('ball.doubleAttack'), true);
assert.equal(run('ball.quickAttack'), false);
assert.equal(run('ballGlowColor()'), '#ff8a24');
run('pointEnd={side:0,time:1};');
assert.equal(run('ballGlowColor()'), null);
run('serve(0);');
assert.equal(run('ballGlowColor()'), null);
assert.equal(run('ball.quickAttack'), false);

// Continuous airborne A charges at the same rate at any simulation FPS.
for (const hz of [30, 60, 120]) {
  run('mode=5;reset();serveTimer=0;ball.x=1000;keys.add("KeyZ");');
  run(`for(let i=0;i<${hz / 2};i++){players[0].y=FLOOR-130;players[0].vy=0;updateActivePlayer(players[0],${1 / hz},[]);}`);
  assert(Math.abs(run('players[0].attackChargeFrames') - 30) < 1e-8);
  run('keys.clear();');
}
// Same contact point: more wind-up gives faster attacks, quicks and doubles on both teams.
for (const side of [0, 1]) {
  for (const kind of ['attack', 'quick', 'double']) {
    const speeds=[];
    for (const charge of [0,15,30,60]) {
      run(`reset();players[${side * 2}].y=300;players[${side * 2}].attackChargeFrames=${charge};ball.x=${side ? 700 : 500};ball.y=261;ball.vy=-100;ball.lastSide=${side};ball.lastShot='${kind === 'quick' ? 'set' : 'attack'}';ball.lastWasReturn=${kind === 'double'};ball.lastHitter=${kind === 'double' ? `players[${side * 2 + 1}]` : 'null'};hit(players[${side * 2}],false,'attack');`);
      speeds.push(run('Math.hypot(ball.vx,ball.vy)'));
      assert.equal(run(`players[${side * 2}].attackChargeFrames`), 0);
      assert.equal(run('ball.quickAttack'), kind === 'quick');
      assert.equal(run('ball.doubleAttack'), kind === 'double');
    }
    assert(speeds[1] > speeds[0]);
    assert(speeds[2] > speeds[1]);
    assert.equal(speeds[3],speeds[2]);
  }
}
// Releasing A, switching to B/feint, landing or being locked out loses the charge.
for (const change of ['keys.clear();', 'keys.add("KeyX");', 'keys.add("ArrowLeft");', 'players[0].y=FLOOR;', 'players[0].recoveryFrames=5;', 'players[0].cooldownFrames=5;', 'players[0].blockFrames=5;']) {
  run(`mode=5;reset();serveTimer=0;players[0].y=300;players[0].attackChargeFrames=15;ball.x=1000;keys.add("KeyZ");${change}updateActivePlayer(players[0],0,[]);keys.clear();`);
  assert.equal(run('players[0].attackChargeFrames'), 0);
}
run('startCharacterCheck();players[0].y=300;ball.x=1000;keys.add("KeyZ");update(.25);paused=true;');
const heldCharge = run('players[0].attackChargeFrames');
run('update(1);keys.clear();');
assert.equal(run('players[0].attackChargeFrames'), heldCharge);

// Specials consume exactly one SP on airborne contact, override feint/block input,
// and do not activate on the ground, without SP or when merely preparing.
for (const [set, special] of [[true,'mozu'],[false,'empowered']]) {
  for (const side of [0,1]) {
    const i=side*2;
    run(`mode=5;reset();serveTimer=0;players[${i}].specials=2;players[${i}].y=350;players[${i}].x=${side?650:550};ball.x=${side?610:590};ball.y=311;keys.add('${bindingsKey(i,'down')}');keys.add('${bindingsKey(i,set?'set':'shot')}');updateActivePlayer(players[${i}],0,[]);keys.clear();`);
    assert.equal(run('ball.specialShot'),special);
    assert.equal(run(`players[${i}].specials`),1);
    assert.equal(run('ballGlowColor()'),'#399dff');
    assert.equal(run('ball.doubleAttack || ball.quickAttack'),false);
  }
}
function bindingsKey(i,kind) {
  return kind==='down' ? ['ArrowDown','KeyC','KeyN','Numpad5'][i]
    : kind==='set' ? ['KeyX','KeyV','KeyM','Numpad2'][i] : ['KeyZ','KeyG','KeyK','Numpad1'][i];
}
for (const setup of ['players[0].y=FLOOR;players[0].specials=2;', 'players[0].y=350;players[0].specials=0;']) {
  run(`mode=5;reset();serveTimer=0;${setup}ball.x=players[0].x;ball.y=players[0].y-39;keys.add('ArrowDown');keys.add('KeyX');updateActivePlayer(players[0],0,[]);keys.clear();`);
  assert.equal(run('ball.specialShot'),null);
}
run('reset();serveTimer=0;players[0].y=350;players[0].specials=2;ball.x=1000;keys.add("ArrowDown");keys.add("KeyZ");updateActivePlayer(players[0],1/60,[]);keys.clear();');
assert.equal(run('players[0].specials'),2);
assert.equal(run('ball.specialShot'),null);
// The lob rises smoothly and reaches the same target before diving at every FPS.
for(const side of [0,1]) for(const hz of [30,60,120]) {
  run(`mode=5;reset();players[${side*2}].y=350;players[${side*2}].specials=1;ball.x=${side?700:500};ball.y=311;hit(players[${side*2}],true,undefined,false,false,true);`);
  assert.equal(run('ball.mozuPhase'),'rise');
  assert(run('ball.vy<0'));
  for(let n=0;n<hz*2&&run('ball.mozuPhase')==='rise';n++)run(`updateBall(${1/hz});`);
  assert.equal(run('ball.mozuPhase'),'dive');
  assert.equal(run('ball.x'), side ? courtNet - 150 : courtNet + 150);
  assert(run('ball.vy>=1100'));
  assert(run('ball.y<100'));
  assert.equal(run('players[0].specials+players[2].specials'),0);
}
// An empowered shot forces aerial block, set and attack contacts backward identically.
for(const side of [0,1]) for(const action of ['block','set','attack']) {
  const i=side*2;
  run(`mode=5;reset();players[${i}].x=${side?650:550};players[${i}].y=350;players[${i}].specials=2;ball.x=players[${i}].x;ball.y=${action==='block'?'players['+i+'].y-75':'players['+i+'].y-39'};ball.lastSide=${1-side};ball.lastShot='attack';ball.specialShot='empowered';`);
  if(action==='block') {
    run(`players[${i}].blockFrames=30;`);
    assert.equal(run(`tryBlock(players[${i}])`),true);
  } else run(`hit(players[${i}],${action==='set'},'${action}',false,false,true);`);
  assert.equal(Math.sign(run(`players[${i}].knockback`)),side?1:-1);
  assert.equal(Math.abs(run(`players[${i}].knockback`)),1800);
  assert.equal(Math.sign(run('ball.vx')),side?1:-1);
  assert.equal(run('ball.vy'),-650);
  assert.equal(run('ball.specialShot'),null);
  assert.equal(run(`players[${i}].specials`),2);
  assert(run(`players[${i}].recoveryFrames>=48`));
}
// Ground receivers take the ground knockback, while teammates ignore it.
for(const sameTeam of [false,true]) {
  run(`reset();players[0].y=${sameTeam?350:'FLOOR'};ball.x=players[0].x;ball.y=players[0].y-39;ball.lastSide=${sameTeam?0:1};ball.specialShot='empowered';hit(players[0],false,'receive');`);
  assert.equal(run('players[0].knockback'), sameTeam ? 0 : -900);
  assert.equal(run('ball.specialShot'),null);
}

// COMs occasionally choose either special at real aerial contact, and otherwise save SP.
const originalRandom = Math.random;
try {
  for (const [rolls, expected] of [[[.4,.1],'mozu'], [[.1,.9],'empowered'], [[.99],null]]) {
    run('mode=0;reset();serveTimer=0;players[0].x=400;players[0].y=350;players[0].specials=1;players[1].cooldownFrames=30;ball.x=400;ball.y=311;ball.vx=0;ball.vy=0;ball.touchSide=0;ball.teamTouches=2;ball.lastShot="attack";');
    const values=[...rolls];
    Math.random=()=>values.shift()??.99;
    run('updateActivePlayer(players[0],0,[]);');
    assert.equal(run('ball.specialShot'),expected);
    assert.equal(run('players[0].specials'),expected?0:1);
    if(expected) assert.equal(run('audioEvents.at(-1).name'),expected);
  }
  for(const setup of ['players[0].specials=0;', 'players[0].y=FLOOR;', 'players[0].cooldownFrames=30;', 'ball.x=1000;']) {
    run(`mode=0;reset();serveTimer=0;players[0].x=400;players[0].y=350;players[0].specials=1;players[1].cooldownFrames=30;ball.x=400;ball.y=311;ball.vx=0;ball.vy=0;ball.touchSide=0;ball.teamTouches=2;ball.lastShot='attack';${setup}`);
    Math.random=()=>0;
    assert.equal(run('decideComInput(players[0]).down'),false);
  }
} finally {
  Math.random=originalRandom;
}
run('mode=5;reset();players[0].y=350;players[0].specials=1;ball.x=500;ball.y=311;hit(players[0],true,undefined,false,false,true);');
assert.equal(run('audioEvents.at(-1).name'),'mozu');
run('for(let i=0;i<120&&ball.mozuPhase==="rise";i++)updateBall(1/60);updateBall(0);');
assert.equal(run('audioEvents.filter(e=>e.name==="mozuDive").length'),1);

// COMs predict an incoming spike, approach/jump, and actually block on both sides.
for (const side of [0, 1]) {
  const i = side * 2;
  run(`mode=0;reset();running=true;serveTimer=0;players[0].x=100;players[1].x=220;players[2].x=${courtW-250};players[3].x=${courtW-100};players[${i}].x=${side?courtNet+35:courtNet-35};ball.x=${side?courtNet-160:courtNet+160};ball.y=260;ball.vx=${side?500:-500};ball.vy=80;ball.lastSide=${1-side};ball.lastShot='attack';`);
  assert.equal(run(`decideComInput(players[${i}]).jump`), true);
  assert.equal(run(`decideComInput(players[${i + 1}]).set`), false);
  let airborneBlock = false;
  for (let n=0; n<50 && run('ball.lastShot') !== 'block'; n++) {
    run('update(1/60);');
    airborneBlock ||= run(`players[${i}].y<FLOOR&&players[${i}].blockFrames>0`);
  }
  assert(airborneBlock);
  assert.equal(run('ball.lastShot'), 'block');
  assert.equal(run('ball.lastSide'), side);
  assert.equal(run(`players[${i}].blockHit`), true);
  assert.equal(run(`players[${i}].specials`), 0);
}
run('mode=0;reset();serveTimer=0;players[0].x=480;players[1].x=220;ball.x=760;ball.y=260;ball.vx=-500;ball.vy=80;ball.lastSide=1;ball.lastShot="attack";');
assert.equal(run('decideComInput(players[0]).move'), 1);
run('players[0].cooldownFrames=20;');
assert.equal(run('comBlockInput(players[0])'), null);
run('players[0].cooldownFrames=0;ball.lastSide=0;');
assert.equal(run('comBlockInput(players[0])'), null);
assert.equal(run('COM_SPECIAL_CHANCE'), .5);

// Successful blocks build shared pressure; success on a point relaxes that pressure.
run('mode=0;reset();players[2].x=635;players[2].y=350;');
for(const attacker of [0,1]) {
  run(`players[2].recoveryFrames=0;players[2].blockFrames=30;ball.x=620;ball.y=275;ball.lastSide=0;ball.lastShot='attack';ball.lastHitter=players[${attacker}];`);
  assert.equal(run('tryBlock(players[2])'),true);
}
assert.equal(run('players[0].blockPressure'),2);
assert.equal(run('players[1].blockPressure'),2);
assert.equal(run('players[2].blockPressure'),0);
run('pointEnd={side:0,time:0};finishPoint();');
assert.equal(run('players[0].blockPressure'),1);
assert.equal(run('players[1].blockPressure'),1);
// At identical geometry/randomness, repeated blocks change the COM's attack into a feint.
try {
  for(const side of [0,1]) for(const pressure of [0,2]) {
    const i=side*2, enemy=side?0:2;
    run(`mode=0;reset();serveTimer=0;players[${i}].x=${side?700:500};players[${i}].y=350;players[${i}].blockPressure=${pressure};players[${i+1}].cooldownFrames=30;players[${enemy}].x=${side?565:635};players[${enemy}].y=350;players[${enemy}].blockFrames=30;ball.x=players[${i}].x;ball.y=311;ball.vx=0;ball.vy=0;ball.touchSide=${side};ball.teamTouches=2;ball.lastSide=${side};ball.lastShot='attack';`);
    Math.random=()=>.5;
    run(`updateActivePlayer(players[${i}],0,[]);`);
    assert.equal(run('ball.lastShot'),pressure?'feint':'attack');
    assert.equal(run(`players[${i}].specials`),0);
  }
} finally { Math.random=originalRandom; }
run('reset();');
assert(run('players.every(p=>p.blockPressure===0)'));

// Every real airborne hit (including specials and blocks) arms one landing lock.
for(const action of ['attack','set','feint','mozu','empowered','block']) {
  run('mode=5;reset();serveTimer=0;players[0].x=550;players[0].y=350;players[0].specials=1;ball.x=550;ball.y=311;');
  if(action==='block') {
    run('players[0].blockFrames=30;ball.y=275;ball.lastSide=1;ball.lastShot="attack";');
    assert.equal(run('tryBlock(players[0])'),true);
  } else run(`hit(players[0],${action==='set'||action==='mozu'},${['attack','set','feint'].includes(action)?JSON.stringify(action):'undefined'},false,false,${action==='mozu'||action==='empowered'});`);
  assert.equal(run('players[0].airborneTouch'),true);
  run('players[0].recoveryFrames=0;players[0].actionFrames=0;players[0].cooldownFrames=0;players[0].blockFrames=0;players[0].y=FLOOR-1;players[0].vy=120;ball.x=1000;updateActivePlayer(players[0],1/60,[]);');
  assert.equal(run('players[0].recoveryFrames'),12);
  assert.equal(run('players[0].airborneTouch'),false);
  assert.equal(run('players[0].vx'),0);
}
// The lock prevents movement, jump and ball contact for 0.2 seconds at every FPS.
for(const hz of [30,60,120]) {
  run('mode=5;reset();serveTimer=0;players[0].airborneTouch=true;players[0].y=FLOOR-1;players[0].vy=120;ball.x=1000;');
  run(`updateActivePlayer(players[0],${1/hz},[]);keys.add('ArrowRight');keys.add('ArrowUp');`);
  const landingX=run('players[0].x');
  for(let n=0;n<hz*.2-1;n++)run(`updateActivePlayer(players[0],${1/hz},[]);`);
  assert.equal(run('players[0].x'),landingX);
  assert.equal(run('players[0].y'),run('FLOOR'));
  assert(run('players[0].recoveryFrames>0'));
  run(`updateActivePlayer(players[0],${1/hz},[]);keys.clear();`);
  assert.equal(run('players[0].recoveryFrames'),0);
  assert(run('players[0].y<FLOOR'));
}
// Wind-up and a missed block carry no landing lock; longer existing recovery is kept.
for(const stance of ['attack','set','block']) {
  run(`mode=5;reset();players[0].y=FLOOR-1;players[0].vy=120;players[0].attackReady=${stance==='attack'};players[0].setReady=${stance==='set'};players[0].blockFrames=${stance==='block'?20:0};ball.x=1000;updateActivePlayer(players[0],1/60,[]);`);
  assert.equal(run('players[0].recoveryFrames'),0);
  run('keys.add("ArrowRight");keys.add("ArrowUp");updateActivePlayer(players[0],1/60,[]);keys.clear();');
  assert(run('players[0].y<FLOOR'));
}
run('reset();players[0].airborneTouch=true;players[0].recoveryFrames=40;players[0].y=FLOOR-1;players[0].vy=120;applyKnockbackAndGravity(players[0],1/60);');
assert.equal(run('players[0].recoveryFrames'),40);

// Forward+A aims above the net-top vector and lands deeper, with mirrored trajectories.
for(const side of [0,1]) for(const [leftX,y] of [[courtNet - 270, 350],[courtNet - 160, 250],[courtNet - 90, 280],[courtNet - 45, 300]]) {
  const x=side?courtW-leftX:leftX;
  run(`var testBall={x:${x},y:${y},r:12};var normalShot=attackVelocity(testBall,${side});var deepShot=attackVelocity(testBall,${side},ATTACK_SPEED,true);`);
  const normal=JSON.parse(run('JSON.stringify(normalShot)'));
  const deep=JSON.parse(run('JSON.stringify(deepShot)'));
  assert((deep.landingX-normal.landingX)*(side?-1:1)>1);
  assert(deep.landingX>=45-1e-6&&deep.landingX<=courtW-45+1e-6);
  assert(Math.atan2(deep.vy,Math.abs(deep.vx))<=Math.atan2(385-y,Math.abs(courtNet-x))-8*Math.PI/180+1e-8);
  for(const edge of [courtNet - 21, courtNet + 21]) {
    const t=(edge-x)/deep.vx;
    assert(y+deep.vy*t+.5*650*t*t+12<=385-5+1e-7);
  }
  const i=side*2;
  run(`mode=5;reset();players[${i}].y=350;ball.x=${x};ball.y=${y};hit(players[${i}],false,'attack',true);`);
  assert(Math.abs(run('ball.vx')-deep.vx)<1e-8);
  assert(Math.abs(run('ball.vy')-deep.vy)<1e-8);
}
// Directional aiming does not replace down+A's special attack trajectory.
for(const side of [0,1]) for(const leftX of [courtNet - 20, courtNet, courtNet + 20]) {
  run(`var nearNetShot=attackVelocity({x:${side?courtW-leftX:leftX},y:300,r:12},${side},ATTACK_SPEED,true);`);
  assert.equal(run('nearNetShot.landingX'),side?90:courtW-90);
  assert.equal(Math.sign(run('nearNetShot.vx')),side?-1:1);
}
run('reset();players[0].y=350;players[0].specials=1;ball.x=500;ball.y=280;var specialExpected=attackVelocity(ball,0,ATTACK_SPEED*SPECIAL_RULES.empoweredSpeed);hit(players[0],false,undefined,true,false,true);');
assert.equal(run('ball.specialShot'),'empowered');
assert.equal(run('ball.vx'),run('specialExpected.vx'));
assert.equal(run('ball.vy'),run('specialExpected.vy'));

// Service waiting/standing contact, both teams, target and net clearance.
for(const side of [0,1]) {
  const i=side*2, key=side?'KeyM':'KeyX';
  run(`mode=5;reset();running=true;beginServe(${side});`);
  assert.equal(run('serveState.serverIndex'),i);
  assert.equal(run(`players[${i}].x`), side ? courtW - 28 : 28);
  const held=run('JSON.stringify([ball.x,ball.y])');
  run('update(.5);');
  assert.equal(run('JSON.stringify([ball.x,ball.y])'),held);
  run(`keys.add('${key}');update(1/60);keys.clear();`);
  assert.equal(run('serveState'),null);
  assert.equal(run(`players[${i}].y`),run('FLOOR'));
  assert.equal(run(`players[${i}].action`),'attack');
  const landing=run('ball.x+ball.vx*((-ball.vy+Math.sqrt(ball.vy**2+2*GRAVITY*(FLOOR-ball.r-ball.y)))/GRAVITY)');
  assert(Math.abs(landing - (side ? courtNet - 270 : courtNet + 270)) < 1e-7);
  run('var netTime=(NET-ball.x)/ball.vx;');
  assert(run('ball.y+ball.vy*netTime+.5*GRAVITY*netTime*netTime+ball.r<NETTOP'));
  run(`beginServe(${side});`);
  assert.equal(run('serveState.serverIndex'),i+1);
}
// A requires a release/new press after tossing; jumping uses normal jump physics.
run('mode=5;reset();running=true;beginServe(0);keys.add("KeyZ");update(1/60);');
assert.equal(run('serveState.phase'),'tossed');
assert.equal(run('ball.vy'),-420);
run('keys.add("ArrowUp");for(let i=0;i<6;i++)update(1/60);keys.clear();update(1/60);');
assert.equal(run('serveState.phase'),'tossed');
assert(run('players[0].y<FLOOR'));
run('keys.add("KeyZ");update(1/60);keys.clear();');
assert.equal(run('serveState'),null);
assert.equal(run('ball.lastHitter===players[0]'),true);
assert.equal(run('players[0].airborneTouch'),true);
// Missed tosses return to the same server without scoring or automatic strikes.
run('mode=5;reset();running=true;beginServe(0);keys.add("KeyZ");update(1/60);keys.clear();');
run('for(let i=0;i<150&&serveState.phase!=="holding";i++)update(1/60);');
assert.equal(run('serveState.phase'),'holding');
assert.equal(run('serveState.serverIndex'),0);
assert.equal(run('score.join(",")'),'0,0');
assert.equal(run('pointEnd'),null);
// Both COM service styles complete on their own, with one real serve event.
for(const style of ['standing','jump']) for(const side of [0,1]) {
  run(`mode=0;reset();running=true;beginServe(${side});serveState.comStyle='${style}';`);
  for(let n=0;n<180&&run('serveState!==null');n++)run('update(1/60);');
  assert.equal(run('serveState'),null);
  assert.equal(run('audioEvents.filter(e=>e.name==="serve").length'),1);
}
// All eight new sprite cells use the proper character/phase without clipping.
for(let i=0;i<4;i++)for(let frame=0;frame<2;frame++) {
  run(`reset();beginServe(${i<2?0:1});serveState.serverIndex=${i};serveState.phase='${frame?'tossed':'holding'}';serveState.age=0;drawPlayer(players[${i}]);`);
  assert.equal(draws.at(-1)[0],run('serveArt'));
  assert.deepEqual(draws.at(-1).slice(1,5),[(i%2*2+frame)*443.5,Math.floor(i/2)*443.5,443.5,443.5]);
}

// Directional jump serves: both teams, distinct height/speed and legal landing points.
for(const side of [0,1]) {
  const i=side*2,dir=side?-1:1, results={};
  for(const variant of ['fast','high','slow','power']) {
    const input=variant==='power'?'{down:true}':variant==='high'?'{jump:true}':`{move:${variant==='fast'?dir:-dir}}`;
    run(`mode=5;reset();running=true;beginServe(${side});players[${i}].y=350;players[${i}].specials=2;ball.x=${side?courtW-61:61};ball.y=320;strikeServe(players[${i}],true,${input});`);
    assert.equal(run('ball.serveVariant'),variant);
    assert.equal(run(`players[${i}].specials`),variant==='power'?1:2);
    assert.equal(run('ballGlowColor()'),variant==='power'?'#399dff':null);
    const x=run('ball.x'),y=run('ball.y'),vx=run('ball.vx'),vy=run('ball.vy');
    const t=(courtNet-x)/vx;
    const netY=y+vy*t+.5*650*t*t;
    assert(netY+12<385);
    const flight=(-vy+Math.sqrt(vy*vy+2*650*(518-y)))/650;
    const landing=x+vx*flight;
    assert(landing>=45&&landing<=courtW-45);
    if(variant==='high') assert(netY<180);
    results[variant]={speed:Math.hypot(vx,vy),netY};
  }
  assert(results.power.speed>results.fast.speed);
  assert(results.fast.speed>results.slow.speed);
  assert(results.slow.netY<results.fast.netY);
  assert(results.high.netY<results.slow.netY);
  run(`mode=5;reset();beginServe(${side});players[${i}].y=350;players[${i}].specials=0;ball.x=${side?courtW-61:61};ball.y=320;strikeServe(players[${i}],true,{down:true});`);
  assert.equal(run('ball.serveVariant'),'normal');
  assert.equal(run('ball.specialShot'),null);
  assert.equal(run(`players[${i}].specials`),0);
}
// A power serve cannot be sent straight back by ground receive, aerial set/attack or block.
for(const side of [0,1])for(const action of ['receive','set','attack','block']) {
  const i=side*2;
  run(`mode=5;reset();players[${i}].x=${side?700:500};players[${i}].y=${action==='receive'?'FLOOR':350};players[${i}].specials=2;ball.x=players[${i}].x;ball.y=players[${i}].y-${action==='block'?75:39};ball.lastSide=${1-side};ball.lastShot='attack';ball.specialShot='powerServe';`);
  if(action==='block') {
    run(`players[${i}].blockFrames=30;`);
    assert.equal(run(`tryBlock(players[${i}])`),true);
  }else run(`hit(players[${i}],${action==='set'},'${action}',false,false,true);`);
  assert.equal(run('ball.vx'),0);
  assert(run('ball.vy<0'));
  assert.equal(Math.sign(run(`players[${i}].knockback`)),side?1:-1);
  assert.equal(run(`players[${i}].specials`),2);
  assert.equal(run('ball.specialShot'),null);
  assert.equal(run('ball.lastWasReturn'),false);
}

// SP activation triggers specialActivation with dark screen, particles, and afterimages
{
  // 1. Regular attack does NOT trigger specialActivation
  run("reset();running=true;players[0].y=350;players[0].specials=1;ball.x=500;ball.y=311;hit(players[0],false,undefined,false,false,false);");
  assert.equal(run("specialActivation"), null);

  // 2. Mozu drop triggers specialActivation with cyan color
  run("reset();running=true;players[0].y=350;players[0].specials=1;ball.x=500;ball.y=311;hit(players[0],true,undefined,false,false,true);");
  assert(run("specialActivation !== null"));
  assert.equal(run("specialActivation.type"), "mozu");
  assert.equal(run("specialActivation.color"), "#6be4ff");

  // 3. Power receive triggers specialActivation with green color
  run("reset();running=true;players[0].x=500;players[0].y=FLOOR;players[0].specials=1;ball.x=500;ball.y=FLOOR-39;ball.lastSide=1;ball.doubleAttack=true;hit(players[0],false,null,false,false,true);");
  assert(run("specialActivation !== null"));
  assert.equal(run("specialActivation.type"), "powerReceive");
  assert.equal(run("specialActivation.color"), "#4dfa7c");

  // 4. Power serve triggers specialActivation
  run("reset();running=true;beginServe(0);players[0].y=350;players[0].specials=1;ball.x=61;ball.y=320;strikeServe(players[0],true,{down:true});");
  assert(run("specialActivation !== null"));
  assert.equal(run("specialActivation.type"), "powerServe");
}

// COM spike height variation: high aerial spikes for teammate toss with natural variation
{
  run("reset();players[0].y=FLOOR;players[0].cooldownFrames=0;players[0].recoveryFrames=0;ball.x=players[0].x+30;ball.y=300;ball.vx=0;ball.vy=100;ball.lastSide=0;ball.lastShot=\x27set\x27;");
  const heights = new Set();
  for (let i = 0; i < 20; i++) {
    run(`ball.tossId = ${i + 1};`);
    const h = run("getComSpikeTargetHeight(players[0])");
    assert(h >= 35 && h <= 135);
    heights.add(Math.round(h / 15));
  }
  assert(heights.size >= 2);

  const plan = run("comJumpPlan(players[0])");
  assert(plan !== null);
}

// Feint topspin drive: progressive downward acceleration after clearing the net
{
  run("mode=5;reset();running=true;players[0].x=540;players[0].y=350;ball.x=540;ball.y=311;hit(players[0],false,undefined,false,true,false);");
  assert.equal(run("ball.lastShot"), "feint");
  assert.equal(run("ball.feintDrive"), 0);

  let netCleared = false;
  let vySamples = [];
  let driveObserved = false;
  for (let step = 0; step < 60; step++) {
    const prevVy = run("ball.vy");
    const prevDrive = run("ball.feintDrive || 0");
    const x = run("ball.x");
    const y = run("ball.y");
    if (y + 12 >= 530) break;
    run("updateBall(1/60);");
    const newVy = run("ball.vy");
    const newDrive = run("ball.feintDrive || 0");
    const newX = run("ball.x");
    const newY = run("ball.y");
    if (newY + 12 >= 530) break;
    if (x <= courtNet && newX > courtNet) {
      netCleared = true;
      assert(run("ball.y") + 12 < 385, "feint must clear above the net tape");
    }
    if (x > courtNet + 20) {
      assert(newDrive > prevDrive, "feintDrive should accumulate over frames after net");
      const deltaVy = newVy - prevVy;
      assert(deltaVy > (650 / 60) + 1, "downward speed increment must exceed normal gravity");
      driveObserved = true;
      vySamples.push(deltaVy);
    }
  }
  assert(netCleared, "feint must cross the net without hitting");
  assert(driveObserved, "drive must be observed after clearing net zone");
  assert(vySamples[vySamples.length - 1] > vySamples[0], "acceleration should increase frame by frame");

  // Verify across multiple starting distances and both sides that feint never clips the net tape
  for (const side of [0, 1]) {
    for (const distFromNet of [40, 60, 80, 100]) {
      const px = side === 0 ? courtNet - distFromNet : courtNet + distFromNet;
      run(`mode=5;reset();running=true;audioEvents=[];players[${side*2}].x=${px};players[${side*2}].y=350;ball.x=${px};ball.y=311;hit(players[${side*2}],false,undefined,false,true,false);`);
      let landed = false;
      for (let step = 0; step < 90; step++) {
        run("updateBall(1/60);");
        if (run("ball.y + ball.r") >= 530) { landed = true; break; }
      }
      assert(landed, `feint from dist ${distFromNet} (side ${side}) must land on court`);
      const netSfx = run("audioEvents.some(e => e.name === 'net')");
      assert.equal(netSfx, false, `feint from dist ${distFromNet} (side ${side}) must never touch the net tape`);
      const landX = run("ball.x");
      assert(side === 0 ? landX > courtNet : landX < courtNet, `feint must land on opponent side (side ${side}, landX=${landX})`);
    }
  }

  // --- Loop Shot (Airborne Up + B) tests ---
  // 1. Airborne Up + B triggers loop shot with LOOP! action pop and loop sound
  run("mode=5;reset();running=true;audioEvents=[];players[0].x=440;players[0].y=350;ball.x=440;ball.y=311;ball.vx=0;ball.vy=0;ball.lastSide=0;");
  run("hit(players[0], true, undefined, false, false, false, true);"); // set=true, up=true
  assert.equal(run("ball.lastShot"), "loop");
  assert.equal(run("players[0].actionPop.action"), "loop");
  assert.equal(run("audioEvents.some(e => e.name === 'loop')"), true);

  // 2. Initial speed has more pace with topspin drive (~500-600 px/s vs attack 720+ px/s)
  const loopSpeed = run("Math.hypot(ball.vx, ball.vy)");
  assert(loopSpeed >= 480 && loopSpeed <= 680, `loop speed ${loopSpeed} should have speed with drive`);

  // 3. Block cannot intercept loop shots
  run("players[2].x=NET+25;players[2].y=350;players[2].blockFrames=30;");
  assert.equal(run("tryBlock(players[2])"), false, "block must not intercept loop shots");

  // 4. Trajectory test for both sides: high clearance over net (Y <= 220), lands in opponent mid-court
  for (const side of [0, 1]) {
    const px = side === 0 ? courtNet - 90 : courtNet + 90;
    run(`mode=5;reset();running=true;audioEvents=[];players[${side*2}].x=${px};players[${side*2}].y=350;ball.x=${px};ball.y=311;hit(players[${side*2}],true,undefined,false,false,false,true);`);
    let crossedNet = false;
    let netHeight = 0;
    let landed = false;
    for (let step = 0; step < 120; step++) {
      const x = run("ball.x");
      const y = run("ball.y");
      run("updateBall(1/60);");
      const newX = run("ball.x");
      if ((side === 0 && x <= courtNet && newX > courtNet) || (side === 1 && x >= courtNet && newX < courtNet)) {
        crossedNet = true;
        netHeight = y;
        assert(y + 12 < 385 - 120, `loop shot must soar high above net, y=${y}`);
      }
      if (run("ball.y + ball.r") >= 530) {
        landed = true;
        break;
      }
    }
    assert(crossedNet, `loop shot must cross net (side ${side})`);
    assert(landed, `loop shot must land on court (side ${side})`);
    const landX = run("ball.x");
    const midCourt = side === 0 ? courtNet + 245 : courtNet - 245;
    assert(Math.abs(landX - midCourt) < 70, `loop shot must land in opponent mid-court (landX=${landX}, expected ~${midCourt})`);
    const hitNet = run("audioEvents.some(e => e.name === 'net')");
    assert.equal(hitNet, false, "loop shot must never touch the net");
  }
}

console.log('PASS: animation, directional/power serves, reception knockback, COM tactics, charge, landing recovery, specials, audio and physics.');
