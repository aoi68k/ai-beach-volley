(() => {
  const STORAGE_KEY = 'sunset_rally_gamepad_config_v1';

  const ACTION_DEFINITIONS = [
    { id: 'up', name: '上（ジャンプ）', desc: 'ジャンプ、上方向サーブ' },
    { id: 'down', name: '下', desc: 'しゃがみ、パワーレシーブ、モズ落とし、強化ショット' },
    { id: 'left', name: '左', desc: '左へ移動、後方/前方サーブ' },
    { id: 'right', name: '右', desc: '右へ移動、前方/後方サーブ' },
    { id: 'shot', name: 'A（ショット）', desc: 'レシーブ構え、アタック、サーブトス/強打' },
    { id: 'set', name: 'B（トス / ブロック）', desc: '自陣トス、ブロック構え、地上サーブ' }
  ];

  const BUTTON_LABELS = {
    0: 'ボタン 0 (A / 下)',
    1: 'ボタン 1 (B / 右)',
    2: 'ボタン 2 (X / 左)',
    3: 'ボタン 3 (Y / 上)',
    4: 'ボタン 4 (L1 / LB)',
    5: 'ボタン 5 (R1 / RB)',
    6: 'ボタン 6 (L2 / LT)',
    7: 'ボタン 7 (R2 / RT)',
    8: 'ボタン 8 (Back / Select)',
    9: 'ボタン 9 (Start / Menu)',
    10: 'ボタン 10 (L3)',
    11: 'ボタン 11 (R3)',
    12: '十字キー上',
    13: '十字キー下',
    14: '十字キー左',
    15: '十字キー右'
  };

  function defaultMapping() {
    return {
      up: { type: 'button', index: 12, label: BUTTON_LABELS[12] },
      down: { type: 'button', index: 13, label: BUTTON_LABELS[13] },
      left: { type: 'button', index: 14, label: BUTTON_LABELS[14] },
      right: { type: 'button', index: 15, label: BUTTON_LABELS[15] },
      shot: { type: 'button', index: 2, label: BUTTON_LABELS[2] },
      set: { type: 'button', index: 1, label: BUTTON_LABELS[1] }
    };
  }

  function defaultPlayerConfig(playerIndex) {
    return {
      padIndex: playerIndex, // 0 for 1P, 1 for 2P, 2 for 3P, 3 for 4P
      mapping: defaultMapping()
    };
  }

  function createInitialConfig() {
    return {
      players: {
        1: defaultPlayerConfig(0),
        2: defaultPlayerConfig(1),
        3: defaultPlayerConfig(2),
        4: defaultPlayerConfig(3)
      }
    };
  }

  let config = loadConfig();
  let selectedPlayer = 1;
  let capturingAction = null;
  let captureAnimationId = null;

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createInitialConfig();
      const parsed = JSON.parse(raw);
      const initial = createInitialConfig();
      for (const p of [1, 2, 3, 4]) {
        if (!parsed.players?.[p]) {
          parsed.players = parsed.players || {};
          parsed.players[p] = initial.players[p];
        } else {
          parsed.players[p].mapping = { ...defaultMapping(), ...(parsed.players[p].mapping || {}) };
        }
      }
      return parsed;
    } catch {
      return createInitialConfig();
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }

  function getConnectedGamepads() {
    const rawPads = navigator.getGamepads?.() || [];
    const result = [];
    for (let i = 0; i < rawPads.length; i++) {
      const pad = rawPads[i];
      if (pad && pad.connected !== false) {
        result.push({
          index: i,
          id: pad.id || `Gamepad ${i}`,
          buttonsCount: pad.buttons?.length || 0,
          axesCount: pad.axes?.length || 0
        });
      }
    }
    return result;
  }

  function isActionPressed(pad, binding) {
    if (!pad || !binding) return false;
    if (binding.type === 'button') {
      const btn = pad.buttons?.[binding.index];
      return !!(btn && (btn.pressed || btn.value > 0.5));
    }
    if (binding.type === 'axis') {
      const val = pad.axes?.[binding.axis] ?? 0;
      return binding.dir > 0 ? val > 0.5 : val < -0.5;
    }
    return false;
  }

  function readPlayerGamepad(controller, pads) {
    const playerConf = config.players[controller];
    if (!playerConf || playerConf.padIndex === null || playerConf.padIndex === -1) return null;
    const pad = pads[playerConf.padIndex];
    if (!pad || pad.connected === false) return null;

    const m = playerConf.mapping || DEFAULT_MAPPINGS;
    let move = 0;
    if (Math.abs(pad.axes?.[0] ?? 0) > 0.2) move = pad.axes[0];
    const left = isActionPressed(pad, m.left);
    const right = isActionPressed(pad, m.right);
    if (left || right) move = Number(right) - Number(left);

    const stickUp = (pad.axes?.[1] ?? 0) < -0.5;
    const stickDown = (pad.axes?.[1] ?? 0) > 0.5;
    const jump = stickUp || isActionPressed(pad, m.up);
    const down = stickDown || isActionPressed(pad, m.down);
    const shot = isActionPressed(pad, m.shot);
    const set = isActionPressed(pad, m.set);

    return { move, jump, down, shot, set };
  }

  // --- UI & Dialog Management ---
  function updateStatusBar() {
    const barEl = document.querySelector('#gamepad-status-bar');
    const textEl = document.querySelector('#gamepad-status-text');
    if (!textEl) return;
    const pads = getConnectedGamepads();
    if (pads.length === 0) {
      if (barEl) {
        barEl.classList.add('is-unconnected');
        barEl.classList.remove('is-connected');
      }
      textEl.innerHTML = '<span class="status-unconnected-lead">コントローラー未検出:</span> <span class="status-unconnected-badge">コントローラーのボタンを押すと認識されます</span>';
    } else {
      if (barEl) {
        barEl.classList.remove('is-unconnected');
        barEl.classList.add('is-connected');
      }
      const names = pads.map(p => `#${p.index}: ${p.id.replace(/\s*\(.*?\)/, '')}`).join(' / ');
      textEl.innerHTML = `<span class="status-connected-label">接続中:</span> <strong>${pads.length}台</strong> [ ${names} ]`;
    }
  }

  function renderDialog() {
    updateStatusBar();
    renderTabs();
    renderDeviceSelect();
    renderBindingsTable();
  }

  function renderTabs() {
    const tabs = document.querySelectorAll('.config-tab');
    const pads = getConnectedGamepads();
    tabs.forEach(tab => {
      const p = Number(tab.dataset.player);
      tab.classList.toggle('active', p === selectedPlayer);
      tab.setAttribute('aria-selected', String(p === selectedPlayer));

      const assignedPadIndex = config.players[p]?.padIndex;
      const isConnected = assignedPadIndex !== null && assignedPadIndex !== -1 && pads.some(gp => gp.index === assignedPadIndex);
      let badge = tab.querySelector('.tab-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tab-badge';
        tab.append(badge);
      }
      badge.textContent = isConnected ? '●' : '○';
      badge.title = isConnected ? `Pad #${assignedPadIndex} 接続中` : 'コントローラー未接続 / なし';
      badge.className = `tab-badge ${isConnected ? 'connected' : 'disconnected'}`;
    });
  }

  function renderDeviceSelect() {
    const select = document.querySelector('#gamepad-select');
    if (!select) return;
    const pads = getConnectedGamepads();
    const currentAssigned = config.players[selectedPlayer]?.padIndex;

    select.innerHTML = '';

    // "None" option
    const optNone = document.createElement('option');
    optNone.value = '-1';
    optNone.textContent = 'なし（キーボード操作のみ）';
    select.append(optNone);

    // Connected pads
    pads.forEach(p => {
      const opt = document.createElement('option');
      opt.value = String(p.index);
      opt.textContent = `Gamepad #${p.index}: ${p.id}`;
      select.append(opt);
    });

    // If current assigned pad is not in list (e.g. not connected right now)
    if (currentAssigned !== null && currentAssigned !== -1 && !pads.some(p => p.index === currentAssigned)) {
      const opt = document.createElement('option');
      opt.value = String(currentAssigned);
      opt.textContent = `Gamepad #${currentAssigned} (現在未接続)`;
      select.append(opt);
    }

    select.value = String(currentAssigned ?? (selectedPlayer - 1));
  }

  function renderBindingsTable() {
    const body = document.querySelector('#gamepad-bindings-body');
    if (!body) return;
    body.innerHTML = '';

    const pConf = config.players[selectedPlayer] || defaultPlayerConfig(selectedPlayer - 1);
    const mapping = pConf.mapping || defaultMapping();

    ACTION_DEFINITIONS.forEach(act => {
      const tr = document.createElement('tr');
      const bound = mapping[act.id];
      const boundText = bound ? (bound.label || bound.name || `Button ${bound.index}`) : '未設定';

      tr.innerHTML = `
        <td class="action-name"><b>${act.name}</b></td>
        <td class="action-desc">${act.desc}</td>
        <td class="bound-key"><span class="key-pill" id="key-pill-${act.id}">${boundText}</span></td>
        <td class="action-btn-cell">
          <button class="set-bind-btn" data-action="${act.id}">変更</button>
        </td>
      `;
      body.append(tr);
    });

    body.querySelectorAll('.set-bind-btn').forEach(btn => {
      btn.onclick = () => startCapture(btn.dataset.action);
    });
  }

  function startCapture(actionId) {
    capturingAction = actionId;
    const actDef = ACTION_DEFINITIONS.find(a => a.id === actionId);
    const overlay = document.querySelector('#gamepad-capture-overlay');
    const nameEl = document.querySelector('#capture-action-name');
    if (nameEl) nameEl.textContent = actDef?.name || actionId;
    if (overlay) overlay.hidden = false;

    // Snapshot current button states to avoid triggering on a button already held down
    const pConf = config.players[selectedPlayer];
    const rawPads = navigator.getGamepads?.() || [];
    const pad = pConf && pConf.padIndex !== -1 && rawPads[pConf.padIndex];
    const initialButtons = pad?.buttons?.map(b => b.pressed || b.value > 0.5) || [];

    const poll = () => {
      const currentPads = navigator.getGamepads?.() || [];
      const currentPad = pConf && pConf.padIndex !== -1 && currentPads[pConf.padIndex];
      if (currentPad && currentPad.buttons) {
        for (let i = 0; i < currentPad.buttons.length; i++) {
          const btn = currentPad.buttons[i];
          const pressed = btn && (btn.pressed || btn.value > 0.5);
          if (pressed && !initialButtons[i]) {
            // Found pressed button!
            applyBinding(actionId, {
              type: 'button',
              index: i,
              label: BUTTON_LABELS[i] || `ボタン ${i}`
            });
            stopCapture();
            return;
          }
        }
      }
      captureAnimationId = requestAnimationFrame(poll);
    };

    captureAnimationId = requestAnimationFrame(poll);
  }

  function stopCapture() {
    if (captureAnimationId) {
      cancelAnimationFrame(captureAnimationId);
      captureAnimationId = null;
    }
    capturingAction = null;
    const overlay = document.querySelector('#gamepad-capture-overlay');
    if (overlay) overlay.hidden = true;
  }

  function applyBinding(actionId, binding) {
    if (!config.players[selectedPlayer]) {
      config.players[selectedPlayer] = defaultPlayerConfig(selectedPlayer - 1);
    }
    config.players[selectedPlayer].mapping[actionId] = binding;
    saveConfig();
    window.rallyAudio?.play('uiConfirm');
    renderBindingsTable();
  }

  function setupEventListeners() {
    const openBtn = document.querySelector('#open-gamepad-config');
    const dialog = document.querySelector('#gamepad-config');
    const closeBtn = document.querySelector('#close-gamepad-config');
    const closeFooterBtn = document.querySelector('#close-gamepad-config-btn');
    const cancelCaptureBtn = document.querySelector('#cancel-capture-btn');
    const resetBtn = document.querySelector('#reset-gamepad-config');
    const select = document.querySelector('#gamepad-select');

    openBtn?.addEventListener('click', () => {
      window.rallyAudio?.play('uiConfirm');
      dialog?.showModal();
      renderDialog();
    });

    const closeHandler = () => {
      window.rallyAudio?.play('uiCancel');
      stopCapture();
      dialog?.close();
    };

    closeBtn?.addEventListener('click', closeHandler);
    closeFooterBtn?.addEventListener('click', closeHandler);
    cancelCaptureBtn?.addEventListener('click', () => {
      window.rallyAudio?.play('uiCancel');
      stopCapture();
    });

    document.querySelectorAll('.config-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        window.rallyAudio?.play('uiTab');
        selectedPlayer = Number(tab.dataset.player);
        stopCapture();
        renderDialog();
      });
    });

    select?.addEventListener('change', e => {
      window.rallyAudio?.play('uiSelect');
      const val = Number(e.target.value);
      if (!config.players[selectedPlayer]) {
        config.players[selectedPlayer] = defaultPlayerConfig(selectedPlayer - 1);
      }
      config.players[selectedPlayer].padIndex = val === -1 ? -1 : val;
      saveConfig();
      renderTabs();
    });

    resetBtn?.addEventListener('click', () => {
      window.rallyAudio?.play('uiConfirm');
      if (!config.players[selectedPlayer]) {
        config.players[selectedPlayer] = defaultPlayerConfig(selectedPlayer - 1);
      }
      config.players[selectedPlayer].mapping = defaultMapping();
      saveConfig();
      renderBindingsTable();
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && capturingAction) {
        stopCapture();
        e.preventDefault();
      }
    });

    window.addEventListener('gamepadconnected', () => {
      if (dialog?.open) renderDialog();
    });

    window.addEventListener('gamepaddisconnected', () => {
      if (dialog?.open) renderDialog();
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupEventListeners);
    } else {
      setupEventListeners();
    }
  }

  window.gamepadConfig = {
    read: readPlayerGamepad,
    getConnectedGamepads,
    getConfig() { return config; },
    setConfig(newConfig) { config = newConfig; saveConfig(); },
    reset(p) {
      if (p) config.players[p] = defaultPlayerConfig(p - 1);
      else config = createInitialConfig();
      saveConfig();
    },
    ACTION_DEFINITIONS,
    BUTTON_LABELS
  };
})();
