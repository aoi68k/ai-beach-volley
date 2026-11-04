const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// --- Assets ---
function loadImage(src) {
  const art = new Image();
  art.src = src;
  return art;
}

const CHARACTER_NAMES = ['coral-male', 'coral-female', 'blue-male', 'blue-female'];
const beachArt = loadImage('assets/tropical-beach.png');
const playerArt = loadImage('assets/volleyball-players-v2.png');
const animatedPlayerArt = CHARACTER_NAMES.map(name => loadImage(`assets/characters/${name}-v3.png`));
const selectedRunArt = CHARACTER_NAMES.map(name => loadImage(`assets/characters/${name}-run-selected.png`));

// --- Constants ---
const VIEW_W = 1200;
const W = 1200;
const H = 620;
const FLOOR = 530;
const NET = W / 2;
const NETTOP = 385;
const GRAVITY = 650;

const JUMP_SPEED = 650;
const PLAYER_GRAVITY = 1450;
const HUMAN_SPEED = 245;
const COM_SPEED = 185;
const WINNING_SCORE = 11;
const POINT_PAUSE = 1.4;

const ATTACK_ANIMATION_DURATION = 0.36;
const LANDING_ANIMATION_DURATION = 0.16;
const ACTION_RECOVERY = { receive: 0.4, set: 0.3, attack: 0.5, feint: 0.4 };
const ATTACK_SPEED = 720;
const QUICK_SPEED = 960;

const ACTION_LABELS = {
  receive: 'レシーブ',
  set: 'トス',
  attack: 'アタック',
  double: 'ダブルアタック',
  quick: 'クイック',
  feint: 'フェイント',
  block: 'ブロック'
};

const INITIAL_PLAYER_X = [220, 410, 790, 980];
const PLAYER_COLORS = ['#e96a42', '#e7ad43', '#407f99', '#646fb0'];

const modeNames = [
  'COM vs COM',
  '1P vs COM',
  '1P vs 2P',
  '1P & 2P vs COM',
  '1P & 2P vs 3P',
  '1P & 2P vs 3P & 4P'
];

const assignments = [
  [0, 0, 0, 0],
  [1, 0, 0, 0],
  [1, 0, 2, 0],
  [1, 2, 0, 0],
  [1, 2, 3, 0],
  [1, 2, 3, 4]
];

const bindings = {
  1: ['ArrowLeft', 'ArrowRight', 'ArrowUp', ['KeyZ', 'KeyA'], ['KeyX', 'KeyB']],
  2: ['KeyF', 'KeyH', 'KeyT', ['KeyG'], ['KeyV']],
  3: ['KeyJ', 'KeyL', 'KeyI', ['KeyK'], ['KeyM']],
  4: ['Numpad4', 'Numpad6', 'Numpad8', ['Numpad1'], ['Numpad2']]
};

const SCENERY_LAYERS = [
  { name: 'far', top: 0, bottom: 0.36, depth: 0.12 },
  { name: 'middle', top: 0.36, bottom: 0.54, depth: 0.28 },
  { name: 'near', top: 0.54, bottom: 1, depth: 1, worldSpace: true }
];

// --- Game State ---
let pointEnd = null;
let mode = 1;
let players = [];
let ball;
let score = [0, 0];
let running = false;
let paused = false;
let winner = false;
let serveTimer = 0;
let last = 0;
let time = 0;
let shake = 0;
let sound = false;
let audioContext;
let particles = [];

const camera = { x: 0, y: 0, zoom: 1.35 };
const keys = new Set();

// --- UI & Audio ---
modeNames.forEach((name, i) => {
  const b = document.createElement('button');
  b.textContent = name;
  b.className = i === mode ? 'active' : '';
  b.onclick = () => {
    if (window.matchLobby?.online) return;
    mode = i;
    document.querySelectorAll('.modes button').forEach((e, j) => e.classList.toggle('active', i === j));
    window.matchLobby?.preset(assignments[mode]);
    reset();
  };
  document.querySelector('#modes').append(b);
});

function setOverlay(title, description, buttonText, visible = true) {
  const overlay = document.querySelector('#overlay');
  if (visible) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
  document.querySelector('#overlay h2').textContent = title;
  document.querySelector('#overlay p').textContent = description;
  document.querySelector('#start').firstChild.textContent = buttonText;
}

function createPlayer(x, index) {
  return {
    x,
    y: FLOOR,
    vx: 0,
    vy: 0,
    side: index < 2 ? 0 : 1,
    human: window.matchLobby?.assignment(index) ?? assignments[mode][index],
    color: PLAYER_COLORS[index],
    cool: 0,
    recovery: 0,
    knockback: 0,
    blockTime: 0,
    action: null,
    actionTime: 0,
    flash: 0
  };
}

function reset() {
  score = [0, 0];
  winner = false;
  paused = false;
  running = false;
  players = INITIAL_PLAYER_X.map(createPlayer);
  serve(0);
  updateCamera(0, true);
  setOverlay('LET’S RALLY.', 'キャラの操作担当を決めて、砂浜へ。', 'PLAYER SETUP ', true);
  status();
}

function status() {
  document.querySelector('#status').textContent = paused
    ? (window.matchLobby?.online ? 'PAUSED / ホストのSPACEで再開' : 'PAUSED / SPACEで再開')
    : `${window.matchLobby?.online ? 'ONLINE / ホスト: SPACEで一時停止・Rでロビー' : 'カスタム担当'} / 先に11点で勝利`;
}

function serve(side) {
  pointEnd = null;
  ball = {
    x: side ? 900 : 300,
    y: 210,
    vx: side ? -135 : 135,
    vy: -30,
    r: 12,
    trail: [],
    lastSide: side,
    lastHitter: null,
    touchSide: null,
    teamTouches: 0,
    lastWasReturn: false,
    lastShot: null,
    deadened: false,
    doubleAttack: false
  };
  serveTimer = 1.1;
}

