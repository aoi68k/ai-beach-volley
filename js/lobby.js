/* Room authority stays with the host. Peers can submit only their own input. */
(() => {
  'use strict';
  const $ = id => {
    const el = document.getElementById(id);
    if (el) return el;
    const popDoc = window.rallyPopout?.getPopoutDocument?.();
    if (popDoc) return popDoc.getElementById(id);
    return null;
  };
  const game = window.rallyGame;
  let invited = new URL(location.href).searchParams.get('room');
  const participantView = () => !!invited || guest;
  const names = ['コーラル / 男性', 'コーラル / 女性', 'ブルー / 男性', 'ブルー / 女性'];
  const idle = () => ({ move: 0, jump: false, up: false, shot: false, set: false, down: false });
  let owners = [1, 0, 0, 0], members = [], peer, hostConnection;
  let online = false, guest = false, playing = false, self = '', room = '';
  let nextSend = 0, lastHost = 0, epoch = 0, connectionTimer;
  let hostWaiting = false, hostReconnectTimer = null, hostTimeoutTimer = null;
  const disconnectedSlots = new Set();
  const connections = new Map(), inputs = new Map();

  // --- Gamepad Navigation State ---
  let gamepadDetected = false;
  let mockGamepadDetected = null;
  let navRow = -1, navCol = -1;
  let currentFocusElement = null;
  let lastGamepadNav = { a: false, b: false, up: false, down: false, left: false, right: false };
  let padRepeatTimer = 0, padRepeatDir = null;
  const message = (text, type = 'info') => {
    const el = $('lobby-message');
    if (!el) return;
    el.textContent = text;
    el.className = 'lobby-message' + (type ? ` is-${type}` : '');
  };
  function send(c, data) {
    if (!c?.open) return;
    try {
      if (c.dataChannel && c.dataChannel.bufferedAmount > 65536) return;
      c.send(data);
    } catch (e) {
      // Ignore transient buffer/send errors to keep the game loop alive
    }
  }
  function broadcast(data) { for (const c of connections.values()) send(c, data); }
  function roomState() { return { type: 'lobby', members, owners, playing }; }
  function sync() { broadcast(roomState()); render(); }
  function render() {
    const participant = participantView();
    $('character-check').disabled = online || participant;
    document.querySelectorAll('#modes button').forEach(button => { button.disabled = online || participant; });
    for (const id of ['launch-match', 'lobby-tabs', 'local-mode', 'host-room', 'close-lobby']) {
      $(id).hidden = participant;
    }
    const leaveLobbyBtn = $('leave-lobby');
    if (leaveLobbyBtn) leaveLobbyBtn.hidden = !participant;
    $('player-slots').hidden = false;
    $('room-code').disabled = online || !!invited;
    $('room-code').readOnly = !!invited;
    $('room-details').hidden = !online || participant;
    $('lobby-title').textContent = participant ? 'JOIN MATCH' : 'PLAYER SETUP';
    $('lobby-intro').hidden = !participant;
    $('lobby-intro').textContent = participant
      ? (online ? 'ホストが操作担当を決めて試合を開始します。' : '招待された部屋へオンラインで参加します。')
      : '';
    $('lobby-notes').textContent = participant
      ? 'ホストが開始するとゲーム画面へ切り替わります。操作は矢印 / Z・X、またはゲームパッド1です。'
      : 'オンラインでは各端末の1P操作（矢印 / Z・X、またはゲームパッド1）を使用。開始・一時停止はホストが操作します。接続できないネットワークでは別回線をお試しください。';
    $('local-mode').ariaPressed = String(!online);
    $('host-room').ariaPressed = String(online && !guest);
    $('player-slots').replaceChildren();
    const choices = online ? members.map((m, i) => [m.id, `${i + 1}P${m.id === self ? '（あなた）' : ''}${i === 0 ? ' / ホスト' : ''}`]) : [1, 2, 3, 4].map(n => [n, `${n}P / この端末`]);
    const pendingAssignment = participant && !(online && room && members.length);

    const coralBanner = document.createElement('div');
    coralBanner.className = 'team-side-banner team-coral-banner';
    coralBanner.setAttribute('aria-hidden', 'true');
    coralBanner.innerHTML = '<span class="team-banner-label">CORAL TEAM</span>';

    const coralCards = document.createElement('div');
    coralCards.className = 'team-cards-group coral-cards-group';

    const vsDivider = document.createElement('div');
    vsDivider.className = 'slots-vs-divider';
    vsDivider.setAttribute('aria-hidden', 'true');
    vsDivider.innerHTML = '<div class="vs-line"></div><span class="vs-badge">VS</span><div class="vs-line"></div>';

    const blueCards = document.createElement('div');
    blueCards.className = 'team-cards-group blue-cards-group';

    const blueBanner = document.createElement('div');
    blueBanner.className = 'team-side-banner team-blue-banner';
    blueBanner.setAttribute('aria-hidden', 'true');
    blueBanner.innerHTML = '<span class="team-banner-label">BLUE TEAM</span>';

    names.forEach((name, index) => {
      const mine = online ? !!self && owners[index] === self : !participant && owners[index] === 1;
      const card = document.createElement(participant ? 'article' : 'label');
      card.className = `player-card team-${index < 2 ? 'coral' : 'blue'}${mine ? ' is-you' : ''}`;
      card.setAttribute('aria-label', `${name}${mine ? '、あなたの担当' : ''}`);
      const title = document.createElement('strong');
      title.className = 'sr-only';
      title.textContent = name;
      const marker = document.createElement('span'); marker.className = 'player-you-marker';
      marker.textContent = mine ? '▼ YOU' : '';
      marker.setAttribute('aria-hidden', String(!mine));
      const art = document.createElement('div'); art.className = 'character-portrait';
      const avatar = window.avatarManager?.getPlayerAvatar(index);
      const isCustomAvatar = avatar && avatar.type !== 'builtin';
      if (isCustomAvatar && (avatar.portraitUrl || avatar.sheetUrl)) {
        art.classList.add('is-avatar-portrait');
        art.style.backgroundImage = `url("${avatar.portraitUrl || avatar.sheetUrl}")`;
      } else {
        art.classList.remove('is-avatar-portrait');
        art.style.backgroundImage = `url("assets/characters/${['coral-male', 'coral-female', 'blue-male', 'blue-female'][index]}-run-selected.png")`;
        art.style.backgroundPosition = '';
        art.style.backgroundSize = '';
        art.style.backgroundRepeat = '';
      }
      card.append(title, marker, art);
      if (participant) {
        const owner = document.createElement('p'); owner.className = 'player-owner';
        owner.textContent = pendingAssignment ? '参加後にホストが指定'
          : !owners[index] ? 'COM' : choices.find(([value]) => value === owners[index])?.[1] ?? '未割当';
        card.append(owner);
        if (index < 2) coralCards.append(card); else blueCards.append(card);
        return;
      }

      const avatarBtn = document.createElement('button');
      avatarBtn.type = 'button';
      avatarBtn.className = 'avatar-toggle-btn';
      avatarBtn.setAttribute('aria-label', `${name}のアバター切り替え`);
      avatarBtn.setAttribute('title', 'クリックでアバターを切り替え');
      const avatarName = isCustomAvatar ? avatar.name : '標準';
      avatarBtn.innerHTML = `<span class="avatar-tag">姿:</span> <span class="avatar-current-name">${avatarName}</span>`;
      avatarBtn.disabled = playing;
      avatarBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.rallyAudio?.play('uiSelect');
        const list = window.avatarManager?.getAvatars() ?? [];
        if (!list.length) return;
        const curId = avatar?.id || 'default';
        const curIdx = list.findIndex(a => a.id === curId);
        const next = list[(curIdx + 1) % list.length];
        window.avatarManager?.setPlayerAvatar(index, next.id);
        render();
      };
      card.append(avatarBtn);
      const select = document.createElement('select'); select.setAttribute('aria-label', `${name}の操作担当`);
      for (const [value, label] of [[0, 'COM'], ...choices]) {
        const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = String(owners[index]) === String(value); select.append(option);
      }
      select.disabled = participant || playing;
      select.onchange = () => {
        window.rallyAudio?.play('uiSelect');
        const value = online ? (select.value === '0' ? 0 : select.value) : Number(select.value);
        owners = owners.map((v, i) => i === index ? value : (value && v === value ? 0 : v));
        if (online) sync(); else render();
      };
      card.append(select);
      if (index < 2) coralCards.append(card); else blueCards.append(card);
    });
    $('player-slots').append(coralBanner, coralCards, vsDivider, blueCards, blueBanner);
    $('local-mode').disabled = online || participant;
    $('host-room').disabled = online || participant;
    $('join-room').disabled = online;
    $('join-room').textContent = (online && guest && !room) ? '接続中…' : '参加する';
    $('launch-match').disabled = participant || (online && !room) || playing;
    $('launch-match').textContent = guest ? 'ホストの開始を待っています' : 'この担当で試合開始 ↗';
    const helpEl = $('lobby-help');
    if (helpEl) {
      if (online && (!room || members.length === 0)) {
        helpEl.textContent = '⏳ ホストの部屋に接続しています… 通信の確立をお待ちください。';
        helpEl.className = 'lobby-help is-connecting';
        helpEl.hidden = false;
      } else if (online && room && members.length) {
        helpEl.textContent = `${members.length} / 4人 接続中。ホストが操作担当を指定します。未割当の参加者は観戦できます。`
          + (owners.includes(self) ? ' 金色の枠と「▼ あなた」が自分のキャラです。' : ' 現在、あなたは観戦です。');
        helpEl.className = 'lobby-help is-connected';
        helpEl.hidden = false;
      } else if (participant) {
        helpEl.textContent = '操作担当の設定と試合開始はホストが行います。';
        helpEl.className = 'lobby-help';
        helpEl.hidden = false;
      } else {
        helpEl.textContent = '';
        helpEl.className = 'lobby-help';
        helpEl.hidden = true;
      }
    }
    if (gamepadDetected && $('lobby')?.open && navRow !== -1) {
      const grid = getNavGrid();
      if (grid[navRow]?.[navCol]) applyNavFocus(grid[navRow][navCol]);
      else initLobbyFocus();
    }
  }
  function show() {
    if (!$('lobby').open) $('lobby').showModal();
    render();
    if (gamepadDetected) initLobbyFocus();
  }
  function teardown(note) {
    epoch++; clearTimeout(connectionTimer);
    clearTimeout(hostReconnectTimer); hostReconnectTimer = null;
    clearTimeout(hostTimeoutTimer); hostTimeoutTimer = null;
    hostWaiting = false;
    disconnectedSlots.clear();
    online = false; guest = false; playing = false;
    const previous = peer; peer = null; previous?.destroy();
    connections.clear(); inputs.clear(); hostConnection = null; self = ''; room = ''; members = []; owners = [1, 0, 0, 0];
    game.stop(); render(); if (note) { message(note, 'error'); show(); }
  }
  function resumeFromHostWaiting() {
    if (!hostWaiting) return;
    hostWaiting = false;
    clearTimeout(hostReconnectTimer); hostReconnectTimer = null;
    clearTimeout(hostTimeoutTimer); hostTimeoutTimer = null;
    message('ホストが復帰しました。試合を再開します。');
  }
  function tryHostReconnect() {
    if (!hostWaiting || !guest || !online) return;
    if (peer?.disconnected && !peer.destroyed) {
      try { peer.reconnect(); } catch (_) {}
    }
    if (peer && !peer.destroyed && room) {
      try {
        const c = peer.connect(room, { reliable: true, serialization: 'json' });
        attach(c, epoch);
        hostConnection = c;
      } catch (_) {}
    }
    hostReconnectTimer = setTimeout(tryHostReconnect, 2500);
  }
  function handleHostLost(reason) {
    if (!guest || !playing) {
      teardown(reason || 'ホストとの接続が切れました。招待リンクから再参加してください。');
      return;
    }
    if (hostWaiting) return;
    hostWaiting = true;
    message('ホストとの接続が途切れました。復帰を待機しています…');
    clearTimeout(hostReconnectTimer);
    clearTimeout(hostTimeoutTimer);
    hostTimeoutTimer = setTimeout(() => {
      teardown('ホストが復帰しませんでした。ロビーに戻ります。');
    }, 60000);
    tryHostReconnect();
  }
  function returnToLobby(note) {
    playing = false; inputs.clear(); game.stop(); sync(); show(); message(note);
  }
  const ICE_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ]
  };
  function connect(target) {
    if (typeof Peer === 'undefined') { message('通信ライブラリを読み込めませんでした。ページを再読み込みしてください。', 'error'); return; }
    teardown(); online = true; guest = !!target; const generation = epoch;
    message(guest ? 'ホストの部屋を探して接続しています…（数秒お待ちください）' : '部屋を作成しています…', 'connecting'); render();
    peer = new Peer({ config: ICE_CONFIG, debug: 0 });
    connectionTimer = setTimeout(() => {
      if (generation === epoch) teardown('接続がタイムアウトしました。ホストが部屋を開いているか、部屋コードと回線をご確認ください。');
    }, 20000);
    peer.on('open', id => {
      if (generation !== epoch) return;
      self = id;
      if (guest) {
        message('ホストの部屋を発見しました。通信を確立しています…', 'connecting');
        hostConnection = peer.connect(target, { reliable: true, serialization: 'json' });
        attach(hostConnection, generation);
      } else {
        clearTimeout(connectionTimer); room = id; members = [{ id }]; owners = [id, 0, 0, 0];
        $('invite-link').value = invite(id); message(`部屋コード: ${id} — 招待リンクを相手に送ってください。`, 'success'); render();
      }
    });
    peer.on('connection', c => {
      if (generation !== epoch || guest) { c.close(); return; }
      attach(c, generation);
    });
    peer.on('error', error => {
      if (generation !== epoch) return;
      let reason = '通信エラーが発生しました。';
      if (error.type === 'peer-unavailable') {
        reason = '指定された部屋が見つかりませんでした。ホストが部屋を開いているか、部屋コードをご確認ください。';
      } else if (error.type === 'network') {
        reason = 'ネットワークエラーが発生しました。インターネット接続状況をご確認ください。';
      } else if (error.type === 'server-error' || error.type === 'socket-error' || error.type === 'socket-closed') {
        reason = '接続サーバーとの通信に失敗しました。少し待ってから再度お試しください。';
      } else {
        reason = `接続できませんでした（${error.type || '通信エラー'}）。コードと回線を確認してください。`;
      }
      teardown(reason);
    });
    peer.on('disconnected', () => {
      if (generation !== epoch) return;
      if (peer && !peer.destroyed) {
        try { peer.reconnect(); return; } catch (_) {}
      }
      teardown('接続サービスとの通信が切れました。部屋を作り直してください。');
    });
  }
  function invite(id) { const url = new URL('invite.html', location.href); url.hash = ''; url.searchParams.set('room', id); return url.href; }
  function attach(c, generation) {
    c.on('open', () => {
      if (generation !== epoch) { c.close(); return; }
      if (guest) {
        lastHost = performance.now();
        resumeFromHostWaiting();
        return;
      }
      if (connections.has(c.peer) || members.length >= 4) {
        send(c, { type: 'rejected', reason: '部屋は満員です。' }); setTimeout(() => c.close(), 300); return;
      }
      if (playing) {
        let slot = -1;
        for (const s of disconnectedSlots) {
          if (owners[s] === 0) { slot = s; break; }
        }
        if (slot === -1) {
          slot = [2, 1, 3].find(i => owners[i] === 0);
        }
        if (slot === undefined || slot === -1) {
          send(c, { type: 'rejected', reason: '試合中です。空き枠がありません。' }); setTimeout(() => c.close(), 300); return;
        }
        disconnectedSlots.delete(slot);
        owners[slot] = c.peer;
        connections.set(c.peer, c); members.push({ id: c.peer }); inputs.set(c.peer, { ...idle(), at: performance.now() });
        game.syncAssignments?.();
        send(c, roomState());
        send(c, { type: 'start' });
        send(c, { type: 'state', state: game.snapshot() });
        broadcast(roomState());
        message('参加者が復帰しました。操作を再開します。');
        return;
      }
      connections.set(c.peer, c); members.push({ id: c.peer }); inputs.set(c.peer, { ...idle(), at: performance.now() });
      const slot = [2, 1, 3].find(i => !owners[i]); if (slot !== undefined) owners[slot] = c.peer;
      sync(); message('参加者が接続しました。担当を確認して試合を開始してください。');
    });
    c.on('data', data => {
      if (generation !== epoch || !data || typeof data !== 'object') return;
      if (guest) {
        if (c !== hostConnection && c.peer === room) hostConnection = c;
        else if (c !== hostConnection) return;
        lastHost = performance.now();
        resumeFromHostWaiting();
        if (data.type === 'rejected') { teardown(data.reason); return; }
        if (data.type === 'lobby') {
          clearTimeout(connectionTimer); room = c.peer; members = data.members; owners = data.owners;
          const wasPlaying = playing; playing = data.playing;
          $('invite-link').value = invite(room);
          if (!playing) { game.stop(); show(); message(wasPlaying ? '試合を終了しました。担当を確認してください。' : '接続しました。ホストが担当を決めて開始します。', 'success'); }
          render();
        } else if (data.type === 'start') { playing = true; game.start(); $('lobby').close(); $('game').focus(); }
        else if (data.type === 'state' && playing) game.apply(data.state);
        return;
      }
      if (connections.get(c.peer) !== c) return;
      if (data.type === 'input') {
        const v = data.input;
        if (!v || !Number.isFinite(v.move)) return;
        inputs.set(c.peer, { move: Math.max(-1, Math.min(1, v.move)), jump: v.jump === true, up: v.up === true || v.jump === true, shot: v.shot === true, set: v.set === true, down: v.down === true, at: performance.now() });
      }
    });
    const lost = () => {
      if (generation !== epoch) return;
      if (guest) {
        if (c === hostConnection) {
          handleHostLost('ホストとの接続が切れました。復帰を待機しています…');
        }
        return;
      }
      if (connections.get(c.peer) !== c) return;
      connections.delete(c.peer); inputs.delete(c.peer); members = members.filter(m => m.id !== c.peer);
      const slot = owners.findIndex(id => id === c.peer);
      if (playing) {
        if (slot !== -1) {
          disconnectedSlots.add(slot);
          owners[slot] = 0;
        }
        game.syncAssignments?.();
        broadcast(roomState());
        message('参加者が切断しました。担当キャラをCOMに切り替えました。');
      } else {
        owners = owners.map(id => id === c.peer ? 0 : id);
        returnToLobby('参加者が退出したためロビーに戻りました。空いた担当はCOMになりました。');
      }
    };
    c.on('close', lost); c.on('error', lost);
  }
  window.matchLobby = {
    get online() { return online; }, get guest() { return online && guest; },
    get isWaitingForHost() { return hostWaiting; },
    assignment(index) { return online ? (owners[index] ? index + 1 : 0) : owners[index]; },
    label(index) { const owner = owners[index]; return !owner ? 'COM' : `${online ? members.findIndex(m => m.id === owner) + 1 : owner}P`; },
    preset(values) { if (!online) { owners = [...values]; render(); } },
    show() {
      if (online && playing) {
        if (guest) { message('ホストがRキーでロビーに戻れます。'); show(); return; }
        returnToLobby('次の試合の担当を確認してください。');
      } else { game.stop(); playing = false; show(); }
    },
    input(human) {
      const owner = owners[human - 1];
      if (owner === self) return $('lobby').open ? idle() : game.controller();
      const value = inputs.get(owner); return value && performance.now() - value.at < 500 ? value : idle();
    },
    command(code) {
      if (guest) {
        if (hostWaiting && (code === 'KeyR' || code === 'Escape')) {
          teardown('ホスト待機を終了し、ロビーに戻りました。');
        }
        return;
      }
      if (code === 'KeyR') returnToLobby('担当を変更して、もう一度試合を始められます。');
      if (code === 'Space') game.pause();
    },
    tick(now) {
      tickGamepadNavigation(now);
      if (!online || now < nextSend) return; nextSend = now + 1000 / 30;
      if (guest) {
        if (room && !hostWaiting && now - lastHost > 5000) {
          handleHostLost('ホストの応答がありません。復帰を待機しています…');
          return;
        }
        if (!hostWaiting) {
          send(hostConnection, { type: 'input', input: $('lobby').open ? idle() : game.controller() });
        }
      } else {
        for (const [id, value] of inputs) if (now - value.at > 15000) { connections.get(id)?.close(); return; }
        broadcast(playing ? { type: 'state', state: game.snapshot() } : { type: 'heartbeat' });
      }
    },
    get gamepadDetected() { return gamepadDetected; },
    setGamepadDetected(val) {
      mockGamepadDetected = val === null ? null : !!val;
      updateGamepadDetection();
    },
    currentFocus() { return currentFocusElement; },
    navPosition() { return { row: navRow, col: navCol }; },
    isOnline() { return online; },
    memberCount() { return members.length; }
  };

  // --- Gamepad Lobby Navigation Implementation ---
  function getNavGrid() {
    const rows = [];
    const tabs = [];
    const localMode = $('local-mode');
    const hostRoom = $('host-room');
    if (localMode && !localMode.hidden && !localMode.disabled) tabs.push(localMode);
    if (hostRoom && !hostRoom.hidden && !hostRoom.disabled) tabs.push(hostRoom);
    if (tabs.length) rows.push(tabs);

    const onlineActions = [];
    const joinBtn = $('join-room');
    const copyBtn = $('copy-invite');
    const leaveRoomBtn = $('leave-room');
    const details = $('room-details');
    if (joinBtn && !joinBtn.hidden && !joinBtn.disabled) onlineActions.push(joinBtn);
    if (details && !details.hidden) {
      if (copyBtn && !copyBtn.hidden && !copyBtn.disabled) onlineActions.push(copyBtn);
      if (leaveRoomBtn && !leaveRoomBtn.hidden && !leaveRoomBtn.disabled) onlineActions.push(leaveRoomBtn);
    }
    if (onlineActions.length) rows.push(onlineActions);

    const selects = Array.from(document.querySelectorAll('#player-slots select')).filter(s => !s.disabled && !s.hidden);
    if (selects.length) rows.push(selects);

    const bottomActions = [];
    const launchBtn = $('launch-match');
    const leaveLobbyBtn = $('leave-lobby');
    if (launchBtn && !launchBtn.hidden && !launchBtn.disabled) bottomActions.push(launchBtn);
    if (leaveLobbyBtn && !leaveLobbyBtn.hidden && !leaveLobbyBtn.disabled) bottomActions.push(leaveLobbyBtn);
    if (bottomActions.length) rows.push(bottomActions);

    return rows;
  }

  function applyNavFocus(el) {
    if (el && currentFocusElement && el !== currentFocusElement && $('lobby')?.open) {
      window.rallyAudio?.play('uiMove');
    }
    document.querySelectorAll('.gamepad-focused').forEach(target => target.classList.remove('gamepad-focused'));
    document.querySelectorAll('.in-btn-a-badge').forEach(badge => badge.remove());

    currentFocusElement = el;
    if (!el || !$('lobby')?.open) return;

    const container = (el.tagName === 'SELECT' || el.classList?.contains('avatar-toggle-btn'))
      ? (el.closest('.player-card') || el) : el;
    container.classList.add('gamepad-focused');

    const aBadge = document.createElement('span');
    aBadge.className = 'pad-btn-badge in-btn-a-badge';
    aBadge.textContent = 'A';
    aBadge.setAttribute('aria-hidden', 'true');

    if (el.tagName === 'SELECT') {
      const card = el.closest('.player-card');
      const strong = card?.querySelector('strong');
      if (strong) strong.prepend(aBadge);
      else card?.prepend(aBadge);
    } else {
      el.prepend(aBadge);
    }

    try {
      el.focus?.({ preventScroll: true });
      container.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    } catch (_) {}
  }

  function initLobbyFocus() {
    const grid = getNavGrid();
    if (!grid.length) return;
    const lastRow = grid[grid.length - 1];
    const launchIdx = lastRow.indexOf($('launch-match'));
    if (launchIdx !== -1) {
      navRow = grid.length - 1;
      navCol = launchIdx;
    } else {
      navRow = 0;
      navCol = 0;
    }
    applyNavFocus(grid[navRow][navCol]);
  }

  function updateGamepadBadges(connected) {
    const startBadge = $('start-gamepad-badge');
    if (startBadge) startBadge.hidden = !connected;
    const closeBadge = $('close-lobby-badge');
    if (closeBadge) closeBadge.hidden = !connected;
  }

  function updateGamepadDetection() {
    let connected = false;
    if (mockGamepadDetected !== null) {
      connected = mockGamepadDetected;
    } else {
      const rawPads = navigator.getGamepads?.() || [];
      for (let i = 0; i < rawPads.length; i++) {
        const pad = rawPads[i];
        if (pad && pad.connected !== false) {
          connected = true;
          break;
        }
      }
    }

    if (connected !== gamepadDetected) {
      gamepadDetected = connected;
      updateGamepadBadges(connected);
      if (connected && $('lobby')?.open && !currentFocusElement) {
        initLobbyFocus();
      } else if (!connected) {
        applyNavFocus(null);
      }
    }
  }

  function readGamepadNavState() {
    const rawPads = navigator.getGamepads?.() || [];
    let a = false, b = false, up = false, down = false, left = false, right = false;

    for (let i = 0; i < rawPads.length; i++) {
      const pad = rawPads[i];
      if (!pad || pad.connected === false) continue;

      const p1 = window.gamepadConfig?.read(1, rawPads);
      if (p1) {
        if (p1.shot) a = true;
        if (p1.set) b = true;
        if (p1.jump) up = true;
        if (p1.down) down = true;
        if (p1.move < -0.45) left = true;
        if (p1.move > 0.45) right = true;
      }

      if (pad.buttons?.[0]?.pressed || pad.buttons?.[0]?.value > 0.5) a = true;
      if (pad.buttons?.[1]?.pressed || pad.buttons?.[1]?.value > 0.5) b = true;
      if (pad.buttons?.[2]?.pressed || pad.buttons?.[2]?.value > 0.5) a = true;

      if (pad.buttons?.[12]?.pressed || pad.buttons?.[12]?.value > 0.5) up = true;
      if (pad.buttons?.[13]?.pressed || pad.buttons?.[13]?.value > 0.5) down = true;
      if (pad.buttons?.[14]?.pressed || pad.buttons?.[14]?.value > 0.5) left = true;
      if (pad.buttons?.[15]?.pressed || pad.buttons?.[15]?.value > 0.5) right = true;

      if (pad.axes?.[0] < -0.45) left = true;
      if (pad.axes?.[0] > 0.45) right = true;
      if (pad.axes?.[1] < -0.45) up = true;
      if (pad.axes?.[1] > 0.45) down = true;
    }

    return { a, b, up, down, left, right };
  }

  function tickGamepadNavigation(now) {
    updateGamepadDetection();
    if (!gamepadDetected) return;

    const current = readGamepadNavState();
    const aPressed = current.a && !lastGamepadNav.a;
    const bPressed = current.b && !lastGamepadNav.b;

    const lobbyEl = $('lobby');
    const isLobbyOpen = lobbyEl && lobbyEl.open;
    const isConfigOpen = $('gamepad-config')?.open;
    const overlayEl = $('overlay');
    const isOverlayOpen = overlayEl && !overlayEl.classList.contains('hidden') && !overlayEl.hidden;
    const isGameActive = Boolean(playing || game?.characterCheckActive?.() || game?.isRunning?.());

    // When lobby is not open and we are on the initial welcome overlay, A button opens PLAYER SETUP
    if (!isLobbyOpen && !isConfigOpen && isOverlayOpen && !isGameActive) {
      if (aPressed) {
        $('start')?.click();
      }
      lastGamepadNav = current;
      return;
    }

    if (isLobbyOpen && !isConfigOpen) {
      if (bPressed) {
        $('close-lobby')?.click();
        lastGamepadNav = current;
        return;
      }

      const grid = getNavGrid();
      if (!grid.length) {
        lastGamepadNav = current;
        return;
      }

      let dRow = 0, dCol = 0;
      const upEdge = current.up && !lastGamepadNav.up;
      const downEdge = current.down && !lastGamepadNav.down;
      const leftEdge = current.left && !lastGamepadNav.left;
      const rightEdge = current.right && !lastGamepadNav.right;

      if (upEdge) dRow = -1;
      else if (downEdge) dRow = 1;
      else if (leftEdge) dCol = -1;
      else if (rightEdge) dCol = 1;
      else if (current.up || current.down || current.left || current.right) {
        if (!padRepeatDir) {
          padRepeatDir = current.up ? 'up' : current.down ? 'down' : current.left ? 'left' : 'right';
          padRepeatTimer = now + 320;
        } else if (now >= padRepeatTimer) {
          padRepeatTimer = now + 160;
          if (padRepeatDir === 'up') dRow = -1;
          else if (padRepeatDir === 'down') dRow = 1;
          else if (padRepeatDir === 'left') dCol = -1;
          else if (padRepeatDir === 'right') dCol = 1;
        }
      } else {
        padRepeatDir = null;
      }

      if (dRow !== 0 || dCol !== 0 || !currentFocusElement) {
        if (navRow < 0 || navRow >= grid.length) navRow = grid.length - 1;
        if (dRow !== 0) {
          navRow = (navRow + dRow + grid.length) % grid.length;
        }
        const rowLen = grid[navRow].length;
        if (navCol < 0 || navCol >= rowLen) navCol = 0;
        if (dCol !== 0) {
          navCol = (navCol + dCol + rowLen) % rowLen;
        }
        navCol = Math.min(navCol, grid[navRow].length - 1);
        applyNavFocus(grid[navRow][navCol]);
      }

      if (aPressed && currentFocusElement) {
        if (currentFocusElement.tagName === 'SELECT') {
          const len = currentFocusElement.options.length;
          if (len > 0) {
            currentFocusElement.selectedIndex = (currentFocusElement.selectedIndex + 1) % len;
            currentFocusElement.dispatchEvent(new Event('change'));
            setTimeout(() => {
              const updatedGrid = getNavGrid();
              if (updatedGrid[navRow]?.[navCol]) {
                applyNavFocus(updatedGrid[navRow][navCol]);
              }
            }, 0);
          }
        } else if (typeof currentFocusElement.click === 'function') {
          currentFocusElement.click();
        }
      }
    }

    lastGamepadNav = current;
  }

  // Keyboard navigation support within lobby dialog
  window.addEventListener('keydown', e => {
    if (!$('lobby')?.open || $('gamepad-config')?.open) return;
    const grid = getNavGrid();
    if (!grid.length) return;

    if (e.key === 'x' || e.key === 'X') {
      if (currentFocusElement?.tagName === 'SELECT') {
        const card = currentFocusElement.closest('.player-card');
        card?.querySelector('.avatar-toggle-btn')?.click();
        return;
      }
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      navRow = (navRow - 1 + grid.length) % grid.length;
      navCol = Math.min(navCol, grid[navRow].length - 1);
      applyNavFocus(grid[navRow][navCol]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navRow = (navRow + 1) % grid.length;
      navCol = Math.min(navCol, grid[navRow].length - 1);
      applyNavFocus(grid[navRow][navCol]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const rowLen = grid[navRow]?.length || 1;
      navCol = (navCol - 1 + rowLen) % rowLen;
      applyNavFocus(grid[navRow][navCol]);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const rowLen = grid[navRow]?.length || 1;
      navCol = (navCol + 1) % rowLen;
      applyNavFocus(grid[navRow][navCol]);
    }
  });

  window.addEventListener('gamepadconnected', () => updateGamepadDetection());
  window.addEventListener('gamepaddisconnected', () => updateGamepadDetection());
  $('lobby')?.addEventListener('close', () => applyNavFocus(null));
  $('start').onclick = () => { window.rallyAudio?.play('uiConfirm'); window.matchLobby.show(); };
  $('lobby').addEventListener('cancel', e => { if (participantView()) e.preventDefault(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && participantView() && $('lobby').open) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true });
  $('close-lobby').onclick = () => { if (!participantView()) { window.rallyAudio?.play('uiCancel'); $('lobby').close(); } };
  const leaveBtn = $('leave-lobby');
  if (leaveBtn) {
    leaveBtn.onclick = () => {
      window.rallyAudio?.play('uiCancel');
      invited = null;
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('room');
          window.history.replaceState(null, '', url.pathname + (url.search || ''));
        } catch (_) {}
      }
      const roomCodeInput = $('room-code');
      if (roomCodeInput) roomCodeInput.value = '';
      teardown();
      $('lobby')?.close?.();
      render();
    };
  }
  $('local-mode').onclick = () => { if (participantView()) return; window.rallyAudio?.play('uiTab'); teardown(); show(); message('この端末の操作担当を選んでください。'); };
  $('host-room').onclick = () => { if (!participantView()) { window.rallyAudio?.play('uiTab'); connect(); } };
  $('join-room').onclick = () => {
    window.rallyAudio?.play('uiConfirm');
    const code = $('room-code').value.trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(code)) { message('招待された部屋コードを入力してください。'); return; }
    connect(code);
  };
  $('leave-room').onclick = () => { window.rallyAudio?.play('uiCancel'); teardown('部屋を退出しました。'); };
  $('copy-invite').onclick = async () => {
    window.rallyAudio?.play('uiConfirm');
    try { await navigator.clipboard.writeText($('invite-link').value); message('招待リンクをコピーしました。'); }
    catch { $('invite-link').select(); message('招待リンクを選択しました。コピーして共有してください。'); }
  };
  $('launch-match').onclick = () => {
    if (participantView() || (online && !room) || playing) return;
    window.rallyAudio?.play('confirm');
    playing = true; game.start(); $('lobby').close(); $('game').focus(); if (online) { sync(); broadcast({ type: 'start' }); }
  };

  window.avatarManager?.onChange(render);

  render();
  if (invited) {
    try {
      const inviteDesc = 'ビーチバレーゲーム、オンラインプレイ招待URL';
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', inviteDesc);
      const twDesc = document.querySelector('meta[name="twitter:description"]');
      if (twDesc) twDesc.setAttribute('content', inviteDesc);
      const inviteImg = new URL('assets/ogp-invite.png', location.href).href;
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) ogImg.setAttribute('content', inviteImg);
      const twImg = document.querySelector('meta[name="twitter:image"]');
      if (twImg) twImg.setAttribute('content', inviteImg);
    } catch (_) {}
    $('room-code').value = invited;
    show();
    message('招待された部屋です。「参加する」を押してください。');
    $('join-room').focus();
  }
})();
