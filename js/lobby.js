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
    $('lobby-intro').textContent = participant
      ? (online ? 'ホストが操作担当を決めて試合を開始します。' : '招待された部屋へオンラインで参加します。')
      : '4人のキャラを誰が操作する？ 担当を選んでから試合を始めよう。';
    $('lobby-notes').textContent = participant
      ? 'ホストが開始するとゲーム画面へ切り替わります。操作は矢印 / Z・X、またはゲームパッド1です。'
      : 'オンラインでは各端末の1P操作（矢印 / Z・X、またはゲームパッド1）を使用。開始・一時停止はホストが操作します。接続できないネットワークでは別回線をお試しください。';
    $('local-mode').ariaPressed = String(!online);
    $('host-room').ariaPressed = String(online && !guest);
    $('player-slots').replaceChildren();
    const choices = online ? members.map((m, i) => [m.id, `${i + 1}P${m.id === self ? '（あなた）' : ''}${i === 0 ? ' / ホスト' : ''}`]) : [1, 2, 3, 4].map(n => [n, `${n}P / この端末`]);
    const pendingAssignment = participant && !(online && room && members.length);
    names.forEach((name, index) => {
      const mine = online ? !!self && owners[index] === self : !participant && owners[index] === 1;
      const card = document.createElement(participant ? 'article' : 'label');
      card.className = `player-card team-${index < 2 ? 'coral' : 'blue'}${mine ? ' is-you' : ''}`;
      card.setAttribute('aria-label', `${name}${mine ? '、あなたの担当' : ''}`);
      const title = document.createElement('strong'); title.textContent = name;
      const marker = document.createElement('span'); marker.className = 'player-you-marker';
      marker.textContent = mine ? '▼ あなた' : '';
      marker.setAttribute('aria-hidden', String(!mine));
      const art = document.createElement('div'); art.className = 'character-portrait';
      art.style.backgroundImage = `url("assets/characters/${['coral-male', 'coral-female', 'blue-male', 'blue-female'][index]}-run-selected.png")`;
      card.append(title, marker, art);
      if (participant) {
        const owner = document.createElement('p'); owner.className = 'player-owner';
        owner.textContent = pendingAssignment ? '参加後にホストが指定'
          : !owners[index] ? 'COM' : choices.find(([value]) => value === owners[index])?.[1] ?? '未割当';
        card.append(owner);
        $('player-slots').append(card);
        return;
      }
      const select = document.createElement('select'); select.setAttribute('aria-label', `${name}の操作担当`);
      for (const [value, label] of [[0, 'COM'], ...choices]) {
        const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = String(owners[index]) === String(value); select.append(option);
      }
      select.disabled = participant || playing;
      select.onchange = () => {
        const value = online ? (select.value === '0' ? 0 : select.value) : Number(select.value);
        owners = owners.map((v, i) => i === index ? value : (value && v === value ? 0 : v));
        if (online) sync(); else render();
      };
      card.append(select); $('player-slots').append(card);
    });
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
      } else if (online && room && members.length) {
        helpEl.textContent = `${members.length} / 4人 接続中。ホストが操作担当を指定します。未割当の参加者は観戦できます。`
          + (owners.includes(self) ? ' 金色の枠と「▼ あなた」が自分のキャラです。' : ' 現在、あなたは観戦です。');
        helpEl.className = 'lobby-help is-connected';
      } else {
        helpEl.textContent = participant ? '操作担当の設定と試合開始はホストが行います。' : '同じ操作担当は1キャラまで。空いたキャラはCOMにできます。';
        helpEl.className = 'lobby-help';
      }
    }
  }
  function show() { if (!$('lobby').open) $('lobby').showModal(); render(); }
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
  function invite(id) { const url = new URL(location.href); url.hash = ''; url.searchParams.set('room', id); return url.href; }
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
    }
  };
  $('start').onclick = () => window.matchLobby.show();
  $('lobby').addEventListener('cancel', e => { if (participantView()) e.preventDefault(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && participantView() && $('lobby').open) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true });
  $('close-lobby').onclick = () => { if (!participantView()) $('lobby').close(); };
  const leaveBtn = $('leave-lobby');
  if (leaveBtn) {
    leaveBtn.onclick = () => {
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
  $('local-mode').onclick = () => { if (participantView()) return; teardown(); show(); message('この端末の操作担当を選んでください。'); };
  $('host-room').onclick = () => { if (!participantView()) connect(); };
  $('join-room').onclick = () => {
    const code = $('room-code').value.trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(code)) { message('招待された部屋コードを入力してください。'); return; }
    connect(code);
  };
  $('leave-room').onclick = () => teardown('部屋を退出しました。');
  $('copy-invite').onclick = async () => {
    try { await navigator.clipboard.writeText($('invite-link').value); message('招待リンクをコピーしました。'); }
    catch { $('invite-link').select(); message('招待リンクを選択しました。コピーして共有してください。'); }
  };
  $('launch-match').onclick = () => {
    if (participantView() || (online && !room) || playing) return;
    playing = true; game.start(); $('lobby').close(); $('game').focus(); if (online) { sync(); broadcast({ type: 'start' }); }
  };
  render();
  if (invited) { $('room-code').value = invited; show(); message('招待された部屋です。「参加する」を押してください。'); $('join-room').focus(); }
})();