function tone(freq) {
  if (!sound) return;
  try {
    audioContext ??= new AudioContext();
    const o = audioContext.createOscillator();
    const g = audioContext.createGain();
    o.connect(g);
    g.connect(audioContext.destination);
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.05, audioContext.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
    o.start();
    o.stop(audioContext.currentTime + 0.12);
  } catch {}
}

document.querySelector('#start').onclick = () => window.matchLobby?.show();

document.querySelector('#sound').onclick = e => {
  sound = !sound;
  e.target.textContent = sound ? 'SOUND ON' : 'SOUND OFF';
  tone(440);
};

window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target?.tagName)) return;
  if (Object.values(bindings).flat(2).includes(e.code) || e.code === 'Space') {
    e.preventDefault();
  }
  keys.add(e.code);
  if (e.repeat) return;
  if (window.matchLobby?.online && ['Space', 'KeyR'].includes(e.code)) {
    window.matchLobby.command(e.code);
    return;
  }
  if (e.code === 'Space' && running) {
    paused = !paused;
    status();
  }
  if (e.code === 'KeyR') { reset(); window.matchLobby?.show(); }
});

window.addEventListener('keyup', e => keys.delete(e.code));

window.addEventListener('blur', () => {
  keys.clear();
  if (running && !window.matchLobby?.online) {
    paused = true;
    status();
  }
});

// --- Court & Physics Helpers ---
function clampCourtX(x, side, netMargin = 28, edgeMargin = 24) {
  const minX = side ? NET + netMargin : edgeMargin;
  const maxX = side ? W - edgeMargin : NET - netMargin;
  return Math.max(minX, Math.min(maxX, x));
}

// Screen Y grows downward. Aim above the net by the ball radius plus a margin.
function comShotType(b) {
  const angle = Math.atan2(NETTOP - b.r - 8 - b.y, Math.abs(NET - b.x));
  if (angle < (-Math.PI * 50) / 180) return 'set';
  return angle < (-Math.PI * 10) / 180 ? 'receive' : 'attack';
}

// Attack: cross the near edge of the net with only a small clearance.
function attackVelocity(b, side, speedLimit = ATTACK_SPEED) {
  const direction = side ? -1 : 1;
  const crossX = NET - direction * (b.r + 9);
  const distance = (crossX - b.x) * direction;
  if (distance <= 1) return null;
  const crossY = NETTOP - b.r - 5;

  function trajectory(speed) {
    const t = distance / speed;
    const farTime = (distance + 2 * (b.r + 9)) / speed;
    const vy = Math.min(
      (crossY - b.y - 0.5 * GRAVITY * t * t) / t,
      (crossY - b.y - 0.5 * GRAVITY * farTime * farTime) / farTime
    );
    const landingTime = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * (FLOOR - b.r - b.y))) / GRAVITY;
    return { vx: direction * speed, vy, landingX: b.x + direction * speed * landingTime };
  }

  // Prefer a brisk shot; reduce speed only if it would land beyond the court.
  let low = 1;
  let high = speedLimit;
  for (let i = 0; i < 32; i++) {
    const speed = (low + high) / 2;
    const shot = trajectory(speed);
    if ((shot.landingX - (side ? 45 : W - 45)) * direction > 0) high = speed;
    else low = speed;
  }
  return trajectory(low);
}

function applyDoubleImpact(p) {
  // A heavy ball is deadened on contact instead of becoming another return.
  ball.deadened = true;
  const back = p.side ? 1 : -1;
  p.knockback = back * 900;
  ball.vy = -300;
  const fallTime = (-ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * GRAVITY * Math.max(1, FLOOR - ball.r - ball.y))) / GRAVITY;
  const deadTarget = clampCourtX(ball.x + back * 50, p.side, 40, 50);
  ball.vx = (deadTarget - ball.x) / fallTime;
}

function showAction(p, action) {
  p.action = action;
  p.actionTime = 0.9;
  p.attackAge = 0;
}

function touchesBefore(p) {
  return ball.touchSide === p.side ? ball.teamTouches : 0;
}

function recordTouch(p) {
  ball.teamTouches = touchesBefore(p) + 1;
  ball.touchSide = p.side;
}

function comAction(p) {
  const touches = touchesBefore(p);
  return touches === 0 ? 'receive' : touches === 1 ? 'set' : comShotType(ball);
}

function hit(p, set, forcedType, forward = false, feint = false) {
  const assistReceive = !p.human && touchesBefore(p) === 0;
  const type =
    forcedType ||
    (p.human
      ? set
        ? 'set'
        : p.y < FLOOR - 35
          ? feint
            ? 'feint'
            : 'attack'
          : 'receive'
      : comAction(p));

  const incomingDouble = ball.doubleAttack;
  const quick = !incomingDouble && type === 'attack' && ball.lastShot === 'set' && ball.lastSide === p.side && ball.vy < 0;
  const doubleAttack =
    !incomingDouble &&
    type === 'attack' &&
    ball.lastWasReturn &&
    ball.lastHitter &&
    ball.lastHitter !== p &&
    ball.lastHitter.side === p.side;

  set = type === 'set';
  const localReceive = type === 'receive' && (assistReceive || (p.human && p.y >= FLOOR && !forward));
  const ownTarget = set || localReceive;

  const target =
    type === 'feint'
      ? p.side
        ? NET - 85
        : NET + 85
      : ownTarget
        ? p.side
          ? NET + 95
          : NET - 95
        : p.side
          ? 180 + Math.random() * 230
          : NET + 190 + Math.random() * 230;

  const air = type === 'attack';
  let duration = type === 'feint' ? 0.85 : set ? 1.05 : air ? 0.75 : 1.25;
  const endY = FLOOR - 14;

  if (set) {
    duration = (410 + Math.sqrt(410 * 410 + 2 * GRAVITY * Math.max(0, endY - ball.y))) / GRAVITY;
  }

  // Lengthen a return when needed so gravity carries it over the top of the net.
  const fraction = (NET - ball.x) / (target - ball.x);
  if (!ownTarget && fraction > 0 && fraction < 1) {
    const clearance = NETTOP - ball.r - 10;
    const needed = (2 * ((1 - fraction) * ball.y + fraction * endY - clearance)) / (GRAVITY * fraction * (1 - fraction));
    duration = Math.max(duration, Math.sqrt(Math.max(0, needed)));
  }

  ball.vx = (target - ball.x) / duration;
  ball.vy = (endY - ball.y - 0.5 * GRAVITY * duration * duration) / duration;
  if (set) ball.vy = -410;

  if (air) {
    const attack = attackVelocity(ball, p.side, quick ? QUICK_SPEED : ATTACK_SPEED);
    if (attack) {
      ball.vx = attack.vx;
      ball.vy = attack.vy;
    }
  }

  if (!p.human) p.aimError = (Math.random() - 0.5) * 180;
  p.recovery = ACTION_RECOVERY[type] * (incomingDouble ? 4 : 1);
  p.vx = 0;
  ball.deadened = false;
  if (incomingDouble) applyDoubleImpact(p);

  showAction(p, doubleAttack ? 'double' : quick ? 'quick' : type);
  ball.lastShot = type;
  ball.doubleAttack = !!doubleAttack;
  ball.lastHitter = p;
  ball.lastWasReturn = !ownTarget && !incomingDouble;
  recordTouch(p);
  ball.lastSide = p.side;

  p.cool = p.human ? 0.28 : 0.35 + Math.random() * 0.65;
  p.flash = 0.18;
  shake = air ? 4 : 1;
  tone(set ? 520 : air ? 180 : 350);

  for (let j = 0; j < 9; j++) {
    particles.push({
      x: ball.x,
      y: ball.y,
      vx: (Math.random() - 0.5) * 180,
      vy: (Math.random() - 0.5) * 180,
      life: 0.35
    });
  }
}

