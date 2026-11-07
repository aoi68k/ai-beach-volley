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
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8'), sandbox);

const run = code => vm.runInContext(code, sandbox);
// Snapshot serialization must preserve hitter identity without sharing object references.
run("players[0].x = 345; players[0].gauge=7; players[0].specials=2; ball.lastHitter = players[0]; ball.specialShot='mozu';ball.mozuPhase='rise';ball.mozuRiseAge=.2; score = [3, 4]; running = true;");
const packet = JSON.parse(run('JSON.stringify(window.rallyGame.snapshot())'));
assert.equal(packet.ball.lastHitter, 0);
run('reset()');
sandbox.packet = packet;
run('window.rallyGame.apply(packet)');
assert.equal(run('ball.lastHitter === players[0]'), true);
assert.equal(run('players[0].x'), 345);
assert.equal(run('players[0].gauge'), 7);
assert.equal(run('players[0].specials'), 2);
assert.equal(run('ball.specialShot'), 'mozu');
assert.equal(run('ball.mozuPhase'), 'rise');
assert.equal(run('ball.mozuRiseAge'), .2);
assert.equal(run('score.join(",")'), '3,4');
assert.equal(run('running'), true);
run('window.matchLobby = { online: true, assignment: i => [0, 0, 3, 0][i], input: () => ({move: -1, jump: true, shot: false, set: false}) }; reset();');
assert.equal(run('players.map(p => p.human).join(",")'), '0,0,3,0');
assert.equal(run('readHumanInput(players[2], []).move'), -1);
run('window.matchLobby.input=()=>({move:0,jump:false,shot:false,set:true,down:true});serveTimer=0;ball.x=players[2].x;ball.y=FLOOR-39;updateActivePlayer(players[2],0,[]);');
assert.equal(run('ball.vy'), -520);
run('players[2].y=350;players[2].specials=1;players[2].cooldownFrames=0;players[2].recoveryFrames=0;ball.x=players[2].x;ball.y=311;updateActivePlayer(players[2],0,[]);');
assert.equal(run('ball.specialShot'), 'mozu');
assert.equal(run('players[2].specials'), 0);
run('window.rallyGame.start()');
assert.equal(run('running'), true);
run('window.rallyGame.pause()');
assert.equal(run('paused'), true);
run('window.rallyGame.stop()');
assert.equal(run('running'), false);
run('window.rallyGame.start();');
const servicePacket=JSON.parse(run('JSON.stringify(window.rallyGame.snapshot())'));
assert.equal(servicePacket.serveState.phase,'holding');
assert.equal(servicePacket.serveState.serverIndex,0);
sandbox.servicePacket=servicePacket;
run('window.rallyGame.stop();window.rallyGame.apply(servicePacket);');
assert.equal(run('serveState.phase'),'holding');
assert.equal(run('players[serveState.serverIndex].x'),28);

console.log('PASS: network snapshots, hitter identity, lobby ownership, remote input and match lifecycle');
