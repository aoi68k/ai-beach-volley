const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Mock localStorage
const storage = new Map();
const localStorage = {
  getItem: k => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k),
  clear: () => storage.clear()
};

// Mock DOM elements
function createElement() {
  const listeners = {};
  return {
    tagName: 'DIV',
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(evt, fn) {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    dispatchEvent(evt) {
      listeners[evt.type]?.forEach(fn => fn(evt));
    },
    querySelector: () => createElement(),
    querySelectorAll: () => [],
    appendChild() {},
    showModal() { this.open = true; },
    close() { this.open = false; },
    open: false,
    innerHTML: '',
    textContent: '',
    value: ''
  };
}

const windowObj = {
  addEventListener() {},
  removeEventListener() {},
  localStorage,
  navigator: { getGamepads: () => [] },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {}
};

const documentObj = {
  readyState: 'complete',
  addEventListener() {},
  querySelector: () => createElement(),
  querySelectorAll: () => [],
  createElement
};

const context = vm.createContext({
  window: windowObj,
  document: documentObj,
  navigator: windowObj.navigator,
  localStorage,
  console
});

const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'gamepad-config.js'), 'utf8');
vm.runInContext(code, context);

const { gamepadConfig } = windowObj;
assert(gamepadConfig, 'gamepadConfig must be exposed on window');

// Test 1: Initial config structure
{
  const conf = gamepadConfig.getConfig();
  assert(conf.players[1] && conf.players[2] && conf.players[3] && conf.players[4]);
  assert.equal(conf.players[1].padIndex, 0);
  assert.equal(conf.players[2].padIndex, 1);
  assert.equal(conf.players[3].padIndex, 2);
  assert.equal(conf.players[4].padIndex, 3);

  const m1 = conf.players[1].mapping;
  assert.equal(m1.up.index, 12);
  assert.equal(m1.down.index, 13);
  assert.equal(m1.left.index, 14);
  assert.equal(m1.right.index, 15);
  assert.equal(m1.shot.index, 2); // X button
  assert.equal(m1.set.index, 1);  // B button
}

// Test 2: Helper to mock gamepad
function makePad(index, buttonsPressed = [], axes = [0, 0]) {
  const buttons = Array.from({ length: 16 }, (_, i) => ({
    pressed: buttonsPressed.includes(i),
    value: buttonsPressed.includes(i) ? 1.0 : 0.0
  }));
  return {
    index,
    connected: true,
    id: `Mock Gamepad ${index}`,
    buttons,
    axes
  };
}

// Test 3: read player 1 with default mapping
{
  const pads = [makePad(0, [14, 2])]; // Left (14) + Shot (2)
  const input = gamepadConfig.read(1, pads);
  assert(input, 'Expected non-null input');
  assert.equal(input.move, -1);
  assert.equal(input.shot, true);
  assert.equal(input.jump, false);
  assert.equal(input.down, false);
  assert.equal(input.set, false);
}

// Test 4: analog stick axes support
{
  const pads = [makePad(0, [], [0.8, -0.7])]; // Right + Up
  const input = gamepadConfig.read(1, pads);
  assert(input, 'Expected non-null input');
  assert(input.move > 0.5, 'Expected positive move for stick right');
  assert.equal(input.jump, true);
  assert.equal(input.down, false);
  assert.equal(input.shot, false);
}

// Test 5: Multi-controller routing (Player 2 reads pad 1)
{
  const pads = [
    makePad(0, [15]), // Pad 0: Right (for 1P)
    makePad(1, [14, 1]) // Pad 1: Left + Set (for 2P)
  ];
  const input1 = gamepadConfig.read(1, pads);
  const input2 = gamepadConfig.read(2, pads);

  assert(input1, 'Expected 1P input');
  assert.equal(input1.move, 1);
  assert.equal(input1.set, false);

  assert(input2, 'Expected 2P input');
  assert.equal(input2.move, -1);
  assert.equal(input2.set, true);
}

// Test 6: Unassigned padIndex (-1) returns null
{
  const conf = gamepadConfig.getConfig();
  conf.players[3].padIndex = -1;
  gamepadConfig.setConfig(conf);

  const pads = [makePad(0, [2]), makePad(1, [2]), makePad(2, [2])];
  const input3 = gamepadConfig.read(3, pads);
  assert.equal(input3, null, 'Unassigned padIndex should return null');
}

// Test 7: Custom button binding
{
  const conf = gamepadConfig.getConfig();
  // Remap 1P shot to button 0 (A button)
  conf.players[1].mapping.shot = { type: 'button', index: 0, label: 'ボタン 0' };
  gamepadConfig.setConfig(conf);

  const padsOld = [makePad(0, [2])]; // button 2 pressed
  const inputOld = gamepadConfig.read(1, padsOld);
  assert.equal(inputOld.shot, false, 'Button 2 should no longer trigger shot');

  const padsNew = [makePad(0, [0])]; // button 0 pressed
  const inputNew = gamepadConfig.read(1, padsNew);
  assert.equal(inputNew.shot, true, 'Button 0 should now trigger shot');
}

// Test 8: Reset restores player config
{
  gamepadConfig.reset(1);
  const conf = gamepadConfig.getConfig();
  assert.equal(conf.players[1].mapping.shot.index, 2);
}

console.log('PASS: gamepad-config mapping, multi-controller routing, axes input, persistence and reset');