function tryBlock(p) {
  if (
    p.blockTime <= 0 ||
    p.y >= FLOOR ||
    p.recovery > 0 ||
    ball.lastSide === p.side ||
    !(ball.lastShot === 'attack' || ball.doubleAttack)
  ) {
    return false;
  }
  if (Math.hypot(ball.x - p.x, ball.y - (p.y - 75)) > 76 || ball.y + ball.r > NETTOP - 5) {
    return false;
  }

  const incomingDouble = ball.doubleAttack;
  const direction = p.side ? -1 : 1;
  const target = NET + direction * 80;
  const fraction = (NET + direction * 21 - ball.x) / (target - ball.x);
  let duration = 0.28;

  if (fraction > 0 && fraction < 1) {
    const needed =
      (2 * ((1 - fraction) * ball.y + fraction * (FLOOR - ball.r) - (NETTOP - ball.r - 5))) /
      (GRAVITY * fraction * (1 - fraction));
    duration = Math.max(duration, Math.sqrt(Math.max(0, needed)));
  }

  ball.vx = (target - ball.x) / duration;
  ball.vy = (FLOOR - ball.r - ball.y - 0.5 * GRAVITY * duration * duration) / duration;
  recordTouch(p);
  ball.doubleAttack = false;
  ball.lastHitter = p;
  ball.lastSide = p.side;
  ball.lastShot = 'block';
  ball.lastWasReturn = false;
  showAction(p, 'block');

  p.blockTime = 0;
  p.recovery = 0.3 * (incomingDouble ? 4 : 1);
  p.cool = 0.3;
  p.vx = 0;
  p.flash = 0.25;
  ball.deadened = false;
  if (incomingDouble) applyDoubleImpact(p);
  shake = 5;
  tone(620);
  return true;
}

// --- Input & COM AI ---
function supportPosition(p, mate) {
  const forward = p.side ? -1 : 1;
  const mateDistance = (NET - mate.x) * forward;
  const nominal = NET - forward * (mateDistance < 200 ? 300 : 110);
  // Stay within a short run of the teammate's next contact.
  const covered = Math.max(mate.x - 220, Math.min(mate.x + 220, nominal));
  return clampCourtX(covered, p.side, 35, 35);
}

function coverBallX() {
  const catchY = FLOOR - 65;
  const t = Math.max(
    0,
    (-ball.vy + Math.sqrt(Math.max(0, ball.vy * ball.vy + 2 * GRAVITY * (catchY - ball.y)))) / GRAVITY
  );
  return ball.x + ball.vx * t;
}

function comJumpPlan(p) {
  if (p.y < FLOOR || p.recovery > 0 || p.cool > 0) return null;
  for (const direction of [0, -1, 1]) {
    let best = null;
    for (let t = 0.08; t < 0.76; t += 1 / 120) {
      const bx = ball.x + ball.vx * t;
      const by = ball.y + ball.vy * t + 0.5 * GRAVITY * t * t;
      const py = FLOOR - JUMP_SPEED * t + 0.5 * PLAYER_GRAVITY * t * t;
      const px = clampCourtX(p.x + direction * COM_SPEED * t, p.side);
      if (py >= FLOOR - 35 || by + ball.r >= FLOOR || (bx - NET) * (p.side ? 1 : -1) < 0) continue;
      if (comShotType({ x: bx, y: by, r: ball.r }) !== 'attack') continue;
      const distance = Math.hypot(bx - px, by - (py - 39));
      if (distance < 65 && (!best || distance < best.distance)) {
        best = { direction, time: t, distance };
      }
    }
    if (best) return best;
  }
  return null;
}

function readHumanInput(p, pads) {
  if (window.matchLobby?.online) return window.matchLobby.input(p.human);
  return readController(p.human, pads);
}

function readController(controller, pads) {
  const b = bindings[controller];
  const pad = pads[controller - 1];
  let move = (keys.has(b[1]) ? 1 : 0) - (keys.has(b[0]) ? 1 : 0);
  let jump = keys.has(b[2]);
  let shot = b[3].some(k => keys.has(k));
  let set = b[4].some(k => keys.has(k));

  if (pad) {
    move = Math.abs(pad.axes[0]) > 0.2 ? pad.axes[0] : move;
    const left = !!pad.buttons[14]?.pressed;
    const right = !!pad.buttons[15]?.pressed;
    if (left || right) move = Number(right) - Number(left);
    const up = pad.axes[1] < -0.5 || !!pad.buttons[12]?.pressed;
    jump ||= up;
    shot ||= pad.buttons[2]?.pressed;
    set ||= pad.buttons[1]?.pressed;
  }

  return { move, jump, shot, set };
}

