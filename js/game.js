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
const ballArt = loadImage('assets/volleyball-ball-v1.png');
const attackSwooshArt = loadImage('assets/effects/attack-swoosh-v1.png');
const playerArt = loadImage('assets/volleyball-players-v2.png');
const blockArt = loadImage('assets/characters/block-v2.png');
const straightBlockArt = loadImage('assets/characters/block-straight-v1.png');
// Portrait cells keep the extended legs at the same body scale as the toss.
const STRAIGHT_BLOCK_BASELINES = [730, 730, 734, 730].map(y => y / 512);
const tossHitArt = loadImage('assets/characters/toss-hit-v2.png');
const receiveHitArt = loadImage('assets/characters/receive-hit-v1.png');
const serveArt = loadImage('assets/characters/serve-v1.png');
const SERVE_BASELINES = [429, 429, 431, 431].map(y => y / 443.5);
const SERVE_SPRITE_SIZE = 132;
const RECEIVE_HIT_BASELINES = [606, 607, 605, 605].map(y => y / 627);
const flyingReceiveArt = loadImage('assets/characters/flying-receive-v1.png');
const TOSS_HIT_BASELINES = [589, 589, 624, 625].map(y => y / 627);
const BLOCK_BASELINES = [[355, 355, 355], [352, 353, 353], [354, 355, 355], [353, 353, 353]].map(row => row.map(y => y / 362));
const animatedPlayerArt = CHARACTER_NAMES.map(name => loadImage(`assets/characters/${name}-v3.png`));
const selectedRunArt = CHARACTER_NAMES.map(name => loadImage(`assets/characters/${name}-run-selected.png`));

// --- Constants ---
const VIEW_W = 1200;
const W = 1080;
const H = 620;
const FLOOR = 530;
const COURT_REAR_LINE_Y = 509;
const COURT_FRONT_LINE_Y = 563;
const NET = W / 2;
const NETTOP = 385;
const GRAVITY = 650;

const JUMP_SPEED = 650;
const PLAYER_GRAVITY = 1450;
const HUMAN_SPEED = 245;
const COM_SPEED = 185;
const WINNING_SCORE = 11;
const POINT_PAUSE = 1.4;

// All action timings are authored in 60Hz simulation frames, independent of display FPS.
const GAME_FPS = 60;
const FRAME_RULES = Object.freeze({
  actionPose: 54, humanCooldown: 17, comCooldownMin: 21, comCooldownMax: 60,
  blockActive: 30, blockCooldown: 18, doubleImpactMultiplier: 4,
  attackAnimation: 22, attackContact: 7, attackCharge: 30, landingAnimation: 10, landingRecovery: 12, tossContact: 18, receiveContact: 18,
  flyingDive: 14, flyingProne: 22, flyingGetup: 19, flyingMinRecovery: 33, flyingContactExtra: 5
});
const seconds = frames => frames / GAME_FPS;
const FLYING_TOTAL_FRAMES = FRAME_RULES.flyingDive + FRAME_RULES.flyingProne + FRAME_RULES.flyingGetup;
const ATTACK_ANIMATION_DURATION = seconds(FRAME_RULES.attackAnimation);
const LANDING_ANIMATION_DURATION = seconds(FRAME_RULES.landingAnimation);
const FLYING_DIVE_DURATION = seconds(FRAME_RULES.flyingDive);
const FLYING_PRONE_DURATION = seconds(FRAME_RULES.flyingProne);
const FLYING_GETUP_DURATION = seconds(FRAME_RULES.flyingGetup);
const FLYING_TOTAL_DURATION = seconds(FLYING_TOTAL_FRAMES);
const FLYING_DIVE_SPEED = 520;
const FLYING_TRIGGER_DISTANCE = 75;
const ACTION_RECOVERY_FRAMES = Object.freeze({
  receive: 24, powerReceive: 10, flying: FLYING_TOTAL_FRAMES, set: 18,
  attack: 12, quick: 12, double: 12, feint: 12, block: 12, loop: 12
});
function advanceFrames(remaining, dt) {
  const next = remaining - dt * GAME_FPS;
  return next < 1e-7 ? 0 : next;
}
const ATTACK_SPEED = 720;
const QUICK_SPEED = 1350;
const QUICK_MAX_SPEED = 1450;
const QUICK_DRIVE = 820;
const ATTACK_CHARGE_BONUS = 0.5;
const KNOCKBACK_RULES = Object.freeze({ weak: 900, double: 1300, powerServe: 1300, decay: 4 });
const TOSS_SPEEDS = Object.freeze({ normal: 410, high: 520, powerReceive: 500 });
const SPECIAL_RULES = Object.freeze({
  mozuPeakY: 62, mozuDiveSpeed: 1100, empoweredSpeed: 1.5,
  knockback: 1800, knockbackGround: 900, impactRiseSpeed: 650, impactRecovery: 48
});
const COM_SPECIAL_CHANCE = 0.5;

const CONTACT_RADIUS = 83;
const HIT_OFFSET_Y = 39;
const BLOCK_CONTACT_RADIUS = 76;
const BLOCK_OFFSET_Y = 75;
const NET_HALF_WIDTH = 18;
const NET_CLEAR_OFFSET = 20;
const SERVE_TOSS_VX = 75;
const SERVE_TOSS_VY = -420;

function playerForward(p) {
  return p.side ? -1 : 1;
}

function inBallContactRange(p, b = ball) {
  if (!b) return false;
  return Math.hypot(b.x - p.x, b.y - (p.y - HIT_OFFSET_Y)) < CONTACT_RADIUS;
}

function inBlockContactRange(p, b = ball) {
  if (!b) return false;
  return Math.hypot(b.x - p.x, b.y - (p.y - BLOCK_OFFSET_Y)) <= BLOCK_CONTACT_RADIUS;
}

function isAllCom() {
  return players.length > 0 && players.every(p => !p.human);
}

function spawnHitParticles(x, y, color = null, count = 9) {
  for (let j = 0; j < count; j++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 180,
      vy: (Math.random() - 0.5) * 180,
      life: 0.35,
      color
    });
  }
}

const ACTION_LABELS = {
  receive: 'レシーブ',
  powerReceive: 'パワーレシーブ',
  flying: 'フライング',
  set: 'トス',
  attack: 'アタック',
  double: 'ダブルアタック',
  quick: 'クイック',
  feint: 'フェイント',
  loop: 'ループシュート',
  block: 'ブロック',
  mozu: 'モズ落とし',
  empowered: 'パワーアタック',
  powerServe: 'パワーサーブ'
};

const ACTION_POP_FRAMES = 60;
const ACTION_POP_STYLES = {
  receive: { text: 'RECEIVE!', color: '#75e3db', dark: '#1f9da5' },
  powerReceive: { text: 'POWER RECEIVE!', color: '#78ff9d', dark: '#19a84a' },
  flying: { text: 'DIVE!', color: '#a5f4e2', dark: '#2aa897' },
  set: { text: 'SET!', color: '#83e5ff', dark: '#358fcf' },
  attack: { text: 'ATTACK!', color: '#ffb26b', dark: '#ed603d' },
  double: { text: 'DOUBLE!', color: '#fff07a', dark: '#f3a52c' },
  quick: { text: 'QUICK!', color: '#ffcf67', dark: '#f07e36' },
  feint: { text: 'FEINT!', color: '#dcc5ff', dark: '#9873cc' },
  loop: { text: 'LOOP!', color: '#9ef0ff', dark: '#249ec2' },
  block: { text: 'BLOCK!', color: '#b8f58b', dark: '#54b899' },
  mozu: { text: 'MOZU DROP!', color: '#80dfff', dark: '#2876df' },
  empowered: { text: 'POWER ATTACK!', color: '#80dfff', dark: '#2876df' },
  powerServe: { text: 'POWER SERVE!', color: '#80dfff', dark: '#2876df' }
};

const INITIAL_PLAYER_X = [200, 370, 710, 880];
const PLAYER_COLORS = ['#e96a42', '#e7ad43', '#407f99', '#646fb0'];
const PLAYER_GAUGE_COLORS = ['#ff6559', '#ffc83d', '#32d5ff', '#bd91ff'];

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
  1: ['ArrowLeft', 'ArrowRight', 'ArrowUp', ['KeyZ', 'KeyA'], ['KeyX', 'KeyB'], 'ArrowDown'],
  2: ['KeyF', 'KeyH', 'KeyT', ['KeyG'], ['KeyV'], 'KeyC'],
  3: ['KeyJ', 'KeyL', 'KeyI', ['KeyK'], ['KeyM'], 'KeyN'],
  4: ['Numpad4', 'Numpad6', 'Numpad8', ['Numpad1'], ['Numpad2'], 'Numpad5']
};

const RASTER_SCENERY = {
  lineHeight: 2,   // Two screen pixels per raster strip.
  horizon: 0.54,
  shoreline: 0.75,
  distantSpeed: 0.10,
  waveAmplitude: 5,
  waveSpeed: 2.2
};

// --- Game State ---
let pointEnd = null;
let mode = 1;
let players = [];
let ball;
let score = [0, 0];
let running = false;
let characterCheck = false;
let checkMode = 'free'; // 'free' | 'serve' | 'receive'
let checkBallResetTimer = 0;
let checkIncomingLabel = '';
let serveState = null;
let serveTurns = [0, 0];
let checkBallSide = 0;
let checkGaugeTime = 0;
let paused = false;
let winner = false;
let serveTimer = 0;
let last = 0;
let time = 0;
let shake = 0;
let sound = true;
let audioSequence = 0;
let receivedAudioSequence = 0;
let audioEvents = [];
let particles = [];
let specialActivation = null;

const camera = { x: 0, y: 0, zoom: 1.48 };
const keys = new Set();

// --- UI & Audio ---
const modesContainer = document.querySelector('#modes');
if (modesContainer) {
  modeNames.forEach((name, i) => {
    const b = document.createElement('button');
    b.textContent = name;
    b.className = i === mode ? 'active' : '';
    b.onclick = () => {
      if (window.matchLobby?.online) return;
      mode = i;
      window.matchLobby?.preset(assignments[mode]);
      reset();
    };
    modesContainer.append(b);
  });
}

function syncModeButtons() {
  document.querySelectorAll('#modes button').forEach((button, i) => {
    const selected = !characterCheck && i === mode;
    button.classList.toggle('active', selected);
    button.ariaPressed = String(selected);
  });
  const checkButton = document.querySelector('#character-check');
  if (checkButton) {
    checkButton.classList.toggle('active', characterCheck);
    checkButton.ariaPressed = String(characterCheck);
  }
  syncCheckModeUI();
}

function syncCheckModeUI() {
  const groups = [
    getArenaElement('#arena-check-modes'),
    getArenaElement('#stage-check-modes'),
    document.querySelector('#character-check-modes')
  ];
  for (const group of groups) {
    if (!group) continue;
    group.hidden = !characterCheck;
    if (characterCheck) {
      group.querySelectorAll('[data-check-mode]').forEach(btn => {
        const active = btn.getAttribute('data-check-mode') === checkMode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }
  }
}

function setCheckMode(nextMode) {
  if (nextMode !== 'free' && nextMode !== 'serve' && nextMode !== 'receive') return;
  checkMode = nextMode;
  checkBallResetTimer = 0;
  checkIncomingLabel = '';
  syncCheckModeUI();
  if (characterCheck) {
    initCurrentCheckMode();
  }
}

function getArenaElement(selector) {
  if (typeof document === 'undefined') return null;
  return document.querySelector(selector) ||
    popoutWindow?.document?.querySelector(selector) ||
    null;
}

function setOverlay(title, description, buttonText, visible = true) {
  const overlay = getArenaElement('#overlay');
  if (!overlay) return;
  const doc = overlay.ownerDocument || document;
  const blueWins = winner && score[1] >= WINNING_SCORE;
  overlay.classList.toggle('is-victory', winner);
  overlay.classList.toggle('winner-blue', blueWins);
  const eyebrow = doc.querySelector('#overlay-eyebrow');
  if (eyebrow) eyebrow.textContent = winner
    ? 'FINAL WHISTLE / MATCH COMPLETE' : 'SUNSET RALLY / WELCOME TO THE BEACH';
  const result = doc.querySelector('#overlay-result');
  if (result) result.hidden = !winner;
  const rCoral = doc.querySelector('#result-coral');
  if (rCoral) rCoral.textContent = String(score[0]).padStart(2, '0');
  const rBlue = doc.querySelector('#result-blue');
  if (rBlue) rBlue.textContent = String(score[1]).padStart(2, '0');
  if (visible) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
  const h2 = doc.querySelector('#overlay h2');
  if (h2) h2.textContent = title;
  const p = doc.querySelector('#overlay p');
  if (p) p.textContent = description;
  const startBtn = doc.querySelector('#start');
  if (startBtn?.firstChild) startBtn.firstChild.textContent = buttonText;
  updateFullscreenUI();
}

function createPlayer(x, index) {
  return {
    index,
    x,
    y: FLOOR,
    vx: 0,
    vy: 0,
    side: index < 2 ? 0 : 1,
    human: window.matchLobby?.assignment(index) ?? assignments[mode][index],
    color: PLAYER_COLORS[index],
    gauge: 0,
    specials: 0,
    receiveReady: false,
    attackChargeFrames: 0,
    blockPressure: 0,
    airborneTouch: false,
    airborneActionTaken: false,
    airborneShotHeld: false,
    cooldownFrames: 0,
    recoveryFrames: 0,
    knockback: 0,
    blockFrames: 0,
    action: null,
    actionFrames: 0,
    flash: 0
  };
}

function reset() {
  serveTurns = [0, 0];
  characterCheck = false;
  checkMode = 'free';
  checkBallResetTimer = 0;
  checkIncomingLabel = '';
  checkGaugeTime = 0;
  const exitCheck = getArenaElement('#exit-character-check');
  if (exitCheck) exitCheck.hidden = true;
  particles = [];
  specialActivation = null;
  audioEvents = [];
  receivedAudioSequence = 0;
  score = [0, 0];
  winner = false;
  paused = false;
  running = false;
  players = INITIAL_PLAYER_X.map(createPlayer);
  serve(0);
  updateCamera(0, true);
  setOverlay('LET’S RALLY.', 'キャラの操作担当を決めて、砂浜へ。', 'PLAYER SETUP ', true);
  status();
  syncModeButtons();
  syncCheckModeUI();
}

function status() {
  const el = getArenaElement('#status');
  if (!el) return;
  el.textContent = paused
    ? (window.matchLobby?.online ? 'PAUSED / ホストのSPACEで再開' : 'PAUSED / SPACEで再開')
    : characterCheck ? (
        checkMode === 'serve'
          ? `キャラ挙動チェック [サーブ練習] / ${serveState?.phase === 'holding' ? 'A:トス・B:地上サーブ / ↓+A:パワー' : '↑:ジャンプ・A:打球'} / R:即時リセット / 1-3:切替`
          : checkMode === 'receive'
          ? `キャラ挙動チェック [レシーブ練習: ${checkIncomingLabel || '飛来中'}] / A:レシーブ・B:トス / R:次の球 / 1-3:切替`
          : 'キャラ挙動チェック [フリー練習] / 中央から打ち上げ / A:ショット・B:トス / R:リセット / 1-3:切替'
      )
    : serveState ? `${players[serveState.serverIndex].side ? 'BLUE' : 'CORAL'} サーブ / ${serveState.phase === 'holding' ? 'Aでトス・Bで地上サーブ' : '↑でジャンプ・Aで打つ'}`
    : window.matchLobby?.online ? 'ONLINE / ホスト: SPACEで一時停止・Rでロビー / 先に11点で勝利' : '先に11点で勝利';
}

function isFullscreenArena() {
  const arena = document.querySelector?.('#arena') || document.querySelector?.('.arena');
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return false;
  return Boolean(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement ||
    (arena && arena.classList?.contains?.('is-fullscreen'))
  );
}

function shouldLockArenaScroll() {
  if (!isFullscreenArena()) return false;
  if (!running || winner) return false;
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return false;
  if (doc.querySelector?.('dialog[open]')) return false;
  const overlay = getArenaElement('#overlay');
  if (overlay && !overlay.classList?.contains?.('hidden')) return false;
  return true;
}

function updateFullscreenUI() {
  const active = isFullscreenArena();
  const shouldLock = shouldLockArenaScroll();
  const btn = document.querySelector?.('#toggle-fullscreen');
  const arena = document.querySelector?.('#arena') || document.querySelector?.('.arena');
  if (typeof document !== 'undefined') {
    document.body?.classList?.toggle?.('is-arena-fullscreen', shouldLock);
    document.documentElement?.classList?.toggle?.('is-arena-fullscreen', shouldLock);
  }
  if (arena && arena.classList?.toggle) {
    const doc = typeof document !== 'undefined' ? document : null;
    const nativeActive = Boolean(
      doc?.fullscreenElement ||
      doc?.webkitFullscreenElement ||
      doc?.mozFullScreenElement ||
      doc?.msFullscreenElement
    );
    arena.classList.toggle('is-fullscreen', active && !nativeActive);
  }
  if (!btn) return;
  const iconExpand = btn.querySelector?.('.icon-expand');
  const iconCompress = btn.querySelector?.('.icon-compress');
  const fsText = btn.querySelector?.('.fs-text');
  if (iconExpand) {
    if (active) iconExpand.setAttribute('hidden', '');
    else iconExpand.removeAttribute('hidden');
  }
  if (iconCompress) {
    if (active) iconCompress.removeAttribute('hidden');
    else iconCompress.setAttribute('hidden', '');
  }
  if (fsText) fsText.textContent = active ? 'WINDOW' : 'FULLSCREEN';
  btn.setAttribute?.('aria-label', active ? '通常表示に戻す' : 'フルスクリーンの切り替え');
  btn.title = active ? '通常表示に戻す (F)' : 'フルスクリーンの切り替え (F)';
}

async function requestFullscreenArena() {
  const arena = document.querySelector?.('#arena') || document.querySelector?.('.arena');
  if (!arena) return;
  try {
    if (arena.requestFullscreen) {
      await arena.requestFullscreen();
    } else if (arena.webkitRequestFullscreen) {
      await arena.webkitRequestFullscreen();
    } else if (arena.mozRequestFullScreen) {
      await arena.mozRequestFullScreen();
    } else if (arena.msRequestFullscreen) {
      await arena.msRequestFullscreen();
    } else {
      arena.classList?.add?.('is-fullscreen');
    }
  } catch (err) {
    arena.classList?.add?.('is-fullscreen');
  }
  updateFullscreenUI();
}

async function exitFullscreenArena() {
  const arena = document.querySelector?.('#arena') || document.querySelector?.('.arena');
  try {
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc?.fullscreenElement || doc?.webkitFullscreenElement || doc?.mozFullScreenElement || doc?.msFullscreenElement) {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      else if (doc.mozCancelFullScreen) await doc.mozCancelFullScreen();
      else if (doc.msExitFullscreen) await doc.msExitFullscreen();
    }
  } catch (err) {
    // Ignore rejection
  }
  if (arena) arena.classList?.remove?.('is-fullscreen');
  updateFullscreenUI();
}

async function toggleFullscreen() {
  if (isFullscreenArena()) {
    await exitFullscreenArena();
  } else {
    await requestFullscreenArena();
  }
}

function initFullscreenControl() {
  const btn = document.querySelector?.('#toggle-fullscreen');
  if (btn?.addEventListener) {
    btn.addEventListener('click', e => {
      e?.preventDefault?.();
      toggleFullscreen();
    });
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(ev => {
      document.addEventListener(ev, updateFullscreenUI);
    });
    document.addEventListener('close', e => {
      if (e.target?.tagName?.toLowerCase?.() === 'dialog') {
        updateFullscreenUI();
      }
    }, true);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      try {
        const dialogObserver = new MutationObserver(mutations => {
          for (const m of mutations) {
            if (m.type === 'attributes' && m.attributeName === 'open') {
              updateFullscreenUI();
              break;
            }
          }
        });
        dialogObserver.observe(document.body, {
          attributes: true,
          subtree: true,
          attributeFilter: ['open']
        });
      } catch (_) {}
    }
  }
  updateFullscreenUI();
}
if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener?.('DOMContentLoaded', initFullscreenControl);
} else {
  initFullscreenControl();
}