function decideComInput(p) {
  let jump = false;
  let shot = false;
  let comIntent;

  const own = ball.x < NET ? p.side === 0 : p.side === 1;
  const teammates = players.filter(q => q.side === p.side);
  // Prefer alternating touches only when the teammate can actually reach the ball.
  const assistBall = ball.deadened || ball.lastShot === 'set' || (ball.lastShot === 'receive' && !ball.lastWasReturn);
  const chaseX = assistBall ? coverBallX() : ball.x + ball.vx * 0.18;
  const catchTime = Math.max(
    0,
    (-ball.vy + Math.sqrt(Math.max(0, ball.vy * ball.vy + 2 * GRAVITY * (FLOOR - 65 - ball.y)))) / GRAVITY
  );

  const ready = teammates.filter(q => q.recovery <= 0 && q.cool <= 0);
  const reachable = ready.filter(q => Math.abs(q.x - chaseX) <= 70 + (q.human ? HUMAN_SPEED : COM_SPEED) * catchTime);
  let candidates = reachable.filter(q => q !== ball.lastHitter);
  if (!candidates.length) candidates = reachable.length ? reachable : ready;
  const nearest = candidates.reduce((a, b) => (!a || Math.abs(b.x - chaseX) < Math.abs(a.x - chaseX) ? b : a), null);
  const mate = teammates.find(q => q !== p);
  let target = supportPosition(p, mate);

  if (own && nearest === p) {
    target = clampCourtX(chaseX + (assistBall ? 0 : p.aimError || 0), p.side, 35, 35);
    shot = true;
    if (touchesBefore(p) >= 2 && !ball.deadened) {
      const plan = comJumpPlan(p);
      if (plan) {
        jump = true;
        target = p.x + plan.direction * 100;
      }
      // Do not spend the toss on a ground hit before the planned aerial attack.
      if (ball.lastShot === 'set') {
        const rescue = ball.vy > 0 && ball.y > NETTOP - 20;
        if (rescue) {
          jump = false;
          shot = true;
          comIntent = 'set';
          target = clampCourtX(chaseX, p.side, 35, 35);
        } else {
          shot = p.y < FLOOR - 35 && comShotType(ball) === 'attack';
        }
      }
    }
  }

  const move = Math.abs(target - p.x) > 12 ? Math.sign(target - p.x) : 0;
  return { move, jump, shot, set: false, comIntent };
}

// --- Simulation & Physics Update ---
function finishPoint() {
  const side = pointEnd.side;
  if (score[side] >= WINNING_SCORE) {
    pointEnd = null;
    winner = true;
    setOverlay(
      side ? 'BLUE WINS!' : 'CORAL WINS!',
      `${score[0]} — ${score[1]} / もう一試合、いこう。`,
      'PLAY AGAIN ',
      true
    );
  } else {
    serve(side);
    status();
  }
}

function recordBallTrail() {
  ball.trail.unshift({ x: ball.x, y: ball.y });
  if (ball.trail.length > 9) ball.trail.pop();
}

function applyKnockbackAndGravity(p, dt) {
  p.x += (p.knockback * (1 - Math.exp(-4 * dt))) / 4;
  p.knockback *= Math.exp(-4 * dt);
  p.x = clampCourtX(p.x, p.side);
  p.vy += PLAYER_GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y > FLOOR) {
    p.y = FLOOR;
    p.vy = 0;
  }
}

function updatePointEnd(dt) {
  pointEnd.time -= dt;
  recordBallTrail();
  ball.vy += GRAVITY * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.vx *= Math.exp(-1.2 * dt);

  if (ball.x < ball.r) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx) * 0.5;
  }
  if (ball.x > W - ball.r) {
    ball.x = W - ball.r;
    ball.vx = -Math.abs(ball.vx) * 0.5;
  }
  // The rally is over: bounce on sand without further scoring or player contacts.
  if (ball.y + ball.r >= FLOOR) {
    ball.y = FLOOR - ball.r;
    ball.vy = ball.vy > 55 ? -ball.vy * 0.38 : 0;
  }

  for (const p of players) {
    const wasGrounded = p.y >= FLOOR;
    tickPlayerAnimation(p, dt);
    p.vx = 0;
    p.blockTime = 0;
    p.actionTime = Math.max(0, p.actionTime - dt);
    applyKnockbackAndGravity(p, dt);
    updatePlayerMotion(p, dt, wasGrounded);
  }

  if (pointEnd.time <= 0) finishPoint();
}

function updateActivePlayer(p, dt, pads) {
  tickPlayerAnimation(p, dt);
  p.actionTime = Math.max(0, p.actionTime - dt);
  p.blockTime = Math.max(0, p.blockTime - dt);
  if (p.y >= FLOOR) p.blockTime = 0;
  p.recovery = Math.max(0, p.recovery - dt);
  p.cool = Math.max(0, p.cool - dt);
  p.flash = Math.max(0, p.flash - dt);

  const input = p.human ? readHumanInput(p, pads) : decideComInput(p);
  let { move, jump, shot, set, comIntent } = input;
  const feint = move * (p.side ? -1 : 1) < 0;
  const opponentBall = p.side === 0 ? ball.x > NET : ball.x < NET;

  if (set && p.blockTime <= 0 && opponentBall && p.y < FLOOR && p.recovery <= 0 && p.cool <= 0) {
    p.blockTime = 0.5;
    showAction(p, 'block');
  }
  if (p.blockTime > 0) {
    shot = false;
    set = false;
  }
  if (p.recovery > 0) {
    move = 0;
    jump = false;
    shot = false;
    set = false;
  }

  const grounded = p.y >= FLOOR;
  if (grounded) p.vx = move * (p.human ? HUMAN_SPEED : COM_SPEED);
  if (p.recovery > 0) p.vx = 0;

  p.x += p.vx * dt;
  if (jump && p.y >= FLOOR) {
    p.vy = -JUMP_SPEED;
    tone(220);
  }
  applyKnockbackAndGravity(p, dt);

  if (serveTimer <= 0) tryBlock(p);
  if (
    serveTimer <= 0 &&
    p.blockTime <= 0 &&
    p.recovery <= 0 &&
    p.cool <= 0 &&
    (shot || set) &&
    Math.hypot(ball.x - p.x, ball.y - (p.y - 39)) < 83
  ) {
    hit(p, set, comIntent, move * (p.side ? -1 : 1) > 0, feint);
  }

  updatePlayerMotion(p, dt, grounded);
}

function updateBall(dt) {
  recordBallTrail();
  const oldX = ball.x;
  const oldY = ball.y;
  ball.vy += GRAVITY * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x < ball.r) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx) * 0.8;
  }
  if (ball.x > W - ball.r) {
    ball.x = W - ball.r;
    ball.vx = -Math.abs(ball.vx) * 0.8;
  }
  if (ball.y < ball.r) {
    ball.y = ball.r;
    ball.vy = Math.abs(ball.vy) * 0.7;
  }

  for (const p of players) {
    if (tryBlock(p)) break;
  }

  if (Math.abs(ball.x - NET) < 18 && ball.y + ball.r > NETTOP) {
    if (oldY + ball.r <= NETTOP && ball.vy > 0) {
      ball.y = NETTOP - ball.r;
      ball.vy = -Math.abs(ball.vy) * 0.65;
    } else {
      ball.x = oldX < NET ? NET - 19 : NET + 19;
      ball.vx = (oldX < NET ? -1 : 1) * Math.max(80, Math.abs(ball.vx) * 0.65);
    }
  }

  if (ball.y + ball.r >= FLOOR) {
    const side = ball.x < NET ? 1 : 0;
    score[side]++;
    tone(700);
    ball.y = FLOOR - ball.r;
    ball.vy = -Math.max(180, Math.min(260, Math.abs(ball.vy) * 0.5));
    ball.vx *= 0.35;
    pointEnd = { side, time: POINT_PAUSE };
    document.querySelector('#status').textContent = `${side ? 'BLUE TIDE' : 'CORAL CLUB'} +1 / 次のラリーへ`;
  }
}

function update(dt) {
  if (paused) return;
  time += dt;
  shake *= 0.85;

  particles = particles.filter(p => (p.life -= dt) > 0);
  particles.forEach(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  });

  if (!running || winner) {
    for (const p of players) {
      tickPlayerAnimation(p, dt);
      updatePlayerMotion(p, dt, p.y >= FLOOR);
    }
    return;
  }

  if (pointEnd) {
    updatePointEnd(dt);
    return;
  }

  const pads = navigator.getGamepads?.() || [];
  for (const p of players) {
    updateActivePlayer(p, dt, pads);
  }

  if (serveTimer > 0) {
    serveTimer -= dt;
    return;
  }

  updateBall(dt);
}

// --- Character Animation & Rendering ---
function rect(x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function palm(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  for (let i = 0; i < 13; i++) {
    rect(i * 2, -i * 13, 12, 16, '#537c68');
  }
  ctx.fillStyle = '#467d69';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + i * 0.48;
    ctx.beginPath();
    ctx.moveTo(25, -160);
    ctx.quadraticCurveTo(25 + Math.cos(a) * 85, -160 + Math.sin(a) * 60, 25 + Math.cos(a) * 130, -125 + Math.sin(a) * 65);
    ctx.quadraticCurveTo(25 + Math.cos(a) * 65, -145 + Math.sin(a) * 35, 25, -160);
    ctx.fill();
  }
  ctx.restore();
}

function drawProceduralPlayer(p) {
  ctx.save();
  ctx.translate(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2);
  ctx.scale(p.side ? -1 : 1, 1);

  const outline = '#20394a';
  const skin = '#e9a572';
  const shade = '#bd704e';
  const light = '#ffd1a0';
  const team = p.side ? '#287bbd' : '#ef624a';
  const dark = p.side ? '#194f86' : '#b83b41';
  const highlight = p.side ? '#77d5e8' : '#ffad78';
  const isRunning = Math.abs(p.vx) > 10 && p.y === FLOOR;
  const step = isRunning ? Math.round(Math.sin(time * 17) * 4) * 2 : 0;

  function block(x, y, w, h, c) {
    rect(x, y, w, h, c);
  }
  function limb(x1, y1, x2, y2, width, c) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    for (let i = 0; i <= length; i += 2) {
      const t = i / (length || 1);
      block(
        Math.round((x1 + (x2 - x1) * t) / 2) * 2 - width / 2,
        Math.round((y1 + (y2 - y1) * t) / 2) * 2 - width / 2,
        width,
        width,
        c
      );
    }
  }
  function arm(a, b, c, d) {
    limb(a, b, c, d, 12, outline);
    limb(a, b, c, d, 8, skin);
    limb(a - 2, b, c - 2, d, 2, light);
  }

  // Bent legs, dark outlines, lit shins and bare feet.
  for (const [hip, knee, foot, dy] of [
    [-8, -12, -16, step],
    [8, 14, 18, -step]
  ]) {
    limb(hip, -29, knee, -15 + dy, 12, outline);
    limb(knee, -15 + dy, foot, -4, 10, outline);
    limb(hip, -29, knee, -15 + dy, 8, shade);
    limb(knee, -15 + dy, foot, -4, 6, skin);
    block(foot - 4, -4, 12, 4, outline);
    block(foot - 2, -6, 10, 4, light);
  }

  // Jersey silhouette and layered pixel shading.
  block(-16, -62, 32, 35, outline);
  block(-14, -60, 28, 29, team);
  block(-14, -56, 6, 25, dark);
  block(8, -56, 6, 23, highlight);
  block(-12, -32, 26, 13, outline);
  block(-10, -30, 22, 9, dark);
  block(0, -29, 3, 10, '#fff2d5');
  block(-10, -33, 24, 3, '#fff2d5');
  block(-6, -59, 12, 4, '#fff2d5');
  block(-4, -58, 8, 6, skin);
  block(-8, -46, 3, 10, '#fff2d5');
  block(-4, -46, 7, 3, '#fff2d5');
  block(0, -43, 3, 7, '#fff2d5');

  const action = p.actionTime > 0 ? p.action : null;
  if (p.blockTime > 0 || action === 'set') {
    arm(-14, -56, -17, -84);
    arm(14, -56, 19, -84);
    block(-22, -91, 12, 8, light);
    block(14, -91, 12, 8, light);
  } else if (action === 'attack' || action === 'quick' || action === 'double' || action === 'feint') {
    arm(-14, -56, -25, -44);
    arm(14, -56, 21, -91);
    block(18, -98, 12, 8, light);
    block(16, -73, 10, 4, team);
  } else if (action === 'receive') {
    arm(-14, -55, 12, -41);
    arm(14, -55, 29, -43);
    block(24, -47, 10, 8, light);
  } else {
    arm(-14, -55, -21, -37 + (isRunning ? step : 0));
    arm(14, -55, 24, -36 - (isRunning ? step : 0));
  }

  // Profile face, hair clusters, headband and small facial highlights.
  block(-12, -86, 24, 25, outline);
  block(-10, -83, 20, 20, skin);
  block(-10, -78, 5, 15, shade);
  block(7, -77, 7, 9, skin);
  block(9, -75, 3, 3, light);
  block(4, -78, 4, 4, outline);
  block(5, -79, 2, 2, '#ffffff');
  block(6, -67, 6, 2, shade);
  block(-14, -88, 24, 8, outline);
  block(-12, -92, 9, 6, outline);
  block(-4, -94, 10, 6, outline);
  block(5, -90, 9, 6, outline);
  block(-12, -84, 7, 14, outline);
  block(-9, -88, 7, 4, '#79533e');
  block(0, -90, 6, 4, '#9c6744');
  block(-13, -82, 26, 4, highlight);
  block(-20, -82, 8, 4, team);
  block(-24, -78, 10, 4, dark);
  if (players.indexOf(p) % 2) {
    block(-18, -84, 8, 15, outline);
    block(-22, -78, 9, 14, '#79533e');
  }
  ctx.restore();
}