// --- Popout (Picture-in-Picture / Independent Window) Arena Presentation ---
let popoutWindow = null;
let arenaPlaceholder = null;

function isPopoutActive() {
  return Boolean(popoutWindow && !popoutWindow.closed);
}

function updatePopoutUI() {
  const active = isPopoutActive();
  const btns = [
    document.querySelector?.('#toggle-popout'),
    popoutWindow?.document?.querySelector?.('#toggle-popout')
  ];
  btns.forEach(btn => {
    if (!btn) return;
    const text = btn.querySelector?.('.popout-text');
    if (text) text.textContent = active ? 'RESTORE' : 'POPOUT';
    btn.setAttribute?.('aria-label', active ? '通常画面に戻す' : 'ゲーム画面をポップアウト');
    btn.title = active ? '通常画面に戻す (P)' : 'ゲーム画面を別ウィンドウで表示 (P)';
  });
}

function copyStylesTo(targetDoc) {
  if (!targetDoc?.head) return;
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;
  Array.from(doc.styleSheets || []).forEach(sheet => {
    try {
      if (sheet.href) {
        const link = targetDoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        targetDoc.head.appendChild(link);
      } else if (sheet.cssRules) {
        const style = targetDoc.createElement('style');
        Array.from(sheet.cssRules).forEach(rule => {
          style.appendChild(targetDoc.createTextNode(rule.cssText));
        });
        targetDoc.head.appendChild(style);
      }
    } catch (e) {
      if (sheet.href) {
        const link = targetDoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        targetDoc.head.appendChild(link);
      }
    }
  });
}