function drawPlayer(p) {
  const index = players.indexOf(p);
  const art = animatedPlayerArt[index];
  const runArt = selectedRunArt[index];
  const hasSelectedRun = playerSpritePose(p).selectedRun && runArt.complete && runArt.naturalWidth;
  const hasAnimatedArt = art?.complete && art.naturalWidth;
  const hasLegacyArt = playerArt.complete && playerArt.naturalWidth;

  if (hasSelectedRun || hasAnimatedArt || hasLegacyArt) {
    drawPlayerSprite(p);
    return;
  }
  drawProceduralPlayer(p);
}

// Animation clocks belong to each athlete, not the global scenery clock.
// Physics/hit timing stay unchanged; jump poses follow the actual trajectory.
function tickPlayerAnimation(p, dt) {
  p.attackAge = (p.attackAge ?? ATTACK_ANIMATION_DURATION) + dt;
  p.landTime = Math.max(0, (p.landTime ?? 0) - dt);
}

function updatePlayerMotion(p, dt, wasGrounded) {
  const grounded = p.y >= FLOOR;
  if (wasGrounded && !grounded) {
    p.jumpAge = 0;
    p.landTime = 0;
  } else if (!grounded) {
    p.jumpAge = (p.jumpAge ?? 0) + dt;
  }
  if (!wasGrounded && grounded) {
    p.landTime = LANDING_ANIMATION_DURATION;
  }

  const state = grounded ? (Math.abs(p.vx) > 10 ? 'run' : 'idle') : 'jump';
  if (p.motionState !== state) {
    p.motionState = state;
    p.motionClock = 0;
  } else {
    const speedScale = state === 'run' ? Math.max(0.65, Math.min(1.4, Math.abs(p.vx) / HUMAN_SPEED)) : 1;
    p.motionClock = (p.motionClock ?? 0) + dt * speedScale;
  }
}

function playerSpritePose(p) {
  const action = p.actionTime > 0 ? p.action : null;
  // Retain the exact v2 pixels for these two poses.
  if (p.blockTime > 0 || action === 'set') return { legacy: true, frame: 4 };
  if (action === 'receive') return { legacy: true, frame: 3 };
  if (p.y >= FLOOR && p.landTime > 0) return { row: 3, frame: 5 };
  if (['attack', 'quick', 'double', 'feint'].includes(action) && (p.attackAge ?? 1) < ATTACK_ANIMATION_DURATION) {
    return { row: 2, frame: Math.min(5, Math.floor((p.attackAge ?? 0) / 0.06)) };
  }
  if (p.y < FLOOR) {
    const age = p.jumpAge ?? 0;
    const frame = age < 0.05 ? 0 : age < 0.12 ? 1 : p.vy < -120 ? 2 : p.vy <= 120 ? 3 : 4;
    return { row: 3, frame };
  }
  const moving = Math.abs(p.vx) > 10;
  if (moving) {
    return { row: 1, frame: Math.floor((p.motionClock ?? 0) * 24) % 12, selectedRun: true };
  }
  return { row: 0, frame: Math.floor((p.motionClock ?? 0) * 4) % 6 };
}

function drawPlayerSprite(p) {
  const athlete = players.indexOf(p);
  const pose = playerSpritePose(p);
  const runArt = selectedRunArt[athlete];
  let art = animatedPlayerArt[athlete];
  let row = pose.row;
  let frame = pose.selectedRun ? Math.floor(pose.frame / 2) : pose.frame;
  let baseline = 246;
  let rows = 4;

  if (pose.selectedRun && runArt.complete && runArt.naturalWidth) {
    art = runArt;
    row = Math.floor(pose.frame / 6);
    frame = pose.frame % 6;
    rows = 2;
    baseline = 252;
  } else if (pose.legacy && playerArt.complete && playerArt.naturalWidth) {
    art = playerArt;
    row = athlete;
    baseline = 252;
  } else if (!art?.complete || !art.naturalWidth) {
    // Partial/failed atlas loads still show the correct athlete from v2.
    art = playerArt;
    row = athlete;
    baseline = 252;
    frame = pose.legacy ? pose.frame : pose.row === 2 || pose.row === 3 ? 5 : pose.row === 1 ? 1 + (pose.frame % 2) : 0;
  } else if (pose.legacy) {
    row = 0;
    frame = 0;
  }

  const cw = art.naturalWidth / 6;
  const ch = art.naturalHeight / rows;
  const size = 112;
  const idleOffsetX = !pose.legacy && pose.row === 0 && art === animatedPlayerArt[athlete]
    ? IDLE_ALIGNMENT_X[athlete][frame] * size / 256 : 0;

  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  ctx.scale(p.side ? -1 : 1, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art, frame * cw, row * ch, cw, ch, -size / 2 + idleOffsetX, (-size * baseline) / 256, size, size);
  ctx.restore();
}

// --- Camera & Scene Rendering ---
function updateCamera(dt, snap = false) {
  const visibleW = VIEW_W / camera.zoom;
  const visibleH = H / camera.zoom;
  const targetX = Math.max(0, Math.min(W - visibleW, ball.x - visibleW / 2));
  // Horizontal ball tracking with a restrained vertical shift around the court.
  const baseY = H - visibleH;
  const targetY = Math.max(0, Math.min(baseY, baseY - 16 + (ball.y - 300) * 0.1));
  const blend = snap ? 1 : 1 - Math.exp(-8 * dt);

  camera.x += (targetX - camera.x) * blend;
  camera.y += (targetY - camera.y) * blend;
  camera.x = Math.max(0, Math.min(W - visibleW, Math.max(ball.x - visibleW + 45, Math.min(ball.x - 45, camera.x))));
  // Keep high balls visible without changing the court or physics.
  camera.y = Math.max(0, Math.min(baseY, Math.min(camera.y, Math.max(0, ball.y - 30))));
}

function drawScenery() {
  const drift = 0;
  if (beachArt.complete && beachArt.naturalWidth) {
    const iw = beachArt.naturalWidth;
    const ih = beachArt.naturalHeight;
    // Three scenery layers only. Court terrain is rendered separately in world space.
    rect(0, 0, VIEW_W, H, '#1bb9cd');
    for (const layer of SCENERY_LAYERS) {
      if (layer.worldSpace) continue;
      const pad = 160;
      const offset = Math.round(-camera.x * layer.depth);
      const sourceTop = Math.round(ih * layer.top);
      const sourceBottom = Math.round(ih * layer.bottom);
      const screenTop = Math.round(H * layer.top);
      const screenBottom = Math.round(H * layer.bottom);
      ctx.drawImage(
        beachArt,
        0,
        sourceTop,
        iw,
        sourceBottom - sourceTop,
        -pad + offset,
        screenTop,
        VIEW_W + pad * 2,
        screenBottom - screenTop
      );
    }
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, 420);
    sky.addColorStop(0, '#80bbb7');
    sky.addColorStop(0.7, '#f1d8ab');
    sky.addColorStop(1, '#f8dfab');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#fff0b8';
    ctx.beginPath();
    ctx.arc(878 + drift * 0.2, 150, 54, 0, Math.PI * 2);
    ctx.fill();

    for (const [x, y, w] of [
      [80, 80, 155],
      [380, 130, 120],
      [1030, 65, 130]
    ]) {
      rect(x + drift, y, w, 9, '#e7e6cf');
      rect(x + 20 + drift, y - 9, w - 55, 9, '#e7e6cf');
    }

    ctx.fillStyle = '#78a9a0';
    ctx.beginPath();
    ctx.moveTo(0, 310);
    ctx.lineTo(80 + drift * 0.4, 240);
    ctx.lineTo(210, 280);
    ctx.lineTo(320, 310);
    ctx.fill();

    rect(0, 310, W, 145, '#599e9e');
    for (let i = 0; i < 9; i++) {
      const y = 320 + i * 14;
      rect(((time * (i + 1) * 4) % 150) - 150, y, 1350, 2, i % 2 ? '#90c5b5' : '#72b4ac');
    }
    rect(0, 425, W, 195, '#e9cb91');
    rect(0, 440, W, 5, '#f8e3b6');
    rect(0, 453, W, 3, '#cdb782');
    palm(-10 + drift, 430, 1.6);
    palm(1100 + drift * 1.4, 440, 1.25);
  }
}

function drawWorldTerrain() {
  // Draw sea through shoreline and sand as one continuous image: no color seam.
  if (beachArt.complete && beachArt.naturalWidth) {
    const nearLayer = SCENERY_LAYERS.find(layer => layer.worldSpace);
    const shoreY = Math.round(H * nearLayer.top);
    const sourceY = Math.round(beachArt.naturalHeight * nearLayer.top);
    ctx.drawImage(beachArt, 0, sourceY, beachArt.naturalWidth, beachArt.naturalHeight - sourceY, 0, shoreY, W, H - shoreY);
  } else {
    rect(0, 425, W, H - 425, '#e9cb91');
    rect(0, 440, W, 5, '#f8e3b6');
    rect(0, 453, W, 3, '#cdb782');
  }

  // World-space court, players, net and ball; HUD stays in screen space.
  rect(50, 529, W - 100, 3, '#fff1cc');
  rect(50, 530, 3, 55, '#fff1cc');
  rect(W - 53, 530, 3, 55, '#fff1cc');
  rect(50, 583, W - 100, 3, '#fff1cc');

  for (let i = 0; i < 65; i++) {
    const x = (i * 173) % W;
    const y = 465 + ((i * 59) % 150);
    rect(x, y, 3, 2, '#d5b780');
  }

  ctx.fillStyle = '#214d4830';
  for (const p of players) {
    ctx.beginPath();
    ctx.ellipse(p.x, FLOOR + 4, 25, 6, 0, 0, 7);
    ctx.fill();
  }
}