async function requestPopoutArena() {
  const arena = document.querySelector?.('#arena') || document.querySelector?.('.arena');
  if (!arena) return;
  if (isFullscreenArena()) {
    await exitFullscreenArena();
  }
  const width = 1220;
  const height = 720;
  let win = null;

  if (typeof window !== 'undefined' && window.documentPictureInPicture?.requestWindow) {
    try {
      win = await window.documentPictureInPicture.requestWindow({ width, height });
    } catch (err) {
      // Fallback to window.open
    }
  }

  if (!win && typeof window !== 'undefined' && window.open) {
    try {
      win = window.open(
        '',
        'SunsetRallyPopout',
        `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
      );
    } catch (err) {
      // Popups may be blocked
    }
  }

  if (!win) {
    alert('ポップアップウィンドウが開けませんでした。ブラウザのポップアップブロックをご確認ください。');
    return;
  }

  popoutWindow = win;

  try {
    win.document.title = 'Sunset Rally - Beach Volleyball';
    copyStylesTo(win.document);
    win.document.body.style.cssText = 'margin:0;padding:0;background:#030d14;overflow:hidden;height:100vh;display:flex;flex-direction:column;justify-content:center;';
  } catch (err) {}

  if (!arenaPlaceholder && typeof document !== 'undefined') {
    arenaPlaceholder = document.createElement('div');
    arenaPlaceholder.id = 'arena-placeholder';
    arenaPlaceholder.className = 'arena-placeholder';
    arenaPlaceholder.innerHTML = `
      <div class="placeholder-card">
        <p class="eyebrow">POPOUT ACTIVE</p>
        <h3>ゲーム画面は別ウィンドウで表示中です</h3>
        <button id="return-from-popout" class="return-btn" type="button">ゲーム画面をここに戻す ↙</button>
      </div>
    `;
    arenaPlaceholder.querySelector('#return-from-popout')?.addEventListener('click', restorePopoutArena);
  }

  if (arena.parentNode) {
    arena.parentNode.insertBefore(arenaPlaceholder, arena);
  }
  arena.classList?.add('is-popout');
  win.document.body.appendChild(arena);

  const forwardKey = e => {
    window.dispatchEvent(new KeyboardEvent(e.type, {
      key: e.key,
      code: e.code,
      bubbles: true,
      cancelable: true,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      repeat: e.repeat
    }));
  };
  win.addEventListener('keydown', forwardKey);
  win.addEventListener('keyup', forwardKey);

  win.addEventListener('blur', () => {
    keys.clear();
    if (running && !window.matchLobby?.online && !isAllCom()) {
      paused = true;
      status();
    }
  });

  const onPopoutClose = () => {
    restorePopoutArena();
  };
  win.addEventListener('pagehide', onPopoutClose);
  win.addEventListener('unload', onPopoutClose);

  updatePopoutUI();
  updateFullscreenUI();

  const canvas = arena.querySelector('canvas');
  canvas?.focus?.();
}

function restorePopoutArena() {
  if (!isPopoutActive() && !arenaPlaceholder?.parentNode) return;
  const arena = document.querySelector?.('#arena') ||
    document.querySelector?.('.arena') ||
    popoutWindow?.document?.querySelector?.('#arena') ||
    popoutWindow?.document?.querySelector?.('.arena');

  if (arena && arenaPlaceholder?.parentNode) {
    arena.classList?.remove('is-popout');
    arenaPlaceholder.parentNode.replaceChild(arena, arenaPlaceholder);
  }

  if (popoutWindow && !popoutWindow.closed) {
    try {
      popoutWindow.close();
    } catch (err) {}
  }
  popoutWindow = null;

  updatePopoutUI();
  updateFullscreenUI();

  const canvas = arena?.querySelector('canvas') || document.querySelector('canvas');
  canvas?.focus?.();
}

async function togglePopout() {
  if (isPopoutActive()) {
    restorePopoutArena();
  } else {
    await requestPopoutArena();
  }
}

function initPopoutControl() {
  const btn = document.querySelector?.('#toggle-popout');
  if (btn?.addEventListener) {
    btn.addEventListener('click', e => {
      e?.preventDefault?.();
      togglePopout();
    });
  }
  updatePopoutUI();
}

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener?.('DOMContentLoaded', initPopoutControl);
} else {
  initPopoutControl();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (popoutWindow && !popoutWindow.closed) {
      try { popoutWindow.close(); } catch (err) {}
    }
  });
  window.rallyPopout = {
    isPopoutActive,
    getPopoutDocument: () => (popoutWindow && !popoutWindow.closed ? popoutWindow.document : null),
    requestPopoutArena,
    restorePopoutArena,
    togglePopout
  };
}

function startCharacterCheck(initialMode = checkMode || 'free') {
  if (window.matchLobby?.online) return;
  reset();
  characterCheck = true;
  checkMode = (initialMode === 'serve' || initialMode === 'receive') ? initialMode : 'free';
  players = [createPlayer(NET - 100, 0)];
  players[0].human = 1;
  checkBallSide = 0;
  running = true;
  keys.clear();
  const overlay = getArenaElement('#overlay');
  if (overlay) overlay.classList.add('hidden');
  const exitCheck = getArenaElement('#exit-character-check');
  if (exitCheck) exitCheck.hidden = false;
  window.rallyAudio?.unlock();
  initCurrentCheckMode();
  syncCheckModeUI();
  syncModeButtons();
  updateFullscreenUI();
  canvas.focus?.();
}

function launchCheckBall() {
  launchCheckBallFree();
}

document.querySelector('#character-check').onclick = () => startCharacterCheck();
document.querySelector('#exit-character-check').onclick = () => { reset(); window.matchLobby?.show(); };

function serve(side) {
  serveState = null;
  pointEnd = null;
  ball = {
    x: side ? 900 : 300,
    y: 210,
    vx: side ? -135 : 135,
    vy: -30,
    r: 12,
    rotation: 0,
    spinDirection: side ? -1 : 1,
    trail: [],
    lastSide: side,
    lastHitter: null,
    touchSide: null,
    teamTouches: 0,
    returnAwarded: false,
    lastWasReturn: false,
    lastShot: null,
    deadened: false,
    doubleAttack: false,
    quickAttack: false,
    specialShot: null,
    serveVariant: null,
    mozuPhase: null,
    feintDrive: 0
  };
  serveTimer = 1.1;
}

function beginServe(side) {
  serve(side);
  const serverIndex = characterCheck ? 0 : side * 2 + (serveTurns[side]++ % 2);
  const server = players[serverIndex];
  Object.assign(server, { x: side ? W - 28 : 28, y: FLOOR, vx: 0, vy: 0,
    action: null, actionFrames: 0, cooldownFrames: 0, recoveryFrames: 0, blockFrames: 0,
    knockback: 0, landTime: 0, attackReady: false, setReady: false, receiveReady: false,
    attackChargeFrames: 0, airborneTouch: false, airborneActionTaken: false, airborneShotHeld: false });
  serveState = { phase: 'holding', serverIndex, age: 0,
    shotHeld: false, setHeld: false, comStyle: Math.random() < .5 ? 'jump' : 'standing',
    comAim: server.specials > 0 && Math.random() < .5 ? 'power'
      : ['normal', 'fast', 'high', 'slow'][Math.floor(Math.random() * 4)] };
  holdServeBall(server);
  updateCamera(0, true);
  playSfx('serve');
  status();
}

function holdServeBall(p) {
  ball.x = p.x + (p.side ? -26 : 26) * SERVE_SPRITE_SIZE / 104;
  ball.y = p.y - 64 * SERVE_SPRITE_SIZE / 104;
  ball.vx = ball.vy = 0;
  ball.trail = [];
}

function serveVelocity(b, side, variant) {
  const direction = side ? -1 : 1;
  const target = NET + direction * (variant === 'power' ? 470 : variant === 'fast' ? 395 : variant === 'high' ? 440 : 270);
  const crossY = variant === 'high' ? 145 : variant === 'slow' ? 245
    : variant === 'power' ? NETTOP - b.r - 12 : NETTOP - b.r - 26;
  const fraction = (NET - b.x) / (target - b.x);
  const endY = FLOOR - b.r;
  const duration = Math.sqrt(Math.max(.16, 2 * ((1 - fraction) * b.y + fraction * endY - crossY)
    / (GRAVITY * fraction * (1 - fraction))));
  return { vx: (target - b.x) / duration,
    vy: (endY - b.y - .5 * GRAVITY * duration * duration) / duration };
}

// Practical incoming ball trajectories from the opponent court (Blue side) for character check receive mode.
const CHECK_RECEIVE_BALLS = [
  {
    name: '通常サーブ',
    spawn: () => {
      const b = { x: W - 28, y: FLOOR - 64 * SERVE_SPRITE_SIZE / 104, r: 12 };
      const vel = serveVelocity(b, 1, 'normal');
      return { x: b.x, y: b.y, vx: vel.vx, vy: vel.vy, serveVariant: 'normal' };
    }
  },
  {
    name: '高速サーブ',
    spawn: () => {
      const b = { x: W - 28, y: FLOOR - 64 * SERVE_SPRITE_SIZE / 104, r: 12 };
      const vel = serveVelocity(b, 1, 'fast');
      return { x: b.x, y: b.y, vx: vel.vx, vy: vel.vy, serveVariant: 'fast' };
    }
  },
  {
    name: '高弾道サーブ',
    spawn: () => {
      const b = { x: W - 28, y: FLOOR - 64 * SERVE_SPRITE_SIZE / 104, r: 12 };
      const vel = serveVelocity(b, 1, 'high');
      return { x: b.x, y: b.y, vx: vel.vx, vy: vel.vy, serveVariant: 'high' };
    }
  },
  {
    name: 'チェンジアップサーブ',
    spawn: () => {
      const b = { x: W - 28, y: FLOOR - 64 * SERVE_SPRITE_SIZE / 104, r: 12 };
      const vel = serveVelocity(b, 1, 'slow');
      return { x: b.x, y: b.y, vx: vel.vx, vy: vel.vy, serveVariant: 'slow' };
    }
  },
  {
    name: 'パワーサーブ',
    spawn: () => {
      const b = { x: W - 110, y: 340, r: 12 };
      const vel = serveVelocity(b, 1, 'power');
      return {
        x: b.x, y: b.y, vx: vel.vx * 1.05, vy: vel.vy * 0.95,
        serveVariant: 'power', specialShot: 'powerServe'
      };
    }
  },
  {
    name: '強打スパイク',
    spawn: () => ({
      x: NET + 110,
      y: 290,
      vx: -480,
      vy: 110,
      serveVariant: null
    })
  },
  {
    name: '奥狙いスパイク',
    spawn: () => ({
      x: NET + 130,
      y: 270,
      vx: -540,
      vy: -20,
      serveVariant: null
    })
  },
  {
    name: '手前フェイント',
    spawn: () => ({
      x: NET + 70,
      y: 260,
      vx: -230,
      vy: -210,
      feintDrive: 1,
      serveVariant: null
    })
  },
  {
    name: '山なりループ球',
    spawn: () => ({
      x: NET + 220,
      y: 350,
      vx: -330,
      vy: -380,
      serveVariant: null
    })
  }
];

function initCurrentCheckMode() {
  checkBallResetTimer = 0;
  if (!characterCheck || !players[0]) return;
  const p = players[0];
  p.vx = 0;
  p.vy = 0;
  p.action = null;
  p.actionFrames = 0;
  p.cooldownFrames = 0;
  p.recoveryFrames = 0;
  p.blockFrames = 0;
  p.knockback = 0;
  p.landTime = 0;
  p.airborneTouch = false;
  p.airborneActionTaken = false;
  p.airborneShotHeld = false;
  p.attackReady = false;
  p.setReady = false;
  p.receiveReady = false;

  if (checkMode === 'serve') {
    setupCheckServe();
  } else if (checkMode === 'receive') {
    p.x = 320;
    p.y = FLOOR;
    launchCheckBallReceive();
  } else {
    serveState = null;
    p.x = NET - 100;
    p.y = FLOOR;
    launchCheckBallFree();
  }
  updateCamera(0, true);
  status();
}

function setupCheckServe() {
  serveState = null;
  const p = players[0];
  if (!p) return;
  p.x = 28;
  p.y = FLOOR;
  p.vx = 0;
  p.vy = 0;
  p.action = null;
  p.specials = Math.max(3, p.specials);
  serveTurns[0] = 0;
  checkIncomingLabel = '';
  beginServe(0);
}

function launchCheckBallFree() {
  serve(0);
  ball.x = NET + (checkBallSide ? 42 : -42);
  ball.y = FLOOR - ball.r;
  ball.vx = 0;
  ball.vy = -620;
  checkBallSide = 1 - checkBallSide;
  serveTimer = 0;
  checkIncomingLabel = '';
  status();
}

function launchCheckBallReceive() {
  serve(1);
  const pattern = CHECK_RECEIVE_BALLS[Math.floor(Math.random() * CHECK_RECEIVE_BALLS.length)];
  const spawned = pattern.spawn();
  ball.x = spawned.x;
  ball.y = spawned.y;
  ball.vx = spawned.vx;
  ball.vy = spawned.vy;
  ball.serveVariant = spawned.serveVariant ?? null;
  ball.specialShot = spawned.specialShot ?? null;
  ball.feintDrive = spawned.feintDrive ?? 0;
  ball.trail = [];
  ball.lastSide = 1;
  ball.lastHitter = null;
  ball.touchSide = null;
  ball.teamTouches = 0;
  serveTimer = 0;
  serveState = null;
  checkIncomingLabel = pattern.name;
  if (ball.specialShot === 'powerServe') {
    playSfx('empowered');
  } else {
    playSfx('serve');
  }
  status();
}

function handleCheckBallFloor() {
  if (checkBallResetTimer > 0) return;
  ball.y = FLOOR - ball.r;
  ball.vx = 0;
  ball.vy = 0;
  playSfx('sand');
  if (checkMode === 'free') {
    launchCheckBallFree();
  } else {
    checkBallResetTimer = 0.45;
  }
}

function strikeServe(p, airborne, input = {}) {
  serveState = null;
  serveTimer = 0;
  hit(p, false, 'attack');
  if (airborne) {
    const direction = p.side ? -1 : 1;
    const variant = input.down && p.specials > 0 ? 'power' : input.jump ? 'high'
      : input.move * direction > .2 ? 'fast' : input.move * direction < -.2 ? 'slow' : 'normal';
    ball.serveVariant = variant;
    if (variant !== 'normal') Object.assign(ball, serveVelocity(ball, p.side, variant));
    if (variant === 'power') {
      p.specials--;
      ball.specialShot = 'powerServe';
      p.actionPop.action = 'powerServe';
      playSfx('empowered');
      triggerSpecialActivation(p, 'powerServe');
    }
    status();
    return;
  }
  const target = p.side ? NET - 270 : NET + 270;
  const endY = FLOOR - ball.r;
  let duration = 1.7;
  const fraction = (NET - ball.x) / (target - ball.x);
  if (fraction > 0 && fraction < 1) {
    const needed = 2 * ((1 - fraction) * ball.y + fraction * endY - (NETTOP - ball.r - 135))
      / (GRAVITY * fraction * (1 - fraction));
    duration = Math.max(duration, Math.sqrt(Math.max(0, needed)));
  }
  ball.vx = (target - ball.x) / duration;
  ball.vy = (endY - ball.y - .5 * GRAVITY * duration * duration) / duration;
  status();
}

function updateServe(dt, pads) {
  const state = serveState;
  const p = players[state.serverIndex];
  state.age += dt;
  const inRange = inBallContactRange(p);
  const direction = playerForward(p);
  const input = p.human ? readHumanInput(p, pads) : {
    move: state.phase === 'tossed' && state.comStyle === 'jump' ? direction : 0,
    down: false,
    jump: state.phase === 'tossed' && state.age > .12,
    shot: state.phase === 'holding' ? state.age > .65 && state.comStyle === 'jump'
      : state.age > .22 && p.y < FLOOR && inRange,
    set: state.phase === 'holding' && state.age > .65 && state.comStyle === 'standing'
  };
  const shotPressed = input.shot && !state.shotHeld;
  const setPressed = input.set && !state.setHeld;
  state.shotHeld = !!input.shot;
  state.setHeld = !!input.set;
  for (const q of players) if (q !== p) updateActivePlayer(q, dt, pads);
  if (state.phase === 'holding') {
    tickPlayerAnimation(p, dt);
    holdServeBall(p);
    if (setPressed) strikeServe(p, false);
    else if (shotPressed) {
      state.phase = 'tossed';
      state.age = 0;
      ball.y = p.y - 92 * SERVE_SPRITE_SIZE / 104;
      ball.vx = direction * SERVE_TOSS_VX;
      ball.vy = SERVE_TOSS_VY;
      playSfx('set');
      status();
    }
    return;
  }
  updateActivePlayer(p, dt, pads, input);
  const canStrikeJumpServe = input.shot && state.age >= 0.1 && p.y < FLOOR && p.recoveryFrames <= 0 && p.cooldownFrames <= 0 && inRange;
  if (canStrikeJumpServe) {
    const aim = p.human ? input : { down: state.comAim === 'power', jump: state.comAim === 'high',
      move: state.comAim === 'fast' ? direction : state.comAim === 'slow' ? -direction : 0 };
    strikeServe(p, true, aim);
    return;
  }
  updateBallSpin(dt);
  recordBallTrail();
  ball.vy += GRAVITY * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.y + ball.r >= FLOOR) {
    const side = p.side;
    serveTurns[side]--;
    beginServe(side);
    serveState.shotHeld = !!input.shot;
    serveState.setHeld = !!input.set;
  }
}

function playSfx(name) {
  audioEvents.push({ id: ++audioSequence, name, time });
  if (audioEvents.length > 24) audioEvents.shift();
  window.rallyAudio?.play(name);
}

document.querySelector('#start').onclick = () => window.matchLobby?.show();

document.querySelector('#sound').onclick = e => {
  sound = !sound;
  e.target.textContent = sound ? 'SOUND ON' : 'SOUND OFF';
  e.target.setAttribute('aria-pressed', String(sound));
  window.rallyAudio?.setEnabled(sound);
  if (sound) window.rallyAudio?.play('confirm');
};

window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
  if (['BUTTON', 'SUMMARY'].includes(e.target?.tagName) && e.code === 'Space') return;
  const is2PKeyboardActive = !window.matchLobby?.online && players[1]?.human;
  if (e.code === 'KeyF' && (!is2PKeyboardActive || e.shiftKey) && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    toggleFullscreen();
    return;
  }
  if (e.code === 'KeyP' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    togglePopout();
    return;
  }
  if (e.code === 'Escape' && isFullscreenArena()) {
    exitFullscreenArena();
  }
  if (Object.values(bindings).flat(2).includes(e.code) || e.code === 'Space') {
    e.preventDefault();
  }
  keys.add(e.code);
  if (e.repeat) return;
  if (window.matchLobby?.online && ['Space', 'KeyR', 'Escape'].includes(e.code)) {
    window.matchLobby.command(e.code);
    return;
  }
  if (characterCheck && !e.repeat) {
    if (e.code === 'Digit1') { setCheckMode('free'); return; }
    if (e.code === 'Digit2') { setCheckMode('serve'); return; }
    if (e.code === 'Digit3') { setCheckMode('receive'); return; }
  }
  if (e.code === 'Space' && running) {
    paused = !paused;
    status();
  }
  if (e.code === 'KeyR') {
    if (characterCheck) startCharacterCheck(checkMode);
    else { reset(); window.matchLobby?.show(); }
  }
});

document.addEventListener?.('click', e => {
  const btn = e.target?.closest?.('[data-check-mode]');
  if (!btn) return;
  const targetMode = btn.getAttribute('data-check-mode');
  if (targetMode) setCheckMode(targetMode);
});

window.addEventListener('keyup', e => keys.delete(e.code));

window.addEventListener('blur', () => {
  if (isPopoutActive()) return;
  keys.clear();
  if (running && !window.matchLobby?.online && !isAllCom()) {
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

const COM_ATTACK_TAN = Math.tan(-Math.PI * 10 / 180);
const COM_SET_TAN = Math.tan(-Math.PI * 50 / 180);

// Screen Y grows downward. Aim above the net by the ball radius plus a margin.
function comShotType(bOrX, maybeY, maybeR) {
  const x = maybeY !== undefined ? bOrX : bOrX.x;
  const y = maybeY !== undefined ? maybeY : bOrX.y;
  const r = maybeR !== undefined ? maybeR : bOrX.r;
  const dx = Math.abs(NET - x);
  const dy = NETTOP - r - 8 - y;
  if (dy >= dx * COM_ATTACK_TAN) return 'attack';
  if (dy >= dx * COM_SET_TAN) return 'receive';
  return 'set';
}

// Attack: cross the near edge of the net with only a small clearance.
function attackVelocity(b, side, speedLimit = ATTACK_SPEED, deep = false) {
  const direction = side ? -1 : 1;
  const crossX = NET - direction * (b.r + 9);
  const distance = (crossX - b.x) * direction;
  if (distance <= 1) {
    if (!deep || b.y + b.r >= NETTOP - 5) return null;
    // Contacts above/just beyond the tape still send the forward attack deep.
    const landingX = side ? 90 : W - 90;
    const duration = Math.max(.35, Math.abs(landingX - b.x) / speedLimit);
    return {
      vx: (landingX - b.x) / duration,
      vy: (FLOOR - b.r - b.y - .5 * GRAVITY * duration * duration) / duration,
      landingX
    };
  }
  const crossY = NETTOP - b.r - 5 - (deep ? 32 : 0);
  const deepAngle = Math.atan2(NETTOP - b.y, Math.abs(NET - b.x)) - Math.PI * 8 / 180;

  function trajectory(speed) {
    const t = distance / speed;
    const farTime = (distance + 2 * (b.r + 9)) / speed;
    let vy = Math.min(
      (crossY - b.y - 0.5 * GRAVITY * t * t) / t,
      (crossY - b.y - 0.5 * GRAVITY * farTime * farTime) / farTime
    );
    if (deep) vy = Math.min(vy, speed * Math.tan(deepAngle));
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
  p.knockback = back * KNOCKBACK_RULES.double;
  emitKnockbackImpact(p, 1.0);
  ball.vy = -300;
  const fallTime = (-ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * GRAVITY * Math.max(1, FLOOR - ball.r - ball.y))) / GRAVITY;
  const deadTarget = clampCourtX(ball.x + back * 50, p.side, 40, 50);
  ball.vx = (deadTarget - ball.x) / fallTime;
}

function applyEmpoweredImpact(p) {
  const air = p.y < FLOOR;
  const back = p.side ? 1 : -1;
  const knockbackSpeed = air ? SPECIAL_RULES.knockback : SPECIAL_RULES.knockbackGround;
  p.knockback = back * knockbackSpeed;
  emitKnockbackImpact(p, air ? 1.35 : 0.85);
  p.recoveryFrames = Math.max(p.recoveryFrames, air ? SPECIAL_RULES.impactRecovery : Math.round(SPECIAL_RULES.impactRecovery * 0.75));
  p.vx = 0;
  ball.deadened = true;
  ball.vy = air ? -SPECIAL_RULES.impactRiseSpeed : -520;
  const targetOffset = air ? 260 : 130;
  const target = clampCourtX(p.x + back * targetOffset, p.side);
  const fallTime = (-ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * GRAVITY * Math.max(1, FLOOR - ball.r - ball.y))) / GRAVITY;
  ball.vx = (target - ball.x) / fallTime;
}

function applyPowerServeImpact(p) {
  p.knockback = (p.side ? 1 : -1) * KNOCKBACK_RULES.powerServe;
  emitKnockbackImpact(p, 1.0);
  p.recoveryFrames = Math.max(p.recoveryFrames, SPECIAL_RULES.impactRecovery);
  p.vx = 0;
  ball.deadened = true;
  ball.vx = 0;
  ball.vy = -Math.min(520, Math.sqrt(2 * GRAVITY * Math.max(1, ball.y - 40)));
}

function startMozuDrop(p) {
  const target = NET + (p.side ? -150 : 150);
  const riseHeight = Math.max(1, ball.y - SPECIAL_RULES.mozuPeakY);
  const riseSpeed = Math.sqrt(2 * GRAVITY * riseHeight);
  ball.mozuPhase = 'rise';
  ball.mozuStartX = ball.x;
  ball.mozuStartY = ball.y;
  ball.mozuTargetX = target;
  ball.mozuRiseSpeed = riseSpeed;
  ball.mozuRiseDuration = riseSpeed / GRAVITY;
  ball.mozuRiseAge = 0;
  ball.vx = (target - ball.x) / ball.mozuRiseDuration;
  ball.vy = -riseSpeed;
}

function showAction(p, action) {
  const continuingDive =
    action === 'flying' && p.action === 'flying' && (p.diveAge ?? FLYING_TOTAL_DURATION) < FLYING_TOTAL_DURATION;
  p.action = action;
  p.actionPop = { action, age: 0, x: p.x, y: p.y - 158 };
  p.actionFrames =
    action === 'flying'
      ? Math.max(FRAME_RULES.actionPose, FLYING_TOTAL_FRAMES - (continuingDive ? p.diveAge * GAME_FPS : 0))
      : FRAME_RULES.actionPose;
  p.attackAge = 0;
  p.attackReady = false;
  p.attackChargeFrames = 0;
  p.setReady = false;
  p.receiveReady = false;
  p.setAge = 0;
  p.receiveAge = 0;
  p.blockHit = false;
  if (action === 'flying' && !continuingDive) {
    p.diveAge = 0;
  }
}

function touchesBefore(p) {
  return ball.touchSide === p.side ? ball.teamTouches : 0;
}

function recordTouch(p) {
  ball.teamTouches = touchesBefore(p) + 1;
  ball.touchSide = p.side;
  ball.returnAwarded = false;
}

function addGauge(p, points) {
  p.gauge = (p.gauge ?? 0) + points;
  if (p.gauge >= 10) {
    p.specials = Math.min(9, (p.specials ?? 0) + 1);
    p.gauge = 0;
  }
}

function awardBallReturn() {
  if (characterCheck) return;
  const hitter = ball.lastHitter;
  if (!hitter || ball.returnAwarded || pointEnd || winner || ball.touchSide !== hitter.side) return;
  const across = hitter.side ? ball.x < NET : ball.x > NET;
  if (!across || ball.y + ball.r > NETTOP) return;
  const touches = ball.teamTouches;
  const teamBonus = touches <= 3 ? touches : touches === 4 ? 1 : 0;
  for (const p of players) {
    if (p.side === hitter.side) addGauge(p, teamBonus + (p === hitter ? 2 : 0));
  }
  ball.returnAwarded = true;
  ball.teamTouches = 0;
  ball.touchSide = null;
}

function comAction(p) {
  const touches = touchesBefore(p);
  return touches === 0 ? 'receive' : touches === 1 ? 'set' : comShotType(ball);
}

function hit(p, set, forcedType, forward = false, back = false, down = false, up = false) {
  if (p.y < FLOOR) { p.airborneTouch = true; p.airborneActionTaken = true; p.airborneShotHeld = false; p.airborneSetHeld = false; }
  const assistReceive = !p.human && touchesBefore(p) === 0;
  let type =
    forcedType ||
    (p.human
      ? set
        ? (p.y < FLOOR && back && !down ? 'feint' : 'set')
        : p.y < FLOOR
          ? (back && !down ? 'loop' : 'attack')
          : 'receive'
      : comAction(p));

  const incomingDouble = ball.doubleAttack;
  const incomingPowerServe = ball.specialShot === 'powerServe' && ball.lastSide !== p.side;
  const incomingEmpowered = ball.specialShot === 'empowered' && ball.lastSide !== p.side;
  let special = null;
  if (down && p.specials > 0) {
    if (p.y < FLOOR && !incomingEmpowered && !incomingDouble && !incomingPowerServe) {
      special = set ? 'mozu' : 'empowered';
    } else if (p.y >= FLOOR && !set && (!forcedType || forcedType === 'powerReceive')) {
      special = 'powerReceive';
    }
  }
  if (special) type = special === 'mozu' ? 'set' : special === 'powerReceive' ? 'powerReceive' : 'attack';
  const isPowerReceive = special === 'powerReceive';
  const quick = !special && !incomingDouble && !incomingEmpowered && !incomingPowerServe && type === 'attack' && (ball.lastShot === 'set' || ball.lastShot === 'powerReceive') && ball.lastSide === p.side && ball.vy < 0;
  const doubleAttack =
    !special && !incomingDouble && !incomingEmpowered && !incomingPowerServe &&
    type === 'attack' &&
    ball.lastWasReturn &&
    ball.lastHitter &&
    ball.lastHitter !== p &&
    ball.lastHitter.side === p.side;

  set = type === 'set';
  const touchCount = touchesBefore(p) + 1;
  const isReceive = type === 'receive' || type === 'flying' || isPowerReceive;
  // 3手目以降のレシーブは自陣にとどまらず前（相手コート）へ飛ばす
  const localReceive = isReceive && (isPowerReceive || assistReceive || (p.human && p.y >= FLOOR && !forward && touchCount < 3));
  // トスも4手目以降は自陣ターゲットではなく前（相手コート側）へ飛ばす
  const isFourthToss = set && !special && touchCount >= 4;
  const ownTarget = isPowerReceive || (!special && !isFourthToss && (set || localReceive));

  const target =
    isPowerReceive
      ? p.side ? NET + 75 : NET - 75
      : type === 'feint'
        ? p.side
          ? NET - 150
          : NET + 150
        : type === 'loop'
          ? p.side
            ? NET - 245 + (Math.random() - 0.5) * 40
            : NET + 245 + (Math.random() - 0.5) * 40
          : ownTarget
            ? p.side
              ? NET + 95
              : NET - 95
            : p.side
              ? 180 + Math.random() * 230
              : NET + 190 + Math.random() * 230;

  const air = type === 'attack';
  let duration = type === 'feint' ? 0.75 : set ? 1.05 : air ? 0.75 : type === 'flying' ? 1.6 : 1.25;
  const endY = FLOOR - 14;
  let tossSpeed = isPowerReceive ? TOSS_SPEEDS.powerReceive : down ? TOSS_SPEEDS.high : TOSS_SPEEDS.normal;

  if (set || isPowerReceive) {
    if (isFourthToss && tossSpeed < TOSS_SPEEDS.high) {
      tossSpeed = Math.max(tossSpeed, 490);
    }
    duration = (tossSpeed + Math.sqrt(tossSpeed * tossSpeed + 2 * GRAVITY * Math.max(0, endY - ball.y))) / GRAVITY;
  }

  // Lengthen a return when needed so gravity carries it over the top of the net.
  const fraction = (NET - ball.x) / (target - ball.x);
  if (!ownTarget && fraction > 0 && fraction < 1) {
    const clearance = NETTOP - ball.r - (type === 'feint' ? 20 : 10);
    const needed = (2 * ((1 - fraction) * ball.y + fraction * endY - clearance)) / (GRAVITY * fraction * (1 - fraction));
    duration = Math.max(duration, Math.sqrt(Math.max(0, needed)));
  }

  if (type === 'receive') duration *= 1.12;
  ball.vx = (target - ball.x) / duration;
  ball.vy = (endY - ball.y - 0.5 * GRAVITY * duration * duration) / duration;
  if (set || isPowerReceive) { ball.vy = -tossSpeed; ball.tossId = (ball.tossId || 0) + 1; }

  const fwd = playerForward(p);

  // レシーブ: 1手目から前方向のベクトルを持つ（後ろ押しながらレシーブでも前方向ベクトルを消せない）
  // タッチ回数3以上ならより強く前（相手コート）へ飛ぶ
  if (isReceive && !isPowerReceive) {
    const minReceiveFwdVx = touchCount >= 3 ? 190 : 90;
    if (ball.vx * fwd < minReceiveFwdVx) {
      ball.vx = fwd * minReceiveFwdVx;
    }
  }

  // トス: 3手目までは上に上げられるが、4手目以降は前に行くベクトルがかかる
  if (isFourthToss) {
    const minTossFwdVx = down ? 170 : 200;
    if (ball.vx * fwd < minTossFwdVx) {
      ball.vx = fwd * minTossFwdVx;
    }
  }

  if (type === 'loop') {
    const loopDuration = 1.16;
    const frac = Math.max(0.15, Math.min(0.85, fraction));
    const t1 = loopDuration * frac;
    const t2 = loopDuration * (1 - frac);
    const a0 = 420;
    const k = 1600;
    const driveDrop = 0.5 * a0 * t2 * t2 + (1 / 6) * k * t2 * t2 * t2;
    let vy0 = (endY - ball.y - 0.5 * GRAVITY * loopDuration * loopDuration - driveDrop) / loopDuration;
    const clearance = NETTOP - ball.r - 160;
    const netYPred = ball.y + vy0 * t1 + 0.5 * GRAVITY * t1 * t1;
    if (netYPred > clearance) {
      vy0 = (clearance - ball.y - 0.5 * GRAVITY * t1 * t1) / t1;
    }
    ball.vx = (target - ball.x) / loopDuration;
    ball.vy = vy0;
    ball.loopDrive = 0;
  }

  if (air) {
    const charge = p.y < FLOOR ? Math.max(0, Math.min(1, (p.attackChargeFrames ?? 0) / FRAME_RULES.attackCharge)) : 0;
    const baseSpeed = quick ? QUICK_SPEED : special === 'empowered' ? ATTACK_SPEED * SPECIAL_RULES.empoweredSpeed : ATTACK_SPEED;
    const maxChargeSpeed = quick ? QUICK_MAX_SPEED : special === 'empowered' ? 1350 : baseSpeed * (1 + ATTACK_CHARGE_BONUS);
    const speedLimit = baseSpeed + charge * (maxChargeSpeed - baseSpeed);
    const attack = attackVelocity(ball, p.side, speedLimit, forward && p.y < FLOOR && !special);
    if (attack) {
      ball.vx = attack.vx;
      ball.vy = attack.vy;
    }
  }

  if (!p.human) p.aimError = (Math.random() - 0.5) * 180;
  const baseRecovery =
    isPowerReceive
      ? ACTION_RECOVERY_FRAMES.powerReceive
      : type === 'flying'
        ? Math.max(FRAME_RULES.flyingMinRecovery, Math.ceil(FLYING_TOTAL_FRAMES - (p.action === 'flying' ? (p.diveAge ?? 0) * GAME_FPS : 0)))
        : ACTION_RECOVERY_FRAMES[type];
  p.recoveryFrames = isPowerReceive
    ? ACTION_RECOVERY_FRAMES.powerReceive
    : baseRecovery * (incomingDouble ? FRAME_RULES.doubleImpactMultiplier : 1);
  if (type !== 'flying') p.vx = 0;
  ball.deadened = false;
  if (isPowerReceive) {
    p.knockbackSpeed = 0;
  } else {
    if (incomingDouble) applyDoubleImpact(p);
    if (incomingEmpowered) applyEmpoweredImpact(p);
    if (incomingPowerServe) applyPowerServeImpact(p);
  }
  ball.specialShot = special;
  ball.serveVariant = null;
  ball.mozuPhase = null;
  ball.feintDrive = 0;
  if (special) {
    p.specials--;
    if (special === 'mozu') startMozuDrop(p);
    triggerSpecialActivation(p, special);
  }

  showAction(p, doubleAttack ? 'double' : quick ? 'quick' : type);
  if (special) p.actionPop.action = special;
  if (type === 'flying') p.diveHit = true;
  ball.lastShot = special === 'mozu' ? 'attack' : type;
  ball.doubleAttack = !!doubleAttack;
  ball.quickAttack = !!quick;
  ball.lastHitter = p;
  ball.lastWasReturn = !ownTarget && !incomingDouble && !incomingEmpowered && !incomingPowerServe;
  recordTouch(p);
  ball.lastSide = p.side;
  awardBallReturn();

  p.cooldownFrames = p.human ? FRAME_RULES.humanCooldown
    : FRAME_RULES.comCooldownMin + Math.floor(Math.random() * (FRAME_RULES.comCooldownMax - FRAME_RULES.comCooldownMin + 1));
  p.flash = 0.18;
  shake = air ? 4 : 1;
  playSfx(special ?? (doubleAttack ? 'double' : quick ? 'quick' : type));

  const particleColor = isPowerReceive ? '#4dfa7c' : null;
  spawnHitParticles(ball.x, ball.y, particleColor, 9);
}

function tryBlock(p) {
  if (
    p.blockFrames <= 0 ||
    p.y >= FLOOR ||
    p.recoveryFrames > 0 ||
    ball.lastSide === p.side ||
    !(ball.lastShot === 'attack' || ball.doubleAttack)
  ) {
    return false;
  }
  if (ball.y + ball.r > NETTOP - 5 || !inBlockContactRange(p)) {
    return false;
  }
  p.airborneTouch = true;
  p.airborneActionTaken = true;
  p.airborneShotHeld = false;

  const incomingDouble = ball.doubleAttack;
  const incomingPowerServe = ball.specialShot === 'powerServe';
  const incomingEmpowered = ball.specialShot === 'empowered';
  if (ball.lastHitter && !incomingEmpowered && !incomingPowerServe) {
    const attackingSide = ball.lastHitter.side;
    for (const teammate of players) {
      if (teammate.side === attackingSide) teammate.blockPressure = Math.min(4, (teammate.blockPressure ?? 0) + 1);
    }
  }
  const direction = playerForward(p);
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
  ball.quickAttack = false;
  ball.specialShot = null;
  ball.serveVariant = null;
  ball.mozuPhase = null;
  ball.feintDrive = 0;
  ball.lastHitter = p;
  ball.lastSide = p.side;
  ball.lastShot = 'block';
  ball.lastWasReturn = false;
  awardBallReturn();
  showAction(p, 'block');
  p.blockHit = true;

  p.blockFrames = 0;
  p.recoveryFrames = ACTION_RECOVERY_FRAMES.block * (incomingDouble ? FRAME_RULES.doubleImpactMultiplier : 1);
  p.cooldownFrames = FRAME_RULES.blockCooldown;
  p.vx = 0;
  p.flash = 0.25;
  ball.deadened = false;
  if (incomingDouble) applyDoubleImpact(p);
  if (incomingEmpowered) applyEmpoweredImpact(p);
  if (incomingPowerServe) applyPowerServeImpact(p);
  shake = 5;
  playSfx('block');
  return true;
}

// --- Input & COM AI ---
function supportPosition(p, mate) {
  const forward = p.side ? -1 : 1;
  const mateDistance = (NET - mate.x) * forward;
  const nominal = NET - forward * (mateDistance < 180 ? 270 : 100);
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

function getComSpikeTargetHeight(p) {
  const tossKey = ball?.tossId ?? 0;
  if (p.spikeTossKey !== tossKey) {
    p.spikeTossKey = tossKey;
    const roll = Math.random();
    if (roll < 0.65) {
      // 高打点（約65%の確率）: 地上高 95〜130px（ネット頂上付近の上空で力強く叩く）
      p.spikeTargetHeight = 95 + Math.random() * 35;
    } else if (roll < 0.85) {
      // 中打点（約20%の確率）: 地上高 65〜90px
      p.spikeTargetHeight = 65 + Math.random() * 25;
    } else {
      // 低空 / クイック（約15%の確率）: 地上高 38〜60px
      p.spikeTargetHeight = 38 + Math.random() * 22;
    }
  }
  return p.spikeTargetHeight || 105;
}

function comJumpPlan(p) {
  if (p.y < FLOOR || p.recoveryFrames > 0 || p.cooldownFrames > 0) return null;
  const isTeammateToss = (ball.lastShot === 'set' || ball.lastShot === 'powerReceive') && ball.lastSide === p.side;
  const targetHeight = isTeammateToss ? getComSpikeTargetHeight(p) : 55;

  let best = null;
  const forward = p.side ? -1 : 1;
  const backward = -forward;
  const directions = [0, forward, backward];
  const ballR = ball.r;
  const sideSign = p.side ? 1 : -1;

  for (let d = 0; d < 3; d++) {
    const direction = directions[d];
    for (let t = 0.08; t < 0.76; t += 1 / 120) {
      const bx = ball.x + ball.vx * t;
      const by = ball.y + ball.vy * t + 0.5 * GRAVITY * t * t;
      const py = FLOOR - JUMP_SPEED * t + 0.5 * PLAYER_GRAVITY * t * t;
      const px = clampCourtX(p.x + direction * COM_SPEED * t, p.side);
      if (py >= FLOOR - 35 || by + ballR >= FLOOR || (bx - NET) * sideSign < 0) continue;
      if (comShotType(bx, by, ballR) !== 'attack') continue;
      const dx = bx - px;
      const dy = by - (py - 39);
      const distSq = dx * dx + dy * dy;
      if (distSq < 4356) { // 66 * 66
        const distance = Math.sqrt(distSq);
        let score = 200 - distance;
        if (isTeammateToss) {
          const height = FLOOR - py;
          const heightDiff = Math.abs(height - targetHeight);
          score += 150 - heightDiff * 2.2;
          if (py <= FLOOR - 90) score += 40;
        }
        if (!best || score > best.score) {
          best = { direction, time: t, distance, score };
        }
      }
    }
  }
  return best ? { direction: best.direction, time: best.time, distance: best.distance } : null;
}

function readHumanInput(p, pads) {
  if (window.matchLobby?.online) return window.matchLobby.input(p.human);
  return readController(p.human, pads);
}

function readController(controller, pads) {
  const b = bindings[controller];
  let move = (keys.has(b[1]) ? 1 : 0) - (keys.has(b[0]) ? 1 : 0);
  let jump = keys.has(b[2]);
  let shot = false;
  const bShot = b[3];
  for (let i = 0; i < bShot.length; i++) {
    if (keys.has(bShot[i])) { shot = true; break; }
  }
  let set = false;
  const bSet = b[4];
  for (let i = 0; i < bSet.length; i++) {
    if (keys.has(bSet[i])) { set = true; break; }
  }
  let down = keys.has(b[5]);

  const touchInput = window.touchControls?.read?.(controller);
  if (touchInput) {
    if (Math.abs(touchInput.move) > 0.05) move = touchInput.move;
    jump ||= touchInput.jump;
    down ||= touchInput.down;
    shot ||= touchInput.shot;
    set ||= touchInput.set;
  }

  const gpInput = window.gamepadConfig?.read(controller, pads);
  if (gpInput) {
    if (Math.abs(gpInput.move) > 0.05) move = gpInput.move;
    jump ||= gpInput.jump;
    down ||= gpInput.down;
    shot ||= gpInput.shot;
    set ||= gpInput.set;
  } else {
    const pad = pads[controller - 1];
    if (pad) {
      move = Math.abs(pad.axes?.[0] ?? 0) > 0.2 ? pad.axes[0] : move;
      const left = !!pad.buttons?.[14]?.pressed;
      const right = !!pad.buttons?.[15]?.pressed;
      if (left || right) move = Number(right) - Number(left);
      const up = (pad.axes?.[1] ?? 0) < -0.5 || !!pad.buttons?.[12]?.pressed;
      jump ||= up;
      down ||= (pad.axes?.[1] ?? 0) > 0.5 || !!pad.buttons?.[13]?.pressed;
      shot ||= !!pad.buttons?.[2]?.pressed;
      set ||= !!pad.buttons?.[1]?.pressed;
    }
  }

  return { move, jump, up: jump, shot, set, down };
}

function comBlockInput(p) {
  if (serveTimer > 0 || p.recoveryFrames > 0 || p.cooldownFrames > 0 || ball.lastSide === p.side) return null;
  const opponentBall = p.side ? ball.x < NET : ball.x > NET;
  if (!opponentBall && p.blockFrames <= 0) return null;
  const incomingAttack = ball.lastShot === 'attack' || ball.doubleAttack;
  const opp0 = players[(1 - p.side) * 2], opp1 = players[(1 - p.side) * 2 + 1];
  const preparingAttack = (ball.lastShot === 'set' && ball.vy > 0)
    || (opp0?.attackReady && opp0.y < FLOOR && Math.abs(opp0.x - ball.x) < 150)
    || (opp1?.attackReady && opp1.y < FLOOR && Math.abs(opp1.x - ball.x) < 150);
  if ((!incomingAttack && !preparingAttack) || Math.abs(ball.x - NET) > 360 || ball.y > NETTOP + 40) return null;
  // One COM guards the net while the teammate remains available for a receive.
  const t0 = players[p.side * 2], t1 = players[p.side * 2 + 1];
  const mate = p === t0 ? t1 : t0;
  if (mate && !mate.human && mate.recoveryFrames <= 0 && mate.cooldownFrames <= 0 && Math.abs(mate.x - NET) < Math.abs(p.x - NET)) {
    return null;
  }
  const target = NET + (p.side ? 35 : -35);
  const move = Math.abs(target - p.x) > 8 ? Math.sign(target - p.x) : 0;
  let jump = false;
  if (p.y >= FLOOR) {
    // Predict contact during the active block window before committing to the jump.
    for (let t = 0.06; t <= 0.5; t += 1 / GAME_FPS) {
      const bx = ball.x + ball.vx * t;
      const by = ball.y + ball.vy * t + 0.5 * GRAVITY * t * t;
      const py = FLOOR - JUMP_SPEED * t + 0.5 * PLAYER_GRAVITY * t * t;
      const px = clampCourtX(p.x + move * COM_SPEED * t, p.side);
      if (by + ball.r <= NETTOP - 5 && py < FLOOR - 35 && Math.hypot(bx - px, by - (py - 75)) < 72) {
        jump = true;
        break;
      }
    }
    if (preparingAttack && Math.abs(p.x - NET) < 95 && Math.abs(ball.x - NET) < 150
      && ball.y > NETTOP - 150 && ball.y < NETTOP - ball.r) jump = true;
  }
  return { move, jump, shot: false, set: p.y < FLOOR && opponentBall, down: false };
}

function decideComInput(p) {
  const blockInput = comBlockInput(p);
  if (blockInput) return blockInput;
  let jump = false;
  let shot = false;
  let comIntent;

  const own = ball.x < NET ? p.side === 0 : p.side === 1;
  const t0 = players[p.side * 2];
  const t1 = players[p.side * 2 + 1];
  const mate = p === t0 ? t1 : t0;
  // Prefer alternating touches only when the teammate can actually reach the ball.
  const assistBall =
    ball.deadened ||
    ball.lastShot === 'set' ||
    ball.lastShot === 'powerReceive' ||
    ((ball.lastShot === 'receive' || ball.lastShot === 'flying') && !ball.lastWasReturn);
  const chaseX = assistBall ? coverBallX() : ball.x + ball.vx * 0.18;
  const catchTime = Math.max(
    0,
    (-ball.vy + Math.sqrt(Math.max(0, ball.vy * ball.vy + 2 * GRAVITY * (FLOOR - 65 - ball.y)))) / GRAVITY
  );

  let nearest = null;
  let nearestDist = Infinity;
  let reachableAny = null;
  let reachableAnyDist = Infinity;
  let readyAny = null;
  let readyAnyDist = Infinity;

  for (let i = 0; i < 2; i++) {
    const q = i === 0 ? t0 : t1;
    if (!q || q.recoveryFrames > 0 || q.cooldownFrames > 0) continue;
    const dist = Math.abs(q.x - chaseX);
    if (!readyAny || dist < readyAnyDist) { readyAny = q; readyAnyDist = dist; }
    if (dist <= 70 + (q.human ? HUMAN_SPEED : COM_SPEED) * catchTime) {
      if (!reachableAny || dist < reachableAnyDist) { reachableAny = q; reachableAnyDist = dist; }
      if (q !== ball.lastHitter) {
        if (!nearest || dist < nearestDist) { nearest = q; nearestDist = dist; }
      }
    }
  }
  nearest = nearest || reachableAny || readyAny;
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
      if (ball.lastShot === 'set' || ball.lastShot === 'powerReceive') {
        const rescue = ball.vy > 0 && ball.y > NETTOP - 20;
        if (rescue) {
          jump = false;
          shot = true;
          comIntent = 'set';
          target = clampCourtX(chaseX, p.side, 35, 35);
        } else {
          const isAttack = comShotType(ball) === 'attack';
          const targetHeight = getComSpikeTargetHeight(p);
          const currentHeight = FLOOR - p.y;
          // 上昇中で目標打点より低い場合は、頂点付近まで引きつけてから叩く
          const stillRisingToTarget = p.vy < -120 && currentHeight < targetHeight - 15;
          const ballPassing = ball.vy > 180 && ball.y > p.y - 15;
          shot = p.y < FLOOR - 35 && isAttack && (!stillRisingToTarget || ballPassing);
        }
      }
    }
  }

  const move = Math.abs(target - p.x) > 12 ? Math.sign(target - p.x) : 0;
  const inContact = inBallContactRange(p);
  const canPowerReceive = own && nearest === p && shot && !jump && p.y >= FLOOR && p.specials > 0
    && p.recoveryFrames <= 0 && p.cooldownFrames <= 0 && p.blockFrames <= 0 && serveTimer <= 0
    && inContact;
  if (canPowerReceive && (ball.doubleAttack || (ball.lastSide !== p.side && ['empowered', 'powerServe'].includes(ball.specialShot)) || Math.random() < 0.25)) {
    return { move, jump: false, shot: true, set: false, down: true, comIntent };
  }
  const canUseSpecial = own && nearest === p && shot && p.y < FLOOR && p.specials > 0
    && p.recoveryFrames <= 0 && p.cooldownFrames <= 0 && p.blockFrames <= 0 && serveTimer <= 0
    && !ball.doubleAttack && !(['empowered', 'powerServe'].includes(ball.specialShot) && ball.lastSide !== p.side)
    && inContact;
  if (canUseSpecial && Math.random() < COM_SPECIAL_CHANCE) {
    const useMozu = Math.random() < 0.5;
    return { move, jump, shot: !useMozu, set: useMozu, down: true, comIntent };
  }
  const canFeint = own && nearest === p && shot && p.y < FLOOR && p.blockFrames <= 0
    && p.recoveryFrames <= 0 && p.cooldownFrames <= 0 && serveTimer <= 0
    && Math.abs(ball.x - NET) < 230 && inContact
    && (comIntent || comAction(p)) === 'attack' && !ball.doubleAttack
    && !(['empowered', 'powerServe'].includes(ball.specialShot) && ball.lastSide !== p.side);
  if (canFeint) {
    const opp0 = players[(1 - p.side) * 2], opp1 = players[(1 - p.side) * 2 + 1];
    const blockerWaiting = (opp0 && opp0.recoveryFrames <= 0 && (opp0.blockFrames > 0 || opp0.y < FLOOR) && Math.abs(opp0.x - NET) < 110)
      || (opp1 && opp1.recoveryFrames <= 0 && (opp1.blockFrames > 0 || opp1.y < FLOOR) && Math.abs(opp1.x - NET) < 110);
    const pressure = p.blockPressure ?? 0;
    const chance = blockerWaiting ? Math.min(.8, .25 + pressure * .15)
      : pressure >= 2 ? Math.min(.65, .25 + pressure * .1) : 0;
    if (chance > 0 && Math.random() < chance) {
      if (blockerWaiting && Math.random() < 0.5) {
        return { move: -playerForward(p), jump: true, up: false, shot: true, set: false, down: false, comIntent: 'loop' };
      }
      return { move: -playerForward(p), jump: true, shot: false, set: true, down: false, comIntent: 'feint' };
    }
  }
  return { move, jump, shot, set: false, down: false, comIntent };
}

// --- Simulation & Physics Update ---
function finishPoint() {
  const side = pointEnd.side;
  for (const p of players) {
    if (p.side === side) p.blockPressure = Math.max(0, (p.blockPressure ?? 0) - 1);
  }
  if (score[side] >= WINNING_SCORE) {
    pointEnd = null;
    winner = true;
    playSfx('win');
    setOverlay(
      side ? 'BLUE WINS!' : 'CORAL WINS!',
      'ナイスゲーム！次の試合の担当を決めましょう。',
      'PLAY AGAIN ',
      true
    );
  } else {
    beginServe(side);
    status();
  }
}

function recordBallTrail() {
  const speedSq = ball.vx * ball.vx + ball.vy * ball.vy;
  if (speedSq <= 90000) {
    ball.trail.length = 0;
    return;
  }
  const trail = ball.trail;
  const item = trail.length >= 14 ? trail.pop() : { x: 0, y: 0, rotation: 0 };
  item.x = ball.x;
  item.y = ball.y;
  item.rotation = ball.rotation ?? 0;
  trail.unshift(item);
}

function applyKnockbackAndGravity(p, dt) {
  emitKnockbackSlideSand(p, dt);
  const wasAirborne = p.y < FLOOR;
  const decay = KNOCKBACK_RULES.decay;
  p.x += (p.knockback * (1 - Math.exp(-decay * dt))) / decay;
  p.knockback *= Math.exp(-decay * dt);
  p.x = clampCourtX(p.x, p.side);
  p.vy += PLAYER_GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y > FLOOR) {
    p.y = FLOOR;
    p.vy = 0;
  }
  if (wasAirborne && p.y >= FLOOR) {
    p.airborneActionTaken = false;
    p.airborneShotHeld = false;
    if (p.airborneTouch) {
      p.recoveryFrames = Math.max(p.recoveryFrames, FRAME_RULES.landingRecovery);
      p.vx = 0;
      p.attackReady = false;
      p.setReady = false;
      p.receiveReady = false;
    }
    p.airborneTouch = false;
  }
}

function updatePointEnd(dt) {
  updateBallSpin(dt);
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
    p.blockFrames = 0;
    p.actionFrames = advanceFrames(p.actionFrames, dt);
    applyKnockbackAndGravity(p, dt);
    updatePlayerMotion(p, dt, wasGrounded);
  }

  if (pointEnd.time <= 0) finishPoint();
}

function inFlyingContactRange(p) {
  const dir = p.diveDir || (p.side ? -1 : 1);
  const handsX = p.x + dir * 42;
  const bodyX = p.x + dir * 16;
  return (
    Math.hypot(ball.x - handsX, ball.y - (p.y - 26)) < 90 ||
    Math.hypot(ball.x - bodyX, ball.y - (p.y - 34)) < 86
  );
}

function shouldFlyingDive(p, inStandingRange, intendedShot, move) {
  // Dive only when the player explicitly moves toward the ball.
  if (move * Math.sign(ball.x - p.x) <= 0) return false;
  if (inStandingRange || Math.abs(ball.x - p.x) < FLYING_TRIGGER_DISTANCE) return false;
  if (p.human) return true;
  if (intendedShot !== 'receive') return false;
  const own = ball.x < NET ? p.side === 0 : ball.x > NET;
  if (!own || ball.vy <= 0 || ball.y < FLOOR - 155 || Math.abs(ball.x - p.x) > 210) return false;
  const tLand =
    (-ball.vy + Math.sqrt(Math.max(0, ball.vy * ball.vy + 2 * GRAVITY * Math.max(0, FLOOR - 35 - ball.y)))) / GRAVITY;
  return Math.abs(ball.x - p.x) > COM_SPEED * tLand + 45;
}

function startFlyingDive(p, forward) {
  p.diveDir = ball.x >= p.x ? 1 : -1;
  p.diveForward = forward;
  p.diveHit = false;
  p.recoveryFrames = ACTION_RECOVERY_FRAMES.flying;
  p.vx = p.diveDir * FLYING_DIVE_SPEED;
  showAction(p, 'flying');
  playSfx('dive');
}

function updateActivePlayer(p, dt, pads, inputOverride = null) {
  tickPlayerAnimation(p, dt);
  p.actionFrames = advanceFrames(p.actionFrames, dt);
  p.blockFrames = advanceFrames(p.blockFrames, dt);
  if (p.y >= FLOOR) p.blockFrames = 0;
  p.recoveryFrames = advanceFrames(p.recoveryFrames, dt);
  p.cooldownFrames = advanceFrames(p.cooldownFrames, dt);
  p.flash = Math.max(0, p.flash - dt);

  const input = inputOverride ?? (p.human ? readHumanInput(p, pads) : decideComInput(p));
  let { move, jump, shot, set, comIntent, down } = input;
  const isUp = Boolean(input.up || jump);
  const forward = move * playerForward(p) > 0;
  const back = move * playerForward(p) < 0;
  if (p.y < FLOOR) {
    if (p.airborneActionTaken) {
      shot = false;
      set = false;
    } else if (set) {
      if (back) {
        p.airborneSetHeld = true;
      } else {
        p.airborneActionTaken = true;
      }
    } else if (p.airborneSetHeld) {
      p.airborneActionTaken = true;
      p.airborneSetHeld = false;
    } else if (shot) {
      p.airborneShotHeld = true;
    } else if (p.airborneShotHeld) {
      p.airborneActionTaken = true;
      p.airborneShotHeld = false;
    }
  } else {
    p.airborneActionTaken = false;
    p.airborneShotHeld = false;
    p.airborneSetHeld = false;
  }
  const opponentBall = p.side === 0 ? ball.x > NET : ball.x < NET;

  if (set && !isUp && !back && !(down && p.specials > 0) && p.blockFrames <= 0 && opponentBall && p.y < FLOOR && p.recoveryFrames <= 0 && p.cooldownFrames <= 0) {
    p.blockFrames = FRAME_RULES.blockActive;
    showAction(p, 'block');
  }
  if (p.blockFrames > 0) {
    shot = false;
    set = false;
  }
  if (p.recoveryFrames > 0) {
    move = 0;
    jump = false;
    shot = false;
    set = false;
  }

  const intendedShot = p.human
    ? set
      ? (back && !(down && p.specials > 0) ? 'feint' : 'set')
      : (back && !(down && p.specials > 0) ? 'loop' : 'attack')
    : (comIntent || comAction(p));
  const inContactRange = inBallContactRange(p);
  // COM must reach the ball before planting its feet for a toss.
  p.setReady = !!((set || (shot && intendedShot === 'set')) && p.blockFrames <= 0
    && p.recoveryFrames <= 0 && p.cooldownFrames <= 0 && (p.human || inContactRange));
  const grounded = p.y >= FLOOR;

  if (
    serveTimer <= 0 &&
    grounded &&
    !jump &&
    shot &&
    !set &&
    p.blockFrames <= 0 &&
    p.recoveryFrames <= 0 &&
    p.cooldownFrames <= 0 &&
    shouldFlyingDive(p, inContactRange, intendedShot, move)
  ) {
    startFlyingDive(p, forward);
    shot = false;
  }

  const isFlyingActive = p.action === 'flying' && (p.diveAge ?? FLYING_TOTAL_DURATION) < FLYING_TOTAL_DURATION;
  // Jump and directional dives take priority over planting the feet for a receive.
  p.receiveReady = !!(grounded && !jump && shot && !set && !p.setReady && !isFlyingActive
    && p.blockFrames <= 0 && p.recoveryFrames <= 0 && p.cooldownFrames <= 0
    && (p.human || (inContactRange && intendedShot === 'receive')));
  const groundPoseLocked = p.setReady || p.receiveReady || (p.actionFrames > 0 && ['set', 'receive', 'powerReceive'].includes(p.action));
  if (isFlyingActive) {
    const dir = p.diveDir || playerForward(p);
    if (p.diveAge < FLYING_DIVE_DURATION) {
      p.vx = dir * FLYING_DIVE_SPEED;
    } else if (p.diveAge < FLYING_DIVE_DURATION + FLYING_PRONE_DURATION) {
      const slideProgress = (p.diveAge - FLYING_DIVE_DURATION) / FLYING_PRONE_DURATION;
      p.vx = dir * 110 * Math.max(0, 1 - slideProgress);
    } else {
      p.vx = 0;
    }
  } else {
    if (grounded) p.vx = groundPoseLocked ? 0 : move * (p.human ? HUMAN_SPEED : COM_SPEED);
    if (p.recoveryFrames > 0) p.vx = 0;
  }

  p.x += p.vx * dt;
  if (jump && p.y >= FLOOR && !groundPoseLocked && !isFlyingActive) {
    p.airborneTouch = false;
    p.vy = -JUMP_SPEED;
    playSfx('jump');
  }
  applyKnockbackAndGravity(p, dt);
  if (!grounded && p.y >= FLOOR) playSfx('land');

  // Show the wind-up as soon as an airborne attack is requested, before contact.
  p.attackReady = !!(shot && !set && p.y < FLOOR && p.blockFrames <= 0
    && p.recoveryFrames <= 0 && p.cooldownFrames <= 0 && intendedShot === 'attack');
  p.attackChargeFrames = p.attackReady
    ? Math.min(FRAME_RULES.attackCharge, (p.attackChargeFrames ?? 0) + dt * GAME_FPS)
    : 0;
  if (serveTimer <= 0) tryBlock(p);
  if (
    serveTimer <= 0 &&
    isFlyingActive &&
    !p.diveHit &&
    p.diveAge <= FLYING_DIVE_DURATION + seconds(FRAME_RULES.flyingContactExtra) &&
    p.cooldownFrames <= 0 &&
    inFlyingContactRange(p)
  ) {
    hit(p, false, 'flying', p.diveForward || forward, false);
  } else if (
    serveTimer <= 0 &&
    p.blockFrames <= 0 &&
    p.recoveryFrames <= 0 &&
    p.cooldownFrames <= 0 &&
    (shot || set) &&
    inContactRange
  ) {
    hit(p, set, comIntent, forward, back, down, isUp);
  }

  updatePlayerMotion(p, dt, grounded);
}

function updateBallSpin(dt) {
  if (!ball) return;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (Math.abs(ball.vx) > 10) ball.spinDirection = Math.sign(ball.vx);
  const spinBoost = (ball.lastShot === 'feint' && (ball.feintDrive ?? 0) > 0)
    ? 2.4
    : (ball.lastShot === 'loop' && (ball.loopDrive ?? 0) > 0)
      ? 2.6
      : (ball.quickAttack && (ball.x - NET) * ball.vx > 0)
        ? 2.4
        : 1;
  const angularSpeed = (speed / ball.r * 0.18) * spinBoost;
  const turn = Math.PI * 2;
  ball.rotation = ((ball.rotation ?? 0) + angularSpeed * (ball.spinDirection || 1) * dt) % turn;
}

function updateBall(dt) {
  updateBallSpin(dt);
  recordBallTrail();
  const oldX = ball.x;
  const oldY = ball.y;
  if (ball.specialShot === 'mozu' && ball.mozuPhase === 'rise') {
    const previousAge = ball.mozuRiseAge;
    const age = Math.min(ball.mozuRiseDuration, previousAge + dt);
    ball.mozuRiseAge = age;
    ball.x = ball.mozuStartX + (ball.mozuTargetX - ball.mozuStartX) * age / ball.mozuRiseDuration;
    ball.y = ball.mozuStartY - ball.mozuRiseSpeed * age + 0.5 * GRAVITY * age * age;
    ball.vy = -ball.mozuRiseSpeed + GRAVITY * age;
    if (age >= ball.mozuRiseDuration) {
      const remaining = Math.max(0, dt - (age - previousAge));
      ball.mozuPhase = 'dive';
      playSfx('mozuDive');
      ball.vx = 0;
      ball.vy = SPECIAL_RULES.mozuDiveSpeed + GRAVITY * remaining;
      ball.y += SPECIAL_RULES.mozuDiveSpeed * remaining + 0.5 * GRAVITY * remaining * remaining;
    }
  } else {
    ball.vy += GRAVITY * dt;
    if (ball.serveVariant === 'high' && (ball.x - NET) * ball.vx > 0) ball.vy += 220 * dt;
    if (ball.quickAttack && (ball.x - NET) * ball.vx > 0) ball.vy += QUICK_DRIVE * dt;
    if (ball.lastShot === 'feint' && (ball.x - (NET + Math.sign(ball.vx) * NET_CLEAR_OFFSET)) * ball.vx > 0) {
      ball.feintDrive = (ball.feintDrive || 0) + 3600 * dt;
      ball.vy += (650 + ball.feintDrive) * dt;
    }
    if (ball.lastShot === 'loop' && (ball.x - NET) * ball.vx > 0) {
      ball.loopDrive = (ball.loopDrive || 0) + 1600 * dt;
      ball.vy += (420 + ball.loopDrive) * dt;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
  }

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

  awardBallReturn();
  for (const p of players) {
    if (tryBlock(p)) break;
  }

  if (Math.abs(ball.x - NET) < NET_HALF_WIDTH && ball.y + ball.r > NETTOP) {
    const isLandingOnNet = oldY + ball.r <= NETTOP && ball.vy > 0;
    // 上下のベクトルがほとんど無い（ネット上に乗って転がっている・小刻みに跳ねている）時はSEを鳴らさない
    const hasImpactVelocity = isLandingOnNet ? ball.vy >= 75 : Math.abs(ball.vx) >= 60;
    if (hasImpactVelocity) {
      playSfx('net');
    }
    if (isLandingOnNet) {
      ball.y = NETTOP - ball.r;
      ball.vy = -Math.abs(ball.vy) * 0.65;
      if (Math.abs(ball.vy) < 20) ball.vy = 0;
    } else {
      ball.x = oldX < NET ? NET - 19 : NET + 19;
      ball.vx = (oldX < NET ? -1 : 1) * Math.max(80, Math.abs(ball.vx) * 0.65);
    }
  }

  if (ball.y + ball.r >= FLOOR) {
    if (characterCheck) {
      handleCheckBallFloor();
      return;
    }
    const side = ball.x < NET ? 1 : 0;
    score[side]++;
    playSfx('point');
    ball.y = FLOOR - ball.r;
    ball.vy = -Math.max(180, Math.min(260, Math.abs(ball.vy) * 0.5));
    ball.vx *= 0.35;
    pointEnd = { side, time: POINT_PAUSE };
    const st = getArenaElement('#status');
    if (st) st.textContent = `${side ? 'BLUE TIDE' : 'CORAL CLUB'} +1 / 次のラリーへ`;
  }
}

function updateParticles(dt) {
  let write = 0;
  const count = particles.length;
  for (let i = 0; i < count; i++) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'sand') {
      p.vx *= Math.exp(-(p.drag ?? 3) * dt);
      p.vy += (p.gravity ?? (p.puff ? 40 : 280)) * dt;
      if (p.y >= FLOOR) { p.y = FLOOR; p.vy = 0; p.vx *= Math.exp(-8 * dt); }
    }
    particles[write++] = p;
  }
  particles.length = write;
}

function update(dt) {
  if (window.matchLobby?.online && !window.matchLobby.guest) {
    for (let i = 0; i < players.length; i++) {
      players[i].human = window.matchLobby.assignment(i);
    }
  }
  if (paused || window.matchLobby?.isWaitingForHost) return;
  updateSpecialActivation(dt);
  time += dt;
  shake *= 0.85;

  updateParticles(dt);

  if (!running || winner) {
    for (const p of players) {
      tickPlayerAnimation(p, dt);
      updatePlayerMotion(p, dt, p.y >= FLOOR);
    }
    return;
  }

  if (characterCheck) {
    checkGaugeTime += dt;
    while (checkGaugeTime >= 1 - 1e-9) {
      checkGaugeTime = Math.max(0, checkGaugeTime - 1);
      for (const p of players) addGauge(p, 2);
    }
    if (checkBallResetTimer > 0) {
      checkBallResetTimer -= dt;
      if (checkBallResetTimer <= 0) {
        checkBallResetTimer = 0;
        if (checkMode === 'serve') setupCheckServe();
        else if (checkMode === 'receive') launchCheckBallReceive();
      }
    }
  }

  if (pointEnd) {
    updatePointEnd(dt);
    return;
  }

  const pads = navigator.getGamepads?.() || [];
  if (serveState) {
    updateServe(dt, pads);
    return;
  }
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

function drawPlayer(p) {
  const index = p.index ?? players.indexOf(p);
  const art = animatedPlayerArt[index];
  const runArt = selectedRunArt[index];
  const pose = playerSpritePose(p);
  const hasSelectedRun = pose.selectedRun && runArt.complete && runArt.naturalWidth;
  const hasAnimatedArt = art?.complete && art.naturalWidth;
  const hasLegacyArt = playerArt.complete && playerArt.naturalWidth;

  const hasFlying = pose.flying && flyingReceiveArt.complete && flyingReceiveArt.naturalWidth;
  const hasToss = pose.toss && tossHitArt.complete && tossHitArt.naturalWidth;
  const hasReceive = pose.receive && receiveHitArt.complete && receiveHitArt.naturalWidth;
  const hasBlock = pose.block && blockArt.complete && blockArt.naturalWidth;
  if ((pose.service && serveArt.complete && serveArt.naturalWidth) || hasFlying || hasToss || hasReceive || hasBlock || hasSelectedRun || hasAnimatedArt || hasLegacyArt) {
    drawPlayerSprite(p, p.x, p.y, 1, null, pose);
    return;
  }
}

// Animation clocks belong to each athlete, not the global scenery clock.
// Physics/hit timing stay unchanged; jump poses follow the actual trajectory.
function tickPlayerAnimation(p, dt) {
  if (p.actionPop) {
    p.actionPop.age += dt * GAME_FPS;
    if (p.actionPop.age >= ACTION_POP_FRAMES) p.actionPop = null;
  }
  p.setAge = (p.setAge ?? seconds(FRAME_RULES.tossContact)) + dt;
  p.receiveAge = (p.receiveAge ?? seconds(FRAME_RULES.receiveContact)) + dt;
  p.diveAge = (p.diveAge ?? FLYING_TOTAL_DURATION) + dt;
  p.attackAge = (p.attackAge ?? ATTACK_ANIMATION_DURATION) + dt;
  p.landTime = Math.max(0, (p.landTime ?? 0) - dt);
  updatePlayerChargeTrail(p, dt);
}

function updatePlayerChargeTrail(p, dt) {
  p.chargeTrail = p.chargeTrail || [];
  const charging = p.attackReady && p.y < FLOOR && (p.attackChargeFrames ?? 0) > 0;
  if (charging) {
    p.chargeTrailTimer = (p.chargeTrailTimer ?? 0) + dt;
    if (p.chargeTrailTimer >= 0.033) {
      p.chargeTrailTimer = 0;
      const trail = p.chargeTrail;
      const pt = trail.length >= 6 ? trail.pop() : { x: 0, y: 0 };
      pt.x = p.x;
      pt.y = p.y;
      trail.unshift(pt);
    }
  } else {
    p.chargeTrailTimer = 0;
    if (p.chargeTrail.length > 0) p.chargeTrail.pop();
  }
}

function emitRunningSand(p, dt) {
  const distance = Math.abs(p.x - (p.sandPreviousX ?? p.x));
  p.sandPreviousX = p.x;
  const pose = playerSpritePose(p);
  const isRunning = running && !winner && !pointEnd && p.y >= FLOOR
    && Math.abs(p.vx) > 10 && pose.selectedRun;
  if (!isRunning || distance < 0.01 || dt <= 0) { p.sandDistance = 0; return; }
  // Emit on footfalls using actual travel, so pushing against the wall makes no dust.
  p.sandDistance = (p.sandDistance ?? 0) + Math.min(distance, HUMAN_SPEED * dt * 1.5);
  if (p.sandDistance < 42) return;
  p.sandDistance %= 42;
  if (particles.length >= 240) return;
  const direction = Math.sign(p.vx);
  const strength = Math.min(1.3, Math.abs(p.vx) / HUMAN_SPEED);
  const count = 5 + Math.round(strength * 3);
  for (let i = 0; i < count; i++) {
    const puff = i < 2;
    const life = puff ? 0.32 + Math.random() * 0.12 : 0.28 + Math.random() * 0.22;
    particles.push({
      kind: 'sand', puff,
      x: p.x - direction * (12 + Math.random() * 8), y: FLOOR - 2 - Math.random() * 3,
      vx: -direction * (20 + Math.random() * 85) * strength,
      vy: -(puff ? 18 + Math.random() * 22 : 35 + Math.random() * 65),
      life, maxLife: life, size: puff ? 3 + Math.random() * 3 : 1 + Math.random() * 1.3,
      color: ['#fff0b8', '#e9bd72', '#c99751'][i % 3]
    });
  }
}

function emitImpactSand(p, event, strength = 1) {
  if (!running || winner) return;
  const jumping = event === 'jump';
  const room = Math.max(0, 320 - particles.length);
  const count = Math.min(room, jumping ? 35 : 29);
  for (let i = 0; i < count; i++) {
    const ring = i === 0;
    const streak = jumping && i > 0 && i < 10;
    const puff = !ring && !streak && i < (jumping ? 23 : 17);
    const side = i % 2 ? -1 : 1;
    const speed = (jumping ? 180 : 120) + Math.random() * 130;
    const angle = -Math.PI * (0.12 + Math.random() * 0.76);
    const life = ring ? 0.24 : streak ? 0.22 + Math.random() * 0.08
      : puff ? 0.38 + Math.random() * 0.25 : 0.3 + Math.random() * 0.25;
    particles.push({
      kind: 'sand', event, ring, streak, puff,
      x: p.x + (ring ? 0 : side * (4 + Math.random() * 12)), y: FLOOR - 2,
      vx: ring ? 0 : jumping ? Math.cos(angle) * speed * strength : side * speed * strength,
      vy: ring ? 0 : jumping ? Math.sin(angle) * speed * (puff ? 0.55 : 1)
        : -(puff ? 18 + Math.random() * 28 : 25 + Math.random() * 55) * strength,
      drag: puff ? 3.5 : 1.5, gravity: ring ? 0 : puff ? 50 : 360,
      life, maxLife: life, size: ring ? (jumping ? 80 : 65) * strength
        : streak ? 16 + Math.random() * 16 : puff ? (jumping ? 8 : 5) + Math.random() * 7 : 1.4 + Math.random() * 1.8,
      color: ['#fff0bd', '#eac17c', '#c99550'][i % 3]
    });
  }
}

function emitKnockbackImpact(p, strength = 1) {
  if (!running || winner) return;
  const lowAirHeight = FLOOR - p.y;
  if (lowAirHeight > 85) return; // Only emit on ground or in low air
  const room = Math.max(0, 320 - particles.length);
  const count = Math.min(room, Math.round(18 * strength));
  if (count <= 0) return;
  const direction = Math.sign(p.knockback) || (p.side ? 1 : -1);
  const heightRatio = Math.max(0.4, 1 - lowAirHeight / 110);

  for (let i = 0; i < count; i++) {
    const puff = i < Math.round(count * 0.65);
    const speed = (50 + Math.random() * 130) * strength * heightRatio;
    const angle = -Math.PI * (0.15 + Math.random() * 0.7);
    const life = puff ? 0.35 + Math.random() * 0.22 : 0.25 + Math.random() * 0.2;
    particles.push({
      kind: 'sand', event: 'knockback', puff,
      x: p.x + (Math.random() - 0.5) * 20,
      y: FLOOR - 2,
      vx: Math.cos(angle) * speed + direction * 45 * heightRatio,
      vy: Math.sin(angle) * speed,
      drag: puff ? 3.5 : 1.5,
      gravity: puff ? 45 : 320,
      life, maxLife: life,
      size: puff ? (4.5 + Math.random() * 5.5) * heightRatio : 1.3 + Math.random() * 1.6,
      color: ['#fff0bd', '#eac17c', '#c99550'][i % 3]
    });
  }
}

function emitKnockbackSlideSand(p, dt) {
  if (!running || winner) return;
  const speed = Math.abs(p.knockback);
  const lowAirHeight = FLOOR - p.y;
  if (speed < 70 || lowAirHeight > 85) return;
  if (particles.length >= 280) return;

  const direction = Math.sign(p.knockback);
  const heightRatio = Math.max(0.4, 1 - lowAirHeight / 110);
  const strength = Math.min(1.5, speed / 1000) * heightRatio;
  const count = Math.min(3, Math.floor(speed / 420) + 1);

  for (let i = 0; i < count; i++) {
    const puff = i === 0 || Math.random() < 0.55;
    const life = puff ? 0.32 + Math.random() * 0.18 : 0.22 + Math.random() * 0.18;
    particles.push({
      kind: 'sand', event: 'knockback', puff,
      x: p.x + (Math.random() - 0.5) * 14,
      y: FLOOR - 2 - Math.random() * 3,
      vx: -direction * (18 + Math.random() * 55) * strength + direction * (10 + Math.random() * 25),
      vy: -(puff ? 20 + Math.random() * 35 : 35 + Math.random() * 55) * strength,
      drag: puff ? 3.8 : 1.8,
      gravity: puff ? 40 : 340,
      life, maxLife: life,
      size: puff ? (4 + Math.random() * 4.5) * heightRatio : 1.2 + Math.random() * 1.5,
      color: ['#fff0bd', '#eac17c', '#c99550'][i % 3]
    });
  }
}

function updatePlayerMotion(p, dt, wasGrounded) {
  const grounded = p.y >= FLOOR;
  if (wasGrounded && !grounded) {
    p.jumpAge = 0;
    p.landTime = 0;
    if (p.vy < 0) emitImpactSand(p, 'jump');
  } else if (!grounded) {
    p.jumpAge = (p.jumpAge ?? 0) + dt;
  }
  if (!grounded) p.lastFallSpeed = Math.max(0, p.vy);
  if (!wasGrounded && grounded) {
    p.landTime = LANDING_ANIMATION_DURATION;
    emitImpactSand(p, 'land', Math.max(0.7, Math.min(1.2, (p.lastFallSpeed ?? 400) / 550)));
    p.lastFallSpeed = 0;
  }

  const state = grounded ? (Math.abs(p.vx) > 10 ? 'run' : 'idle') : 'jump';
  if (p.motionState !== state) {
    p.motionState = state;
    p.motionClock = 0;
  } else {
    const speedScale = state === 'run' ? Math.max(0.65, Math.min(1.4, Math.abs(p.vx) / HUMAN_SPEED)) : 1;
    p.motionClock = (p.motionClock ?? 0) + dt * speedScale;
  }
  emitRunningSand(p, dt);
}

function playerSpritePose(p) {
  const action = p.actionFrames > 0 ? p.action : null;
  if (serveState && players[serveState.serverIndex] === p && p.y >= FLOOR
    && (serveState.phase === 'holding' || serveState.age < .3)) {
    return { service: true, frame: serveState.phase === 'holding' ? 0 : 1 };
  }
  if (p.attackReady && p.y < FLOOR && p.blockFrames <= 0) return { row: 2, frame: 2 };
  if (p.setReady && p.blockFrames <= 0) return { legacy: true, frame: 4 };
  if (p.receiveReady && p.y >= FLOOR && p.blockFrames <= 0) return { legacy: true, frame: 3 };
  // Fixed poses: cell 3 while active, cell 4 on contact, cell 5 on a miss.
  if (p.y < FLOOR && (p.blockFrames > 0 || action === 'block')) {
    return { block: true, frame: p.blockFrames > 0 ? 2 : p.blockHit ? 3 : 4 };
  }
  // Hold the new contact pose briefly, then return to the original ready pose.
  if (action === 'set') return (p.setAge ?? 0) < seconds(FRAME_RULES.tossContact)
    ? { toss: true, frame: 1 } : { legacy: true, frame: 4 };
  if (action === 'flying' && (p.diveAge ?? 1) < FLYING_TOTAL_DURATION) {
    const age = p.diveAge ?? 0;
    const frame = age < FLYING_DIVE_DURATION ? 0 : age < FLYING_DIVE_DURATION + FLYING_PRONE_DURATION ? 1 : 2;
    return { flying: true, frame };
  }
  if (action === 'receive' || action === 'powerReceive') return (p.receiveAge ?? 0) < seconds(FRAME_RULES.receiveContact)
    ? { receive: true, frame: 1 } : { legacy: true, frame: 3 };
  if (p.y >= FLOOR && p.landTime > 0) return { row: 3, frame: 5 };
  if (['attack', 'quick', 'double', 'feint', 'loop'].includes(action) && (p.attackAge ?? 1) < ATTACK_ANIMATION_DURATION) {
    return { row: 2, frame: (action === 'feint' || action === 'loop')
      ? Math.min(5, Math.floor((p.attackAge ?? 0) / 0.06))
      : (p.attackAge ?? 0) < seconds(FRAME_RULES.attackContact) ? 4 : 5 };
  }
  if (p.y < FLOOR) {
    const age = p.jumpAge ?? 0;
    const frame = age < 0.05 ? 0 : age < 0.12 ? 1 : p.vy < -120 ? 2 : p.vy <= 120 ? 3 : 4;
    return { row: 3, frame };
  }
  const moving = Math.abs(p.vx) > 10;
  if (moving) {
    const frame = Math.floor((p.motionClock ?? 0) * 24) % 12;
    const backwards = p.vx * (p.side ? -1 : 1) < 0;
    return { row: 1, frame: backwards ? 11 - frame : frame, selectedRun: true };
  }
  return { row: 0, frame: Math.floor((p.motionClock ?? 0) * 4) % 6 };
}

function drawPlayerSprite(p, customX = p.x, customY = p.y, alpha = 1, glowColor = null, cachedPose = null) {
  const athlete = p.index ?? players.indexOf(p);
  const pose = cachedPose || playerSpritePose(p);
  const runArt = selectedRunArt[athlete];
  let art = animatedPlayerArt[athlete];
  let row = pose.row;
  let frame = pose.selectedRun ? Math.floor(pose.frame / 2) : pose.frame;
  let baseline = 246;
  let rows = 4;
  let columns = 6;
  let size = 112;
  let sourceY;
  let sourceHeight;

  if (pose.service) {
    if (serveArt.complete && serveArt.naturalWidth) {
      art = serveArt;
      columns = 4;
      rows = 2;
      row = Math.floor(athlete / 2);
      frame = athlete % 2 * 2 + pose.frame;
      baseline = SERVE_BASELINES[athlete] * 256;
      size = SERVE_SPRITE_SIZE;
    } else if (playerArt.complete && playerArt.naturalWidth) {
      art = playerArt;
      row = athlete;
      frame = 0;
      baseline = 252;
    } else {
      row = 0;
      frame = 0;
    }
  } else if (pose.flying) {
    if (flyingReceiveArt.complete && flyingReceiveArt.naturalWidth) {
      art = flyingReceiveArt;
      columns = 3;
      rows = 4;
      row = athlete;
      frame = pose.frame;
      sourceHeight = art.naturalHeight / 4;
      size = 136;
    } else if (playerArt.complete && playerArt.naturalWidth) {
      art = playerArt;
      row = athlete;
      frame = 3;
      baseline = 252;
    } else {
      row = 0;
      frame = 0;
    }
  } else if (pose.receive) {
    if (receiveHitArt.complete && receiveHitArt.naturalWidth) {
      art = receiveHitArt;
      columns = 2;
      rows = 2;
      row = Math.floor(athlete / 2);
      frame = athlete % 2;
      baseline = RECEIVE_HIT_BASELINES[athlete] * 256;
      size = 100;
    } else if (playerArt.complete && playerArt.naturalWidth) {
      art = playerArt;
      row = athlete;
      frame = 3;
      baseline = 252;
    } else {
      row = 0;
      frame = 0;
    }
  } else if (pose.toss) {
    if (tossHitArt.complete && tossHitArt.naturalWidth) {
      art = tossHitArt;
      columns = 2;
      rows = 2;
      row = Math.floor(athlete / 2);
      frame = athlete % 2;
      // The row boundary is at 606px so raised blue-team fingertips stay intact.
      sourceY = athlete < 2 ? 0 : 606;
      sourceHeight = athlete < 2 ? 606 : 648;
      baseline = TOSS_HIT_BASELINES[athlete] * 256;
      size = 120;
    } else if (playerArt.complete && playerArt.naturalWidth) {
      art = playerArt;
      row = athlete;
      frame = 4;
      baseline = 252;
    } else {
      row = 0;
      frame = 0;
    }
  } else if (pose.block) {
    if (pose.frame === 2 && straightBlockArt.complete && straightBlockArt.naturalWidth) {
      art = straightBlockArt;
      columns = 2;
      rows = 2;
      row = Math.floor(athlete / 2);
      frame = athlete % 2;
      sourceHeight = art.naturalHeight / rows;
      baseline = STRAIGHT_BLOCK_BASELINES[athlete] * 256;
      size = 100;
    } else if (blockArt.complete && blockArt.naturalWidth) {
      art = blockArt;
      columns = 3;
      row = athlete;
      frame = pose.frame - 2;
      baseline = BLOCK_BASELINES[athlete][frame] * 256;
      size = 120;
    } else if (playerArt.complete && playerArt.naturalWidth) {
      art = playerArt;
      row = athlete;
      frame = 4;
      baseline = 252;
    } else {
      row = 0;
      frame = 0;
    }
  } else if (pose.selectedRun && runArt.complete && runArt.naturalWidth) {
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

  if (pose.row === 3 && art === animatedPlayerArt[athlete]) {
    baseline = JUMP_BASELINES[athlete][frame];
  }

  const cw = art.naturalWidth / columns;
  const ch = sourceHeight ?? art.naturalHeight / rows;
  const drawHeight = sourceHeight ? (size * ch) / cw : size;
  const destY = sourceHeight && pose.flying ? (-drawHeight * 364) / 384 : (-size * baseline) / 256;
  const idleOffsetX = !pose.legacy && pose.row === 0 && art === animatedPlayerArt[athlete]
    ? IDLE_ALIGNMENT_X[athlete][frame] * size / 256 : 0;
  const facing = pose.flying && p.diveDir ? (p.diveDir < 0 ? -1 : 1) : p.side ? -1 : 1;

  ctx.save();
  ctx.translate(Math.round(customX), Math.round(customY));
  ctx.scale(facing, 1);
  ctx.imageSmoothingEnabled = false;
  if (alpha < 1) ctx.globalAlpha *= alpha;
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 10;
  }
  ctx.drawImage(art, frame * cw, sourceY ?? row * ch, cw, ch, -size / 2 + idleOffsetX, destY,
    size, drawHeight);
  ctx.restore();
}

// --- Camera & Scene Rendering ---
function updateCamera(dt, snap = false) {
  const target = characterCheck
    ? (checkMode === 'receive' && ball && ball.x > NET
        ? { x: players[0].x * 0.65 + ball.x * 0.35, y: Math.min(players[0].y, ball.y + 60) }
        : players[0])
    : ball;
  const visibleW = VIEW_W / camera.zoom;
  const visibleH = H / camera.zoom;
  const edgePadding = serveState ? 16 : 0;
  const targetX = Math.max(-edgePadding, Math.min(W - visibleW + edgePadding, target.x - visibleW / 2));
  // Horizontal ball tracking with a restrained vertical shift around the court.
  const baseY = H - visibleH;
  const targetY = Math.max(0, Math.min(baseY, baseY - 16 + (target.y - 300) * 0.1));
  const blend = snap ? 1 : 1 - Math.exp(-8 * dt);

  camera.x += (targetX - camera.x) * blend;
  camera.y += (targetY - camera.y) * blend;
  camera.x = Math.max(-edgePadding, Math.min(W - visibleW + edgePadding, Math.max(target.x - visibleW + 45, Math.min(target.x - 45, camera.x))));
  // Keep high balls visible without changing the court or physics.
  camera.y = Math.max(0, Math.min(baseY, Math.min(camera.y, Math.max(0, target.y - 30))));
}

function drawScenery() {
  if (beachArt.complete && beachArt.naturalWidth) {
    const iw = beachArt.naturalWidth;
    const ih = beachArt.naturalHeight;
    // Scroll each horizontal strip at a continuously varying speed.
    // At the sand the projection exactly matches the world-space court.
    const { lineHeight, horizon, shoreline, distantSpeed, waveAmplitude, waveSpeed } = RASTER_SCENERY;
    const scaledWidth = W * camera.zoom;
    const centerX = (VIEW_W - scaledWidth) / 2;
    const cameraShift = -camera.x * camera.zoom - centerX;

    const rawYHorizon = (horizon * H - camera.y) * camera.zoom;
    const rawYShoreline = (shoreline * H - camera.y) * camera.zoom;
    const yHorizon = Math.max(0, Math.min(H, Math.floor(rawYHorizon / lineHeight) * lineHeight));
    const yShoreline = Math.max(yHorizon, Math.min(H, Math.ceil(rawYShoreline / lineHeight) * lineHeight));

    // Sky / distant mountains (single draw call: constant distantSpeed, ripple is 0)
    if (yHorizon > 0) {
      const worldFractionStart = camera.y / H;
      const worldFractionEnd = (yHorizon / camera.zoom + camera.y) / H;
      const offsetSky = Math.max(VIEW_W - scaledWidth,
        Math.min(0, Math.round(centerX + cameraShift * distantSpeed)));
      ctx.drawImage(beachArt, 0, worldFractionStart * ih, iw, (worldFractionEnd - worldFractionStart) * ih,
        offsetSky, 0, scaledWidth, yHorizon);
    }

    // Sea raster strips (dynamic ripple & perspective acceleration only where visible)
    for (let y = yHorizon; y < yShoreline; y += lineHeight) {
      const height = Math.min(lineHeight, H - y);
      const worldFraction = (y / camera.zoom + camera.y) / H;
      const seaProgress = Math.max(0, Math.min(1, (worldFraction - horizon) / (shoreline - horizon)));
      const speed = distantSpeed + (1 - distantSpeed) * seaProgress * seaProgress;
      // A small traveling ripple fades to zero at both the horizon and sand.
      const ripple = Math.sin(seaProgress * Math.PI) * waveAmplitude
        * Math.sin(worldFraction * 110 - time * waveSpeed);
      const offset = Math.max(VIEW_W - scaledWidth,
        Math.min(0, Math.round(centerX + cameraShift * speed + ripple)));
      ctx.drawImage(beachArt, 0, worldFraction * ih, iw, height / camera.zoom / H * ih,
        offset, y, scaledWidth, height);
    }

    // Sand backdrop (single draw call: 1.0 court speed, ripple is 0)
    if (yShoreline < H) {
      const worldFractionStart = (yShoreline / camera.zoom + camera.y) / H;
      const worldFractionEnd = (H / camera.zoom + camera.y) / H;
      const offsetSand = Math.max(VIEW_W - scaledWidth,
        Math.min(0, Math.round(centerX + cameraShift)));
      ctx.drawImage(beachArt, 0, worldFractionStart * ih, iw, (worldFractionEnd - worldFractionStart) * ih,
        offsetSand, yShoreline, scaledWidth, H - yShoreline);
    }
  } else {
    // Clean tropical palette fallback while tropical-beach.png is loading
    const { horizon, shoreline } = RASTER_SCENERY;
    const rawYHorizon = (horizon * H - camera.y) * camera.zoom;
    const rawYShoreline = (shoreline * H - camera.y) * camera.zoom;
    const yHorizon = Math.max(0, Math.min(H, rawYHorizon));
    const yShoreline = Math.max(yHorizon, Math.min(H, rawYShoreline));

    if (yHorizon > 0) {
      const sky = ctx.createLinearGradient(0, 0, 0, yHorizon);
      sky.addColorStop(0, '#3ba8df');
      sky.addColorStop(1, '#9ee5f5');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, VIEW_W, yHorizon);
    }
    if (yShoreline > yHorizon) {
      const sea = ctx.createLinearGradient(0, yHorizon, 0, yShoreline);
      sea.addColorStop(0, '#108098');
      sea.addColorStop(1, '#1fb3c4');
      ctx.fillStyle = sea;
      ctx.fillRect(0, yHorizon, VIEW_W, yShoreline - yHorizon);
    }
    if (yShoreline < H) {
      ctx.fillStyle = '#edd8a4';
      ctx.fillRect(0, yShoreline, VIEW_W, H - yShoreline);
    }
  }
}

const SAND_SPECK_COORDS = Array.from({ length: 65 }, (_, i) => [
  (i * 173) % W,
  465 + ((i * 59) % 150)
]);

function drawWorldTerrain() {
  // The raster backdrop already includes the sand. Only the loading fallback
  // needs a fill here; court markings and shadows remain in world space.
  if (!beachArt.complete || !beachArt.naturalWidth) {
    rect(0, 425, W, H - 425, '#edd8a4');
  }

  // World-space court, players, net and ball; HUD stays in screen space.
  ctx.fillStyle = '#fff1cc';
  ctx.fillRect(50, COURT_REAR_LINE_Y, W - 100, 3);
  ctx.fillRect(50, COURT_REAR_LINE_Y + 1, 3, COURT_FRONT_LINE_Y - COURT_REAR_LINE_Y + 1);
  ctx.fillRect(W - 53, COURT_REAR_LINE_Y + 1, 3, COURT_FRONT_LINE_Y - COURT_REAR_LINE_Y + 1);
  ctx.fillRect(50, COURT_FRONT_LINE_Y, W - 100, 3);

  ctx.fillStyle = '#d5b780';
  for (let i = 0; i < SAND_SPECK_COORDS.length; i++) {
    const pt = SAND_SPECK_COORDS[i];
    ctx.fillRect(pt[0], pt[1], 3, 2);
  }

  ctx.fillStyle = '#214d4858';
  for (const p of players) {
    const height = Math.max(0, FLOOR - p.y);
    const radiusX = 32 * Math.max(0.4, 1 - height / 300);
    ctx.beginPath();
    ctx.ellipse(p.x, FLOOR + 4, radiusX, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAttackSwoosh(p) {
  // A shared overlay, only during a normal attack's contact frame (cell 5).
  if (p.action !== 'attack' || p.actionFrames <= 0 || !attackSwooshArt.complete || !attackSwooshArt.naturalWidth) return;
  const pose = playerSpritePose(p);
  if (pose.row !== 2 || pose.frame !== 4) return;
  const progress = Math.max(0, Math.min(1, (p.attackAge ?? 0) / seconds(FRAME_RULES.attackContact)));
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  ctx.scale(p.side ? -1 : 1, 1);
  ctx.globalAlpha = 0.9 * (1 - progress * 0.65);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(attackSwooshArt, -54, -112, 106, 106);
  ctx.restore();
}

const PLAYER_LABEL_COLORS = {
  '1P': '#ff896b', '2P': '#72d8ff', '3P': '#ffe16b', '4P': '#d7a1ff', COM: '#d8e1dd'
};
const LABEL_WIDTH_CACHE = {};

function drawPlayerFootLabel(p, index) {
  const art = animatedPlayerArt[index];
  if (!art?.complete && !playerArt.complete) return;
  const label = characterCheck ? '1P' : window.matchLobby?.label(index) ?? (p.human ? `${p.human}P` : 'COM');
  const human = label !== 'COM';
  ctx.save();
  ctx.font = `italic 900 ${human ? 17 : 12}px "Barlow Condensed", Impact, sans-serif`;
  let textWidth = LABEL_WIDTH_CACHE[label];
  if (textWidth === undefined) {
    textWidth = LABEL_WIDTH_CACHE[label] = ctx.measureText(label).width;
  }
  const half = textWidth / 2 + 4;
  const specialLabel = String(p.specials ?? 0);
  const specialWidth = specialLabel.length * 10;
  const gaugeWidth = specialWidth + 51;
  const x = Math.max(camera.x + half,
    Math.min(camera.x + VIEW_W / camera.zoom - half - gaugeWidth, Math.round(p.x) - gaugeWidth / 2));
  const y = Math.round(p.y) + 18 + (index % 2 === 1 ? 12 : 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // Only outlined letters: the colour identifies the controller, not the team.
  ctx.fillStyle = '#12374a60';
  ctx.fillText(label, x + 1, y + 2);
  ctx.strokeStyle = '#14384d';
  ctx.lineWidth = 3;
  ctx.strokeText(label, x, y);
  ctx.fillStyle = PLAYER_LABEL_COLORS[label] || PLAYER_LABEL_COLORS.COM;
  ctx.fillText(label, x, y);
  const gaugeX = x + half + 4;
  const gauge = p.gauge ?? 0;
  const gaugeColor = PLAYER_GAUGE_COLORS[index];
  ctx.textAlign = 'left';
  ctx.font = '900 16px "Barlow Condensed", system-ui, sans-serif';
  ctx.strokeStyle = '#14384d';
  ctx.lineWidth = 3;
  ctx.strokeText(specialLabel, gaugeX, y);
  ctx.fillStyle = '#fff9df';
  ctx.fillText(specialLabel, gaugeX, y);
  const barX = gaugeX + specialWidth + 5;
  ctx.save();
  ctx.translate(barX, y);
  ctx.scale(0.5, 0.5);
  rect(-2, -7, 74, 14, '#102e43');
  ctx.strokeStyle = gaugeColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(-2, -7, 74, 14);
  for (let i = 0; i < 10; i++) {
    rect(i * 7, -4, 6, 8, i < gauge ? gaugeColor : '#2e4b60');
    if (i < gauge) rect(i * 7, -4, 6, 2, '#ffffff80');
  }
  ctx.restore();
  ctx.restore();
}

function drawPlayerChargeAfterimages(p) {
  if (!p.attackReady || p.y >= FLOOR) return;
  const chargeRatio = Math.min(1, (p.attackChargeFrames ?? 0) / FRAME_RULES.attackCharge);
  if (chargeRatio <= 0.05) return;

  const trail = p.chargeTrail || [];
  const isMaxCharge = chargeRatio >= 0.98;
  const maxGhosts = isMaxCharge ? 4 : Math.max(1, Math.ceil(chargeRatio * 3));
  const count = Math.min(trail.length, maxGhosts);

  const pose = playerSpritePose(p);
  for (let i = count - 1; i >= 0; i--) {
    const ghost = trail[i];
    const fraction = (i + 1) / (maxGhosts + 1);
    const alpha = (1 - fraction) * (0.18 + chargeRatio * 0.32);
    const glow = isMaxCharge ? (i === 0 ? '#ffb338' : '#ff941a') : (chargeRatio > 0.5 ? '#ffcf66' : null);
    const wave = Math.sin(time * 26 + i * 1.6) * (1.5 + chargeRatio * 3.5);
    const offsetX = ghost.x + (p.side ? wave : -wave);
    const offsetY = ghost.y + Math.cos(time * 20 + i) * 1.5;

    drawPlayerSprite(p, offsetX, offsetY, alpha, glow, pose);
  }

  if (isMaxCharge && Math.random() < 0.35) {
    particles.push({
      x: p.x + (Math.random() - 0.5) * 32,
      y: p.y - 45 + (Math.random() - 0.5) * 50,
      vx: (Math.random() - 0.5) * 35,
      vy: -35 - Math.random() * 45,
      life: 0.22,
      color: Math.random() < 0.5 ? '#ffe873' : '#ffa834'
    });
  }
}

function triggerSpecialActivation(p, type) {
  if (!p) return;
  const isPowerReceive = type === "powerReceive";
  const isMozu = type === "mozu";
  const color = isPowerReceive ? "#4dfa7c" : isMozu ? "#6be4ff" : "#3ea6ff";
  const secondaryColor = isPowerReceive ? "#b8ffd9" : isMozu ? "#d9f8ff" : "#cce8ff";
  const darkColor = isPowerReceive ? "#021f11" : "#031424";

  specialActivation = {
    player: p,
    playerIndex: p.index ?? players.indexOf(p),
    type,
    color,
    secondaryColor,
    darkColor,
    age: 0,
    duration: 0.28,
    hitX: ball ? ball.x : p.x,
    hitY: ball ? ball.y : p.y - 39,
    side: p.side,
    originX: p.x,
    originY: p.y
  };

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const speed = 75 + Math.random() * 85;
    particles.push({
      kind: "spark",
      x: specialActivation.hitX,
      y: specialActivation.hitY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.25,
      maxLife: 0.25,
      color: Math.random() < 0.6 ? color : secondaryColor,
      size: 2.5 + Math.random() * 2
    });
  }
}

function updateSpecialActivation(dt) {
  if (!specialActivation || paused) return;
  specialActivation.age += dt;
  if (specialActivation.age >= specialActivation.duration) {
    specialActivation = null;
  }
}

function drawSpecialDim() {
  if (!specialActivation) return;
  const progress = specialActivation.age / specialActivation.duration;
  if (progress >= 1) return;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let alpha;
  if (progress < 0.2) {
    alpha = (progress / 0.2) * (reducedMotion ? 0.28 : 0.52);
  } else {
    alpha = (1 - (progress - 0.2) / 0.8) * (reducedMotion ? 0.28 : 0.52);
  }
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.fillStyle = specialActivation.darkColor;
  ctx.globalAlpha = alpha;
  const viewW = VIEW_W / camera.zoom;
  const viewH = H / camera.zoom;
  ctx.fillRect(camera.x - 50, camera.y - 50, viewW + 100, viewH + 100);
  ctx.restore();
}

function drawSpecialAfterimages() {
  if (!specialActivation) return;
  const p = specialActivation.player || players[specialActivation.playerIndex];
  if (!p) return;
  const progress = specialActivation.age / specialActivation.duration;
  if (progress >= 1) return;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const dir = p.side ? -1 : 1;
  const isUpShot = specialActivation.type === "mozu" || specialActivation.type === "powerReceive";

  // 1. 拡大アウトラインエコー
  const scaleExpand = reducedMotion ? 1.0 : (1.0 + 0.12 * Math.sin(progress * Math.PI));
  const alpha1 = (1 - progress) * 0.55;
  if (scaleExpand !== 1.0) {
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y - 45));
    ctx.scale(scaleExpand, scaleExpand);
    ctx.translate(-Math.round(p.x), -Math.round(p.y - 45));
    drawPlayerSprite(p, p.x, p.y, alpha1, specialActivation.color);
    ctx.restore();
  } else {
    drawPlayerSprite(p, p.x, p.y, alpha1, specialActivation.color);
  }

  // 2. 打球・アクション方向へのスライド残像
  if (!reducedMotion) {
    const slideDist = 24 * Math.sin(progress * Math.PI * 0.85);
    const slideX = p.x + dir * slideDist;
    const slideY = p.y + (isUpShot ? -14 : 10) * progress;
    const alpha2 = Math.max(0, (1 - progress * 1.1)) * 0.45;
    if (alpha2 > 0.02) {
      drawPlayerSprite(p, slideX, slideY, alpha2, specialActivation.secondaryColor);
    }

    // 3. 原点ゴースト（打球瞬間の位置に残る幻影）
    const alpha3 = Math.max(0, (1 - progress * 1.35)) * 0.32;
    if (alpha3 > 0.02) {
      drawPlayerSprite(p, specialActivation.originX, specialActivation.originY, alpha3, specialActivation.color);
    }
  }
}

function drawSpecialShockwave() {
  if (!specialActivation) return;
  const progress = specialActivation.age / specialActivation.duration;
  if (progress >= 1) return;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return;

  const hitX = specialActivation.hitX;
  const hitY = specialActivation.hitY;
  const maxR = 75;
  const r = 10 + progress * maxR;
  const alpha = (1 - progress) * 0.85;
  const strokeWidth = Math.max(1, 2.8 * (1 - progress));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = strokeWidth;

  // 外側リング（横長楕円）
  ctx.strokeStyle = specialActivation.color;
  ctx.beginPath();
  ctx.ellipse(hitX, hitY, r * 1.15, r * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 内側リング
  if (progress > 0.08) {
    const innerProgress = (progress - 0.08) / 0.92;
    const innerR = 8 + innerProgress * (maxR * 0.7);
    ctx.strokeStyle = specialActivation.secondaryColor;
    ctx.lineWidth = Math.max(0.8, 1.8 * (1 - innerProgress));
    ctx.globalAlpha = (1 - innerProgress) * 0.9;
    ctx.beginPath();
    ctx.ellipse(hitX, hitY, innerR * 1.15, innerR * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlayers(side) {
  for (const p of players) {
    if (p.side !== side) continue;
    drawPlayerChargeAfterimages(p);
    drawPlayer(p);
    drawAttackSwoosh(p);
  }
}

const ACTION_POP_METRICS_CACHE = new Map();

function getActionPopMetrics(style, fontSize) {
  const key = `${style.text}:${fontSize}`;
  let m = ACTION_POP_METRICS_CACHE.get(key);
  if (!m) {
    ctx.save();
    ctx.font = `italic 900 ${fontSize}px "Barlow Condensed", Impact, sans-serif`;
    const letters = [...style.text];
    const widths = letters.map(letter => ctx.measureText(letter).width);
    const width = widths.reduce((sum, w) => sum + w, 0) + (letters.length - 1);
    const fill = ctx.createLinearGradient(0, -fontSize, 0, 2);
    fill.addColorStop(0, '#fffbed');
    fill.addColorStop(0.48, style.color);
    fill.addColorStop(1, style.dark);
    ctx.restore();
    m = { letters, widths, width, padding: width * 0.65 + 26, fill };
    ACTION_POP_METRICS_CACHE.set(key, m);
  }
  return m;
}

function drawActionPops() {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  for (const p of players) {
    const pop = p.actionPop;
    const style = pop && ACTION_POP_STYLES[pop.action];
    if (!style || pop.age >= ACTION_POP_FRAMES) continue;
    const age = pop.age;
    const heavy = pop.action === 'double';
    const fontSize = heavy ? 36 : 30;
    const alpha = Math.min(1, (ACTION_POP_FRAMES - age) / 12);
    const entrance = reducedMotion ? 1 : age < 4 ? 0.58 + age / 4 * 0.66
      : age < 11 ? 1.24 - (age - 4) / 7 * 0.24 : 1;
    const { letters, widths, width, padding, fill } = getActionPopMetrics(style, fontSize);
    ctx.save();
    ctx.font = `italic 900 ${fontSize}px "Barlow Condensed", Impact, sans-serif`;
    const x = Math.max(padding, Math.min(VIEW_W - padding, (pop.x - camera.x) * camera.zoom));
    const rise = reducedMotion ? 0 : Math.min(age, 30) * 0.45;
    const y = Math.max(152, Math.min(H - 55, (pop.y - camera.y) * camera.zoom - rise));
    ctx.translate(x, y);
    ctx.rotate(reducedMotion ? 0 : -0.065);
    ctx.scale(entrance, entrance);
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // Offset ink shadow and a short colored slash replace the speech bubble.
    ctx.fillStyle = style.dark;
    ctx.beginPath();
    ctx.moveTo(-width * 0.5 - 8, 8);
    ctx.lineTo(width * 0.5 + 10, 8);
    ctx.lineTo(width * 0.5 + 5, 12);
    ctx.lineTo(-width * 0.5 - 12, 12);
    ctx.closePath();
    ctx.fill();
    if (!reducedMotion && age < 12) {
      ctx.globalAlpha = alpha * (1 - age / 12);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 2.5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * (width / 2 + 10), -14);
        ctx.lineTo(side * (width / 2 + 22 + age), -22);
        ctx.moveTo(side * (width / 2 + 8), -26);
        ctx.lineTo(side * (width / 2 + 12 + age), -36);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = alpha;
    let cursor = -width / 2;
    for (let i = 0; i < letters.length; i++) {
      const localAge = Math.max(0, age - i * 0.55);
      const bounce = reducedMotion || localAge >= 10 ? 0 : -Math.sin(localAge / 10 * Math.PI) * 5;
      const center = cursor + widths[i] / 2;
      ctx.fillStyle = '#12384f';
      ctx.fillText(letters[i], center + 2, bounce + 4);
      ctx.strokeStyle = '#12384f'; ctx.lineWidth = 6;
      ctx.strokeText(letters[i], center, bounce);
      ctx.strokeStyle = '#fff8df'; ctx.lineWidth = 2.3;
      ctx.strokeText(letters[i], center, bounce);
      ctx.fillStyle = fill;
      ctx.fillText(letters[i], center, bounce);
      cursor += widths[i] + 1;
    }
    ctx.font = '700 10px "Noto Sans JP", sans-serif';
    ctx.strokeStyle = '#153e53'; ctx.lineWidth = 3;
    ctx.strokeText(ACTION_LABELS[pop.action], 0, 25);
    ctx.fillStyle = '#fff9e7';
    ctx.fillText(ACTION_LABELS[pop.action], 0, 25);
    ctx.restore();
  }
}

let rearPoleMetal = null, frontPoleMetal = null, rearPoleFabric = null, frontPoleFabric = null;

function drawNet() {
  // A narrow perspective view keeps the centre line readable from the side.
  const rearX = NET - 13;
  const frontX = NET + 11;
  const rearFoot = COURT_REAR_LINE_Y + 1;
  const frontFoot = COURT_FRONT_LINE_Y + 1;
  const bottom = NETTOP + 65;
  ctx.save();
  ctx.fillStyle = '#23495030';
  ctx.beginPath();
  ctx.ellipse(frontX - 2, frontFoot + 5, 29, 6, -0.08, 0, Math.PI * 2);
  ctx.fill();

  function pole(x, foot, width, front) {
    const top = NETTOP - 7;
    let metal = front ? frontPoleMetal : rearPoleMetal;
    if (!metal) {
      metal = ctx.createLinearGradient(x - width / 2, 0, x + width / 2, 0);
      metal.addColorStop(0, '#345b6c');
      metal.addColorStop(0.3, '#eff8ef');
      metal.addColorStop(0.55, '#bed5d7');
      metal.addColorStop(1, '#527b89');
      if (front) frontPoleMetal = metal; else rearPoleMetal = metal;
    }
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, top, width, foot - top, 2);
    ctx.fill();
    ctx.strokeStyle = '#254d60'; ctx.lineWidth = 0.8; ctx.stroke();
    // Sunlit cap and a coral collar above the padded lower post.
    rect(x - width / 2 - 1, top, width + 2, 3, '#fff4d6');
    const padTop = front ? FLOOR - 77 : FLOOR - 12 - 68;
    const padWidth = width + (front ? 5 : 3);
    let fabric = front ? frontPoleFabric : rearPoleFabric;
    if (!fabric) {
      fabric = ctx.createLinearGradient(x - padWidth / 2, 0, x + padWidth / 2, 0);
      fabric.addColorStop(0, '#10566f');
      fabric.addColorStop(0.25, front ? '#39b7c9' : '#278eaa');
      fabric.addColorStop(0.6, '#1688a8');
      fabric.addColorStop(1, '#124f6c');
      if (front) frontPoleFabric = fabric; else rearPoleFabric = fabric;
    }
    ctx.fillStyle = fabric;
    ctx.beginPath();
    ctx.roundRect(x - padWidth / 2, padTop, padWidth, foot - padTop + 2, 3);
    ctx.fill();
    ctx.strokeStyle = '#174458'; ctx.stroke();
    rect(x - padWidth / 2 + 1, padTop + 3, padWidth - 2, 4, '#f18a62');
    rect(x - padWidth / 2 + 2, padTop + 8, 1, foot - padTop - 13, '#a7ede073');
    rect(x - padWidth / 2 + 1, foot - 7, padWidth - 2, 3, '#103f5b80');
    if (front) {
      ctx.save();
      ctx.translate(x + 1, padTop + 33);
      ctx.rotate(-Math.PI / 2);
      ctx.font = '900 8px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';ctx.fillStyle = '#fff3d8';
      ctx.fillText('SUNSET', 0, 2);
      ctx.restore();
    }
  }

  pole(rearX, rearFoot, 5, false);
  // Dark woven mesh and warm white binding, with a slight sag in the lower tape.
  ctx.fillStyle = '#16475b12';
  ctx.fillRect(rearX, NETTOP + 4, frontX - rearX, bottom - NETTOP - 4);
  ctx.strokeStyle = '#183e55b0';ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let x = rearX + 4; x < frontX; x += 4) {
    ctx.moveTo(x, NETTOP + 4);ctx.lineTo(x + 1, bottom);
  }
  for (let y = NETTOP + 9; y < bottom; y += 6) {
    ctx.moveTo(rearX, y);ctx.quadraticCurveTo(NET, y + 1.5, frontX, y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#fff2d3';ctx.lineWidth = 2;
  ctx.beginPath();ctx.moveTo(rearX, NETTOP + 3);ctx.lineTo(rearX, bottom);
  ctx.quadraticCurveTo(NET, bottom + 2, frontX, bottom);ctx.lineTo(frontX, NETTOP + 3);ctx.stroke();
  // The top of the white tape stays exactly on the gameplay net height.
  rect(rearX - 3, NETTOP, frontX - rearX + 6, 6, '#d6c9a6');
  rect(rearX - 3, NETTOP, frontX - rearX + 6, 4, '#fff8df');
  rect(rearX - 2, NETTOP + 1, frontX - rearX + 4, 1, '#ffffff');
  pole(frontX, frontFoot, 7, true);
  // Small tension eyelets attach the mesh to the poles.
  for (const x of [rearX, frontX]) {
    for (const y of [NETTOP + 9, bottom - 2]) {
      ctx.strokeStyle = '#23495d';ctx.lineWidth = 1.2;
      ctx.beginPath();ctx.arc(x - 2, y, 2.1, 0, Math.PI * 2);ctx.stroke();
      rect(x - 2.5, y - 1.5, 1.3, 1.3, '#fff8e4');
    }
  }
  // A small mound anchors the front pad in the sand.
  ctx.fillStyle = '#e8c47f';
  ctx.beginPath();ctx.ellipse(frontX, frontFoot + 3, 10, 2.6, 0, 0, Math.PI * 2);ctx.fill();
  rect(frontX - 6, frontFoot + 1, 8, 1, '#fff0bd');
  ctx.restore();
}

// Attack and quick share lastShot="attack"; current velocity controls the silhouette.
function attackBallShape() {
  const speed = Math.hypot(ball.vx, ball.vy);
  const strength = Math.max(0, Math.min(1, speed / QUICK_SPEED));
  return {
    active: ball.lastShot === 'attack' && !pointEnd && !winner && speed > 1,
    angle: Math.atan2(ball.vy, ball.vx),
    length: ball.r * (1.12 + strength * 0.43),
    width: ball.r * (0.97 - strength * 0.09)
  };
}

function ballGlowColor() {
  if (pointEnd || winner) return null;
  if (ball.specialShot === 'powerReceive') return '#44f07a';
  if (ball.specialShot) return '#399dff';
  return ball.doubleAttack ? '#ff8a24' : ball.quickAttack ? '#ffe13b' : null;
}

function drawAttackBall(shape) {
  const a = shape.length, b = shape.width;
  ctx.save();
  ctx.rotate(shape.angle);
  // A moderate nut-shaped stretch with a distinct but rounded taper.
  ctx.beginPath();
  ctx.moveTo(a, 0);
  ctx.bezierCurveTo(a * 0.79, -b * 0.55, a * 0.55, -b, 0, -b);
  ctx.bezierCurveTo(-a * 0.55, -b, -a * 0.79, -b * 0.55, -a, 0);
  ctx.bezierCurveTo(-a * 0.79, b * 0.55, -a * 0.55, b, 0, b);
  ctx.bezierCurveTo(a * 0.55, b, a * 0.79, b * 0.55, a, 0);
  ctx.closePath();
  ctx.fillStyle = '#fff4d8';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.shadowBlur = 0;
  // Rotate the round texture before stretching it; the outer shape still follows velocity.
  ctx.scale(a, b);
  ctx.rotate(ball.rotation ?? 0);
  if (ballArt.complete && ballArt.naturalWidth) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ballArt, -1.08, -1.08, 2.16, 2.16);
  } else {
    ctx.fillStyle = '#fff4d8';
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3da8db';
    ctx.fillRect(-0.8, -0.2, 1.6, 0.4);
  }
  ctx.restore();
  ctx.strokeStyle = ballGlowColor() ?? '#244c60';
  ctx.lineWidth = .8;
  ctx.stroke();
  ctx.restore();
}

function drawSandParticles() {
  ctx.save();
  for (const p of particles) {
    if (p.kind !== 'sand') continue;
    const remaining = Math.max(0, p.life / p.maxLife);
    if (p.ring) {
      const radius = 12 + (1 - remaining) * p.size;
      ctx.globalAlpha = remaining * 0.7;
      ctx.lineWidth = 1 + remaining * 3;
      ctx.strokeStyle = '#fff0bc';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radius, radius * 0.17, 0, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    if (p.streak) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.globalAlpha = remaining * 0.9;
      ctx.fillStyle = '#fff3cf';
      ctx.beginPath();
      ctx.moveTo(p.size * remaining, 0);
      ctx.lineTo(-p.size * 0.4, -2 * remaining);
      ctx.lineTo(-p.size * 0.2, 2 * remaining);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#c18e48';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.restore();
      continue;
    }
    ctx.globalAlpha = remaining * (p.puff ? (p.event ? 0.6 : 0.3) : 0.85);
    const radius = p.size * (p.puff ? 1 + (1 - remaining) * 1.5 : 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius * (p.puff ? 1.4 : 1), radius, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.puff && p.event) {
      // Layered lobes give the burst the chunky silhouette of an arcade impact cloud.
      ctx.globalAlpha *= 0.7;
      ctx.fillStyle = '#fff0c1';
      ctx.beginPath();
      ctx.ellipse(p.x - radius * 0.25, p.y - radius * 0.3, radius * 0.85, radius * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!p.puff) {
      ctx.globalAlpha *= 0.7;
      rect(p.x - 0.5, p.y - 1, 1, 1, '#fff7dc');
    }
  }
  ctx.restore();
}

function ballTrailStyle() {
  const speedSq = ball.vx * ball.vx + ball.vy * ball.vy;
  if (speedSq <= 90000) return { count: 0, alpha: 0 };
  const speed = Math.sqrt(speedSq);
  const strength = Math.min(1, (speed - 300) / 660);
  return { count: Math.ceil(3 + strength * 11), alpha: strength * 0.45 };
}

function drawBallTrail(shotShape) {
  const style = ballTrailStyle();
  const count = Math.min(style.count, ball.trail.length);
  // Paint oldest first so the strongest afterimages sit immediately behind the ball.
  for (let i = count - 1; i >= 0; i--) {
    const p = ball.trail[i];
    const fade = 1 - i / count;
    ctx.save();
    ctx.globalAlpha = style.alpha * fade * fade;
    ctx.translate(p.x, p.y);
    const scale = 0.65 + fade * 0.35;
    ctx.scale(scale, scale);
    if (shotShape.active) {
      drawAttackBall(shotShape);
    } else if (ballArt.complete && ballArt.naturalWidth) {
      ctx.rotate(p.rotation ?? 0);
      ctx.imageSmoothingEnabled = true;
      const size = ball.r * 2.16;
      ctx.drawImage(ballArt, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = ballGlowColor() ?? '#fff7df';
      ctx.beginPath();
      ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawBallAndParticles() {
  const shotShape = attackBallShape();
  const glowColor = ballGlowColor();
  // A soft contact shadow gives the illustrated ball a readable height above sand.
  const height = Math.max(0, FLOOR - ball.y - ball.r);
  const shadowScale = Math.max(0.4, 1 - height / 300);
  ctx.save();
  ctx.fillStyle = '#214d48';
  ctx.globalAlpha = 0.05 + shadowScale * 0.16;
  ctx.beginPath();
  ctx.ellipse(ball.x, FLOOR + 3, ball.r * 1.15 * shadowScale, 3 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawBallTrail(shotShape);

  ctx.save();
  ctx.translate(ball.x, ball.y);
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 25;
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.arc(0, 0, 17 + Math.sin(time * 18) * 2, 0, 7);
    ctx.fill();
  }
  if (shotShape.active) {
    drawAttackBall(shotShape);
  } else {
    ctx.rotate(ball.rotation ?? 0);
    if (ballArt.complete && ballArt.naturalWidth) {
      // Compensate for the atlas padding while keeping the visible radius at 12px.
      const size = ball.r * 2.16;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(ballArt, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = glowColor ?? '#fff9dc';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#e77a43';
      ctx.fillRect(-10, -3, 20, 6);
      ctx.fillStyle = glowColor ?? '#4c8f9b';
      ctx.fillRect(-3, -10, 6, 20);
    }
  }
  ctx.restore();

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.kind === "sand") continue;
    if (p.kind === "spark") {
      const remaining = Math.max(0, p.life / (p.maxLife || 0.25));
      ctx.save();
      ctx.globalAlpha = remaining;
      ctx.fillStyle = p.color || "#fff";
      const sz = Math.max(1, (p.size || 3) * remaining);
      ctx.translate(Math.round(p.x), Math.round(p.y));
      ctx.rotate(time * 12);
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    } else {
      rect(p.x, p.y, 4, 4, p.color || "#fff5c9");
    }
  }
}

let calloutInk = null;

function drawMatchCallout(isPaused) {
  ctx.save();
  const isHostWaiting = Boolean(window.matchLobby?.isWaitingForHost);
  const centerY = isPaused ? 280 : 192;
  const accent = isHostWaiting ? '#ffb347' : isPaused ? '#70d9ef' : '#ff956e';
  if (isPaused) rect(0, 0, VIEW_W, H, '#061c2c99');
  ctx.translate(VIEW_W / 2, centerY);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Broadcast-style separators and angled team-colour accents.
  ctx.fillStyle = '#102f43e8';
  ctx.beginPath();
  ctx.moveTo(-184, -57);ctx.lineTo(198, -57);
  ctx.lineTo(184, -33);ctx.lineTo(-198, -33);ctx.closePath();ctx.fill();
  ctx.font = '700 11px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#e4eee4';
  const subTitle = isHostWaiting
    ? 'SUNSET RALLY  /  HOST DISCONNECTED'
    : isPaused ? 'SUNSET RALLY  /  TIME OUT' : 'SUNSET RALLY  /  NEXT SERVE';
  ctx.fillText(subTitle, 0, -45);
  ctx.font = 'italic 900 72px "Barlow Condensed", Impact, sans-serif';
  const title = isHostWaiting ? 'WAITING' : isPaused ? 'PAUSED' : serveState ? 'SERVE' : 'READY?';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#102f43';ctx.lineWidth = 9;
  ctx.strokeText(title, 0, 5);
  ctx.fillStyle = accent;ctx.fillText(title, 3, 9);
  if (!calloutInk) {
    calloutInk = ctx.createLinearGradient(0, -30, 0, 34);
    calloutInk.addColorStop(0, '#ffffff');
    calloutInk.addColorStop(1, '#fff0cc');
  }
  ctx.fillStyle = calloutInk;ctx.fillText(title, 0, 3);

  ctx.save();
  ctx.transform(1, 0, -0.5, 1, 0, 0);
  rect(-151, 47, 147, 4, '#ff956e');
  rect(4, 47, 147, 4, '#70d9ef');
  ctx.restore();
  ctx.font = '700 12px "Noto Sans JP", sans-serif';
  ctx.lineWidth = 4;ctx.strokeStyle = '#102f43';
  const hint = isHostWaiting
    ? 'ホストが切断されました。復帰を待機しています…'
    : isPaused
      ? (window.matchLobby?.online ? 'ホストの SPACE で再開' : 'SPACE で再開')
      : serveState ? 'A トス → ↑ ジャンプ → A 打球 / B 地上サーブ' : 'まもなくサーブ';
  ctx.strokeText(hint, 0, 72);ctx.fillStyle = '#fff9e5';ctx.fillText(hint, 0, 72);
  ctx.restore();
}

function scoreboardPresentation() {
  const live = running && !winner && !pointEnd && serveTimer <= 0;
  const elapsed = pointEnd ? Math.max(0, POINT_PAUSE - pointEnd.time) : 0;
  const reveal = pointEnd ? 1 - Math.pow(1 - Math.min(1, elapsed / 0.22), 3) : live ? 0 : 1;
  return { y: 4 + 14 * reveal, alpha: 0.68 + 0.32 * reveal, elapsed };
}

let hudLeftTint = null;
let hudRightTint = null;

function drawHud() {
  if (characterCheck) {
    if (paused) drawMatchCallout(true);
    return;
  }
  ctx.save();
  const presentation = scoreboardPresentation();
  ctx.save();
  ctx.globalAlpha = presentation.alpha;
  const x = 365, y = presentation.y, width = 470, height = 88;
  const coral = '#ff956e', blue = '#70d9ef';
  ctx.fillStyle = '#12334740';
  ctx.beginPath();ctx.roundRect(x + 3, y + 4, width, height, 8);ctx.fill();
  ctx.fillStyle = '#102f43';
  ctx.beginPath();ctx.roundRect(x, y, width, height, 8);ctx.fill();
  ctx.strokeStyle = '#eff9e980';ctx.lineWidth = 1;ctx.stroke();

  ctx.save();
  ctx.beginPath();ctx.roundRect(x, y, width, height, 8);ctx.clip();
  if (!hudLeftTint) {
    hudLeftTint = ctx.createLinearGradient(x, 0, x + 155, 0);
    hudLeftTint.addColorStop(0, '#8e453f');
    hudLeftTint.addColorStop(1, '#263f4a');
    hudRightTint = ctx.createLinearGradient(x + width - 155, 0, x + width, 0);
    hudRightTint.addColorStop(0, '#213f51');
    hudRightTint.addColorStop(1, '#176a85');
  }
  ctx.fillStyle = hudLeftTint;ctx.fillRect(x, y + 22, 155, height - 22);
  ctx.fillStyle = hudRightTint;ctx.fillRect(x + width - 155, y + 22, 155, height - 22);
  rect(x, y + 22, 4, height - 22, coral);
  rect(x + width - 4, y + 22, 4, height - 22, blue);
  rect(x, y + 21, width, 1, '#f2f5db25');
  ctx.restore();

  // Thin broadcast header, clear team names, and large central numerals.
  ctx.textBaseline = 'middle';ctx.textAlign = 'left';
  ctx.fillStyle = '#a5e3ca';ctx.beginPath();ctx.arc(x + 14, y + 11, 2.5, 0, Math.PI * 2);ctx.fill();
  ctx.font = '700 9px "Noto Sans JP", sans-serif';ctx.fillStyle = '#dcece6';
  ctx.fillText('SUNSET RALLY', x + 23, y + 11);
  ctx.textAlign = 'right';ctx.fillStyle = '#aec9cc';
  ctx.fillText(`FIRST TO ${WINNING_SCORE}`, x + width - 13, y + 11);
  ctx.textAlign = 'center';ctx.fillStyle = winner ? '#ffe58e' : '#eef8e7';
  const isHostWaiting = Boolean(window.matchLobby?.isWaitingForHost);
  const matchStatus = isHostWaiting ? 'WAITING HOST' : winner ? (score[0] >= WINNING_SCORE ? 'CORAL WINS' : 'BLUE WINS')
    : paused ? 'PAUSED' : pointEnd ? `${pointEnd.side ? 'BLUE' : 'CORAL'} +1`
    : Math.max(...score) === WINNING_SCORE - 1 ? 'MATCH POINT' : '2 ON 2';
  ctx.font = '800 10px "Barlow Condensed", sans-serif';
  ctx.fillText(matchStatus, 600, y + 11);

  for (let side = 0; side < 2; side++) {
    const teamX = side ? 757 : 443;
    const tint = side ? blue : coral;
    ctx.fillStyle = tint;ctx.font = 'italic 900 22px "Barlow Condensed", Impact, sans-serif';
    ctx.fillText(side ? 'BLUE TIDE' : 'CORAL CLUB', teamX, y + 44);
    // Eleven quiet ticks show progress toward the winning score.
    for (let i = 0; i < WINNING_SCORE; i++) {
      rect(teamX - 53 + i * 10, y + 68, 7, 3, i < score[side] ? tint : '#d7e8e326');
    }
    const scoreX = side ? 642 : 558;
    const scored = pointEnd && pointEnd.side === side;
    const elapsed = scored ? presentation.elapsed : 1;
    const pop = elapsed < 0.22 ? 1 + Math.sin(elapsed / 0.22 * Math.PI) * 0.1 : 1;
    ctx.save();ctx.translate(scoreX, y + 53);ctx.scale(pop, pop);
    ctx.font = '900 51px "Barlow Condensed", Impact, sans-serif';
    ctx.fillStyle = '#061c2c';ctx.fillText(String(score[side]).padStart(2, '0'), 1, 3);
    if (scored) {
      // A warm/cool halo pulses only around the scorer's digits, then settles.
      const fade = Math.max(0, 1 - elapsed / POINT_PAUSE);
      const glow = fade * (0.65 + 0.35 * Math.cos(elapsed * Math.PI * 6));
      ctx.shadowColor = tint;
      ctx.shadowBlur = 6 + 25 * glow;
      ctx.fillStyle = tint;
      ctx.fillText(String(score[side]).padStart(2, '0'), 0, 0);
      ctx.shadowBlur = 15 * glow;
    }
    ctx.fillStyle = '#fff9e5';ctx.fillText(String(score[side]).padStart(2, '0'), 0, 0);
    ctx.restore();
  }
  rect(599, y + 39, 2, 28, '#92b6bf45');
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';

  if (paused || isHostWaiting) {
    drawMatchCallout(true);
  } else if (running && serveTimer > 0 && (!serveState || serveState.phase === 'holding')) {
    drawMatchCallout(false);
  }
  ctx.restore();
}

function drawBallTracker() {
  if (!ball || !running || winner) return;

  const screenX = (ball.x - camera.x) * camera.zoom;
  const screenY = (ball.y - camera.y) * camera.zoom;
  const thresholdY = 114;
  if (screenY >= thresholdY) return;

  const alpha = Math.min(1, Math.max(0, (thresholdY - screenY) / 20));
  if (alpha <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  const bubbleR = 13;
  const clampedX = Math.max(bubbleR + 14, Math.min(VIEW_W - bubbleR - 14, screenX));
  const bubbleY = 120;

  const glow = ballGlowColor();

  // 1. Upward indicator arrow above the bubble (larger with smooth bobbing animation and crisp dark outline)
  const bob = Math.sin(time * 6.5) * 3;
  const pulse = 1 + Math.sin(time * 6.5) * 0.08;
  const arrowY = bubbleY - bubbleR - 10 + bob;
  const arrowColor = glow || (ball.vy > 40 ? '#ffaa5e' : '#5be7ff');

  ctx.save();
  ctx.translate(clampedX, arrowY);
  ctx.scale(pulse, pulse);

  // Solid upward triangle arrow (16px wide, 11.5px tall)
  ctx.beginPath();
  ctx.moveTo(0, -7.5);
  ctx.lineTo(8, 4);
  ctx.lineTo(-8, 4);
  ctx.closePath();

  // Dark outline for high visibility against bright sky & clouds
  ctx.strokeStyle = '#061724';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.fillStyle = arrowColor;
  ctx.shadowColor = glow || arrowColor;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.restore();

  // 2. Speech bubble underneath the arrow enclosing the ball
  ctx.save();
  ctx.shadowColor = '#020b1299';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  ctx.beginPath();
  ctx.arc(clampedX, bubbleY, bubbleR, 0.35 * Math.PI, 0.65 * Math.PI, true);
  ctx.lineTo(clampedX, bubbleY + bubbleR + 5);
  ctx.closePath();
  ctx.fillStyle = '#0c2638f2';
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = glow || '#3da8db';
  ctx.lineWidth = glow ? 2 : 1.5;
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
  }
  ctx.stroke();
  ctx.restore();

  // 3. Mini ball icon inside the bubble
  const iconR = 7.5;
  ctx.save();
  ctx.translate(clampedX, bubbleY);
  ctx.rotate(ball.rotation ?? 0);

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
  }

  if (ballArt.complete && ballArt.naturalWidth) {
    const sz = iconR * 2.16;
    ctx.drawImage(ballArt, -sz / 2, -sz / 2, sz, sz);
  } else {
    ctx.fillStyle = glow || '#fff9dc';
    ctx.beginPath();
    ctx.arc(0, 0, iconR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e77a43';
    ctx.fillRect(-iconR * 0.8, -iconR * 0.25, iconR * 1.6, iconR * 0.5);
  }
  ctx.restore();

  ctx.restore();
}

function draw() {
  ctx.save();
  ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  drawScenery();

  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  drawWorldTerrain();
  drawSandParticles();
  drawSpecialDim();
  drawSpecialAfterimages();
  drawPlayers(1);
  drawNet();
  drawPlayers(0);
  players.forEach(drawPlayerFootLabel);
  drawSpecialShockwave();
  drawBallAndParticles();

  ctx.restore();

  drawActionPops();
  drawHud();
  drawBallTracker();
  ctx.restore();
}

function loop(now) {
  const dt = Math.min((now - last) / 1000 || 0, 0.033);
  last = now;
  window.matchLobby?.tick(now);
  if (!window.matchLobby?.guest) update(dt);
  else updateGuestVisuals(dt);
  if (!paused && !window.matchLobby?.isWaitingForHost) updateCamera(dt);
  draw();
  requestAnimationFrame(loop);
}

function updateGuestVisuals(dt) {
  updateSpecialActivation(dt);
  updateParticles(dt);
  if (ball) recordBallTrail();
  for (const p of players) {
    emitKnockbackSlideSand(p, dt);
    if (p.actionPop) {
      p.actionPop.age += dt * GAME_FPS;
      if (p.actionPop.age >= ACTION_POP_FRAMES) p.actionPop = null;
    }
  }
}

function spawnGuestHitParticles() {
  if (!ball) return;
  const color = ball.specialShot === 'powerReceive' ? '#4dfa7c' : ball.specialShot ? '#80dfff' : null;
  spawnHitParticles(ball.x, ball.y, color, 8);
}

reset();
requestAnimationFrame(loop);

// Host owns physics; guests only apply snapshots and send their own controller.
window.rallyGame = {
  frameRules() {
    const referenceBall = { x: 61, y: 320, r: 12 };
    const referenceServes = Object.fromEntries(['fast', 'high', 'slow', 'power'].map(variant => {
      const velocity = serveVelocity(referenceBall, 0, variant);
      return [variant, Math.hypot(velocity.vx, velocity.vy)];
    }));
    return { fps: GAME_FPS, rules: FRAME_RULES, recovery: ACTION_RECOVERY_FRAMES,
      speeds: { attack: ATTACK_SPEED, quick: QUICK_SPEED, chargeMultiplier: 1 + ATTACK_CHARGE_BONUS,
        empoweredMultiplier: SPECIAL_RULES.empoweredSpeed, toss: TOSS_SPEEDS.normal,
        highToss: TOSS_SPEEDS.high, powerReceive: TOSS_SPEEDS.powerReceive, mozuDive: SPECIAL_RULES.mozuDiveSpeed, referenceServes, quickMax: QUICK_MAX_SPEED, quickDrive: QUICK_DRIVE, empoweredMax: 1350 },
      knockback: { ...KNOCKBACK_RULES, empowered: SPECIAL_RULES.knockback, empoweredGround: SPECIAL_RULES.knockbackGround, impactRecovery: SPECIAL_RULES.impactRecovery } };
  },
  start() { reset(); running = true; beginServe(0); window.rallyAudio?.unlock(); getArenaElement('#overlay')?.classList.add('hidden'); updateFullscreenUI(); },
  stop() { reset(); keys.clear(); updateFullscreenUI(); },
  pause() { if (running) { paused = !paused; status(); } },
  syncAssignments() {
    if (window.matchLobby?.online && !window.matchLobby.guest) {
      for (let i = 0; i < players.length; i++) {
        players[i].human = window.matchLobby.assignment(i);
      }
    }
  },
  get isWaitingForHost() { return Boolean(window.matchLobby?.isWaitingForHost); },
  controller() { return readController(1, navigator.getGamepads?.() || []); },
  ballTrackerState() {
    if (!ball) return null;
    const screenX = (ball.x - camera.x) * camera.zoom;
    const screenY = (ball.y - camera.y) * camera.zoom;
    const thresholdY = 114;
    return {
      active: screenY < thresholdY,
      screenX,
      screenY,
      alpha: screenY < thresholdY ? Math.min(1, Math.max(0, (thresholdY - screenY) / 20)) : 0,
      vy: ball.vy
    };
  },
  testSetBall(props) {
    if (ball && props) Object.assign(ball, props);
  },
  characterCheckActive() { return characterCheck; },
  getCheckMode() { return checkMode; },
  setCheckMode(targetMode) { setCheckMode(targetMode); },
  startCharacterCheck(targetMode) { startCharacterCheck(targetMode); },
  snapshot() {
    return { players, ball: ball ? { ...ball, lastHitter: ball.lastHitter ? (ball.lastHitter.index ?? players.indexOf(ball.lastHitter)) : -1, trail: [] } : null,
      score, running, paused, winner, serveTimer, serveState, serveTurns, time, shake, pointEnd, audioEvents,
      characterCheck, checkMode, checkIncomingLabel, checkBallResetTimer,
      specialActivation: specialActivation ? { ...specialActivation, player: undefined } : null };
  },
  apply(s) {
    // Snapshots repeat recent events so dropped frames do not lose a hit sound.
    // Sequence numbers prevent duplicates; old sounds are skipped after a stall.
    for (const event of s.audioEvents || []) {
      if (event.id <= receivedAudioSequence) continue;
      receivedAudioSequence = event.id;
      if (s.time - event.time < 0.5) {
        window.rallyAudio?.play(event.name);
        if (['attack', 'receive', 'powerReceive', 'set', 'double', 'quick', 'mozu', 'empowered', 'block', 'feint', 'loop'].includes(event.name)) {
          spawnGuestHitParticles();
        }
      }
    }
    players = s.players;
    for (let i = 0; i < players.length; i++) players[i].index = i;
    const oldTrail = ball?.trail;
    ball = s.ball;
    if (ball) {
      ball.lastHitter = players[ball.lastHitter] || null;
      ball.trail = oldTrail || [];
    }
    score = s.score; running = s.running; paused = s.paused; winner = s.winner;
    serveTimer = s.serveTimer; time = s.time; shake = s.shake;
    particles = s.particles ?? particles;
    pointEnd = s.pointEnd;
    if (s.specialActivation) {
      specialActivation = { ...s.specialActivation, player: players[s.specialActivation.playerIndex] || players[0] };
    } else if (!window.matchLobby?.guest) {
      // host keeps local
    } else {
      specialActivation = null;
    }
    serveState = serveTimer > 0 ? (s.serveState ?? null) : null;
    serveTurns = s.serveTurns ?? [0, 0];
    if (winner) setOverlay(score[0] >= WINNING_SCORE ? 'CORAL WINS!' : 'BLUE WINS!', 'ロビーで次の試合の担当を決めましょう。', 'LOBBY ');
    else getArenaElement('#overlay')?.classList.toggle('hidden', running);
    status();
    updateFullscreenUI();
  },
  toggleFullscreen,
  isFullscreen: isFullscreenArena,
  shouldLockScroll: shouldLockArenaScroll,
  requestFullscreen: requestFullscreenArena,
  exitFullscreen: exitFullscreenArena,
  togglePopout,
  isPopoutActive,
  requestPopout: requestPopoutArena,
  restorePopout: restorePopoutArena
};