function drawPlayersWithLabels() {
  // Animated sprite atlases with a procedural fallback while loading.
  for (const p of players) {
    drawPlayer(p);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    ctx.fillStyle = '#153b3c';
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(window.matchLobby?.label(players.indexOf(p)) ?? (p.human ? `${p.human}P` : 'COM'), x, y - 118);

    if (p.actionTime > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.actionTime / 0.15);
      ctx.font = 'bold 14px sans-serif';
      const label = ACTION_LABELS[p.action];
      const width = ctx.measureText(label).width + 20;
      const labelX = Math.max(camera.x + width / 2 + 4, Math.min(camera.x + VIEW_W / camera.zoom - width / 2 - 4, x));
      const labelY = Math.max(camera.y + 120 / camera.zoom, y - 136);
      rect(labelX - width / 2, labelY - 17, width, 26, p.action === 'double' ? '#ffe135' : '#153b3c');
      ctx.fillStyle = p.action === 'double' ? '#153b3c' : '#fff6dc';
      ctx.textAlign = 'center';
      ctx.fillText(label, labelX, labelY + 1);
      ctx.restore();
    }
  }
}

function drawNet() {
  rect(NET - 6, NETTOP, 12, FLOOR - NETTOP, '#193f59');
  rect(NET - 4, NETTOP, 8, FLOOR - NETTOP, '#faf5d9');
  rect(NET - 4, FLOOR - 65, 8, 65, '#2798c5');
  rect(NET - 4, FLOOR - 65, 3, 65, '#82dfeb');
  ctx.strokeStyle = '#f5efd488';
  ctx.lineWidth = 1;
  for (let y = NETTOP + 8; y < FLOOR; y += 12) {
    ctx.beginPath();
    ctx.moveTo(NET - 11, y);
    ctx.lineTo(NET + 11, y);
    ctx.stroke();
  }
  rect(NET - 12, NETTOP, 24, 5, '#f9f4dc');
}

function drawBallAndParticles() {
  ball.trail.forEach((p, i) => {
    ctx.globalAlpha = (1 - i / 9) * 0.16;
    ctx.fillStyle = ball.doubleAttack ? '#ffe135' : '#fff7df';
    ctx.beginPath();
    ctx.arc(p.x, p.y, ball.r * (1 - i / 12), 0, 7);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(ball.x, ball.y);
  if (ball.doubleAttack) {
    ctx.shadowColor = '#ffdf00';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#ffe135';
    ctx.beginPath();
    ctx.arc(0, 0, 17 + Math.sin(time * 18) * 2, 0, 7);
    ctx.fill();
  }
  ctx.rotate(time * 3);
  ctx.fillStyle = ball.doubleAttack ? '#fff46a' : '#fff9dc';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#e77a43';
  ctx.fillRect(-10, -3, 20, 6);
  ctx.fillStyle = ball.doubleAttack ? '#e5aa16' : '#4c8f9b';
  ctx.fillRect(-3, -10, 6, 20);
  ctx.restore();

  particles.forEach(p => rect(p.x, p.y, 4, 4, '#fff5c9'));
}

function drawHud() {
  rect(418, 17, 364, 94, '#153e58');
  rect(422, 21, 356, 86, '#fff4d7');
  rect(428, 27, 344, 74, '#e9f6ec');
  rect(430, 29, 6, 70, '#f27653');
  rect(764, 29, 6, 70, '#359fc2');

  ctx.textAlign = 'center';
  ctx.fillStyle = '#153b3c';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('CORAL CLUB', 478, 47);
  ctx.fillText('BLUE TIDE', 722, 47);

  ctx.font = 'bold 48px monospace';
  ctx.fillText(String(score[0]).padStart(2, '0'), 478, 99);
  ctx.fillText(String(score[1]).padStart(2, '0'), 722, 99);

  ctx.font = '20px monospace';
  ctx.fillText(':', 600, 87);

  if (paused) {
    rect(0, 0, W, H, '#123e3b66');
    ctx.fillStyle = '#fff3d8';
    ctx.font = 'bold 48px monospace';
    ctx.fillText('PAUSED', 600, 280);
  } else if (running && serveTimer > 0) {
    ctx.fillStyle = '#153b3c';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('READY?', 600, 180);
  }
}

function draw() {
  ctx.save();
  ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  drawScenery();

  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  drawWorldTerrain();
  drawPlayersWithLabels();
  drawNet();
  drawBallAndParticles();

  ctx.restore();

  drawHud();
  ctx.restore();
}

function loop(now) {
  const dt = Math.min((now - last) / 1000 || 0, 0.033);
  last = now;
  window.matchLobby?.tick(now);
  if (!window.matchLobby?.guest) update(dt);
  if (!paused) updateCamera(dt);
  draw();
  requestAnimationFrame(loop);
}

reset();
requestAnimationFrame(loop);

// Host owns physics; guests only apply snapshots and send their own controller.
window.rallyGame = {
  start() { reset(); running = true; document.querySelector('#overlay').classList.add('hidden'); },
  stop() { reset(); keys.clear(); },
  pause() { if (running) { paused = !paused; status(); } },
  controller() { return readController(1, navigator.getGamepads?.() || []); },
  snapshot() {
    return { players, ball: { ...ball, lastHitter: players.indexOf(ball.lastHitter) },
      score, running, paused, winner, serveTimer, time, shake, particles, pointEnd };
  },
  apply(s) {
    players = s.players; ball = s.ball; ball.lastHitter = players[ball.lastHitter] || null;
    score = s.score; running = s.running; paused = s.paused; winner = s.winner;
    serveTimer = s.serveTimer; time = s.time; shake = s.shake; particles = s.particles; pointEnd = s.pointEnd;
    if (winner) setOverlay(score[0] >= WINNING_SCORE ? 'CORAL WINS!' : 'BLUE WINS!', 'ロビーで次の試合の担当を決めましょう。', 'LOBBY ');
    else document.querySelector('#overlay').classList.toggle('hidden', running);
    status();
  }
};
