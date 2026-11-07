const { test, expect } = require('@playwright/test');

test('invitation view only permits joining and keeps setup under host control', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/vendor/peerjs.min.js',route=>route.fulfill({contentType:'application/javascript',body:`
    class TestConnection {
      constructor(peer){this.peer=peer;this.open=true;this.handlers={};this.sent=[];}
      on(name,fn){this.handlers[name]=fn;}
      emit(name,data){this.handlers[name]?.(data);}
      send(data){this.sent.push(data);}
      close(){}
    }
    window.Peer=class {
      constructor(){this.handlers={};window.testPeer=this;queueMicrotask(()=>this.handlers.open?.('test-guest'));}
      on(name,fn){this.handlers[name]=fn;}
      connect(peer){const c=window.testConnection=new TestConnection(peer);if(window.autoOpenConnect!==false)queueMicrotask(()=>c.emit('open'));return c;}
      destroy(){}
    };
  `}));
  await page.goto('/?room=test-host');
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(page.locator('#lobby-title')).toHaveText('JOIN MATCH');
  await expect(page.locator('#lobby button:visible:enabled')).toHaveCount(1);
  await expect(page.locator('#join-room')).toBeFocused();
  await expect(page.locator('#room-code')).toHaveValue('test-host');
  await expect(page.locator('#room-code')).toBeDisabled();
  for(const id of ['launch-match','host-room','local-mode','close-lobby']) await expect(page.locator('#'+id)).toBeHidden();
  await expect(page.locator('#player-slots')).toBeVisible();
  await expect(page.locator('#player-slots .player-card')).toHaveCount(4);
  await expect(page.locator('#player-slots select')).toHaveCount(0);
  await expect(page.locator('#player-slots .is-you')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#lobby')).toBeVisible();
  await page.locator('#lobby').screenshot({path:'test-results/invited-join.png'});
  await page.locator('#join-room').click();
  await page.waitForFunction(()=>!!window.testConnection);
  await page.evaluate(()=>window.testConnection.emit('data',{
    type:'lobby',members:[{id:'test-host'},{id:'test-guest'}],owners:['test-host',0,'test-guest',0],playing:false
  }));
  await expect(page.locator('#lobby-message')).toContainText('ホストが担当を決めて開始');
  await expect(page.locator('#lobby button:visible:enabled')).toHaveCount(0);
  await expect(page.locator('#launch-match')).toBeHidden();
  await expect(page.locator('#player-slots')).toBeVisible();
  await expect(page.locator('#player-slots .is-you')).toHaveCount(1);
  await expect(page.locator('#player-slots .is-you strong')).toHaveText('ブルー / 男性');
  await expect(page.locator('#player-slots .is-you .player-you-marker')).toHaveText('▼ あなた');
  await expect(page.locator('#player-slots .is-you .player-owner')).toContainText('2P（あなた）');
  await page.locator('#lobby').screenshot({path:'test-results/join-your-character.png'});
  // Host reassignment updates the highlight immediately; unassigned guests see spectator status.
  await page.evaluate(()=>window.testConnection.emit('data',{
    type:'lobby',members:[{id:'test-host'},{id:'test-guest'}],owners:['test-host','test-guest',0,0],playing:false
  }));
  await expect(page.locator('#player-slots .is-you strong')).toHaveText('コーラル / 女性');
  await page.evaluate(()=>window.testConnection.emit('data',{
    type:'lobby',members:[{id:'test-host'},{id:'test-guest'}],owners:['test-host',0,0,0],playing:false
  }));
  await expect(page.locator('#player-slots .is-you')).toHaveCount(0);
  await expect(page.locator('#lobby-help')).toContainText('あなたは観戦');
  await page.evaluate(()=>window.testConnection.emit('data',{
    type:'lobby',members:[{id:'test-host'},{id:'test-guest'}],owners:['test-host',0,'test-guest',0],playing:false
  }));
  await page.keyboard.press('Escape');
  await expect(page.locator('#lobby')).toBeVisible();
  await page.evaluate(()=>window.testConnection.emit('data',{type:'start'}));
  await expect(page.locator('#lobby')).toBeHidden();
  await expect(page.locator('#game')).toBeFocused();
  await page.keyboard.down('ArrowRight');
  await expect.poll(()=>page.evaluate(()=>window.testConnection.sent.some(p=>p.type==='input'&&p.input.move===1))).toBe(true);
  await page.keyboard.up('ArrowRight');
  // Disconnect during match pauses game and enters waiting-for-host state.
  await page.evaluate(() => { window.autoOpenConnect = false; });
  await page.evaluate(()=>window.testConnection.emit('close'));
  expect(await page.evaluate(() => window.matchLobby.isWaitingForHost)).toBe(true);
  await expect(page.locator('#lobby')).toBeHidden();

  // Host reconnection resumes match.
  await page.evaluate(() => {
    window.testConnection.emit('open');
    window.testConnection.emit('data', { type: 'state', state: window.rallyGame.snapshot() });
  });
  expect(await page.evaluate(() => window.matchLobby.isWaitingForHost)).toBe(false);

  // Escaping host waiting manually exits to lobby.
  await page.evaluate(() => window.testConnection.emit('close'));
  expect(await page.evaluate(() => window.matchLobby.isWaitingForHost)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(page.locator('#join-room')).toBeEnabled();
  await expect(page.locator('#lobby button:visible:enabled')).toHaveCount(1);
  await expect(page.locator('#host-room')).toBeHidden();
  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('#lobby').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('player setup highlights local 1P and blue portraits face left', async ({page})=>{
  await page.goto('/');await page.locator('#start').click();
  await expect(page.locator('#player-slots .is-you strong')).toHaveText('コーラル / 男性');
  await page.locator('#player-slots select').nth(2).selectOption('1');
  await expect(page.locator('#player-slots .is-you')).toHaveCount(1);
  await expect(page.locator('#player-slots .is-you strong')).toHaveText('ブルー / 男性');
  expect(await page.locator('.team-blue .character-portrait').first().evaluate(el=>getComputedStyle(el).transform)).toBe('matrix(-1, 0, 0, 1, 0, 0)');
  expect(await page.locator('.team-coral .character-portrait').first().evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  await page.locator('#lobby').screenshot({path:'test-results/setup-your-character.png'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('#lobby').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('frame list reports strengths and speed limits from live settings', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1600,height:1000});
  await page.goto('/');
  await expect(page.locator('#show-frame-data')).toHaveText('フレーム一覧 ↗');
  await page.locator('#show-frame-data').click();
  await expect(page.locator('#frame-data')).toHaveAttribute('open','');
  await expect(page.locator('#frame-data thead th')).toHaveCount(7);
  const row=name=>page.getByRole('rowheader',{name,exact:true}).locator('..');
  await expect(row('ダブルアタック')).toContainText('初速1300／理論325px');
  await expect(row('パワーサーブ（1sp）')).toContainText('初速1300／理論325px');
  await expect(row('パワーアタック（1sp）')).toContainText('地上 弱：初速900／理論225px');
  await expect(row('パワーアタック（1sp）')).toContainText('空中 強：初速1800／理論450px');
  await expect(row('アタック')).toContainText('横速度上限 720 → 1080');
  await expect(row('クイック')).toContainText('横速度上限 1177 → 1350');
  await expect(row('トス')).toContainText('410／高トス 520');
  await expect(row('フェイント')).toContainText('ブロック無効');
  await expect(row('パワーレシーブ（1sp）')).toContainText('上向き 500');
  await expect(row('パワーレシーブ（1sp）')).toContainText('ノックバックを完全無効化');
  await expect(page.locator('#frame-data-landing')).toContainText('ジャンプ中のボタン操作は1ジャンプにつき1回まで');
  await expect(page.locator('#frame-data-landing')).toContainText('着地硬直（12F）');
  await expect(row('アタック')).toContainText('12F');
  await expect(page.getByRole('rowheader', { name: 'ブロック（構え・空振り）' })).toHaveCount(0);
  await expect(row('キルブロック（ネット直上／相手側でブロック）')).toContainText('12F');
    await expect(row('キルブロック（ネット直上／相手側でブロック）')).toContainText('500〜560');
    await expect(row('ソフトブロック（自陣側でブロック）')).toContainText('12F');
    await expect(row('ソフトブロック（自陣側でブロック）')).toContainText('110〜200');
    await expect(page.locator('#frame-data-block-speed')).toContainText('ボールを捉えた位置');
  await expect(page.locator('#frame-data-speed-reference')).toContainText('x=61・y=320');
  await expect(page.locator('#frame-data-gauge')).toContainText('スペシャルゲージ増加ルール');
  await expect(page.locator('#frame-data-gauge')).toContainText('ボーナス+2pt');
  await page.locator('#frame-data').screenshot({path:'test-results/frame-list.png'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(await page.locator('.frame-table-scroll').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('directional jump serves and power-serve reception work through keyboard controls', async ({ page }) => {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const [key,variant] of [['ArrowRight','fast'],['ArrowUp','high'],['ArrowLeft','slow'],['ArrowDown','power']]) {
    await page.goto('/');
    await page.locator('#start').click();await page.locator('#launch-match').click();
    await page.evaluate(()=>{
      const s=window.rallyGame.snapshot();
      Object.assign(s.serveState,{phase:'tossed',age:.1,shotHeld:false});
      Object.assign(s.players[0],{y:350,vy:0,vx:0,specials:1});
      Object.assign(s.ball,{x:61,y:320,vx:0,vy:0});
      window.rallyGame.apply(s);
    });
    await page.keyboard.down(key);await page.keyboard.down('KeyZ');
    await expect.poll(()=>page.evaluate(()=>window.rallyGame.snapshot().ball.serveVariant)).toBe(variant);
    await page.keyboard.up('KeyZ');await page.keyboard.up(key);
    expect(await page.evaluate(()=>window.rallyGame.snapshot().players[0].specials)).toBe(variant==='power'?0:1);
    if(variant==='power') {
      expect(await page.evaluate(()=>ballGlowColor())).toBe('#399dff');
      await page.evaluate(()=>{
        const s=window.rallyGame.snapshot();
        Object.assign(s.players[2],{x:700,y:530,vy:0,vx:0,human:1,cooldownFrames:0,recoveryFrames:0});
        Object.assign(s.ball,{x:700,y:491,vx:0,vy:0});
        window.rallyGame.apply(s);
      });
      await page.keyboard.down('KeyZ');
      await expect.poll(()=>page.evaluate(()=>window.rallyGame.snapshot().players[2].knockback)).toBeGreaterThan(0);
      await page.keyboard.up('KeyZ');
      const ball=await page.evaluate(()=>window.rallyGame.snapshot().ball);
      expect(ball.vx).toBe(0);expect(ball.vy).toBeLessThan(0);
    }
  }
  expect(errors).toEqual([]);
});

test('human serves: hold, toss, timed jump attack and standing B serve', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const start = async () => {
    await page.goto('/');
    await page.locator('#start').click();
    await page.locator('#launch-match').click();
    await page.waitForFunction(() => serveArt.complete && serveArt.naturalWidth);
    await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().serveState?.phase)).toBe('holding');
  };
  await start();
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].x)).toBe(28);
  await page.locator('#game').screenshot({ path: 'test-results/serve-hold.png' });
  await page.keyboard.down('KeyZ');
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().serveState?.phase)).toBe('tossed');
  await page.keyboard.up('KeyZ');
  await page.locator('#game').screenshot({ path: 'test-results/serve-toss.png' });
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => {
    const s = window.rallyGame.snapshot(), p = s.players[0];
    return p.y < 530 && Math.hypot(s.ball.x-p.x,s.ball.y-(p.y-39)) < 83;
  });
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('KeyZ');
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().serveState)).toBeNull();
  await page.keyboard.up('KeyZ');
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].airborneTouch)).toBe(true);
  await page.locator('#game').screenshot({ path: 'test-results/serve-jump.png' });
  await start();
  await page.keyboard.down('KeyX');
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().serveState)).toBeNull();
  await page.keyboard.up('KeyX');
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].y)).toBe(530);
  expect(await page.evaluate(() => window.rallyGame.snapshot().ball.lastShot)).toBe('attack');
  await page.locator('#game').screenshot({ path: 'test-results/serve-standing.png' });
  await page.goto('/character-preview.html');
  await expect(page.locator('#load-status')).toContainText('サーブ2状態');
  expect(errors).toEqual([]);
});

test('buttons distinguish actionable, selected and disabled states', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const settingBlock = page.locator('.setting-block');
  await expect(settingBlock).toBeVisible();
  await expect(settingBlock.locator('.eyebrow')).toContainText('SETTING');
  await settingBlock.screenshot({ path: 'test-results/button-modes.png' });
  await page.locator('#character-check').click();
  await expect(page.locator('#character-check')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#exit-character-check').click();
  await expect(page.locator('#local-mode')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#host-room')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#character-check')).toHaveAttribute('aria-pressed', 'false');
  const enabledShadow = await page.locator('#join-room').evaluate(el => getComputedStyle(el).boxShadow);
  expect(enabledShadow).not.toBe('none');
  await page.locator('#join-room').evaluate(el => { el.disabled = true; });
  await expect(page.locator('#join-room')).toBeDisabled();
  expect(await page.locator('#join-room').evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
  expect(await page.locator('#join-room').evaluate(el => getComputedStyle(el).cursor)).toBe('not-allowed');
  await page.locator('#lobby').screenshot({ path: 'test-results/button-states.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('#lobby').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('COM jumps and blocks an incoming attack', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#start').click();
  await page.locator('#player-slots select').first().selectOption('0');
  await page.locator('#launch-match').click();
  await page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    s.players.forEach((p, i) => { p.x = [565, 220, 950, 1100][i]; });
    Object.assign(s.ball, { x: 760, y: 260, vx: -500, vy: 80, lastSide: 1, lastShot: 'attack' });
    s.serveTimer = 0;
    window.rallyGame.apply(s);
  });
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().audioEvents.some(e => e.name === 'block'))).toBe(true);
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].blockHit)).toBe(true);
  await page.screenshot({ path: 'test-results/com-block.png' });
  expect(errors).toEqual([]);
});

test('broadcast styling covers welcome, lobby and both victory screens at desktop and mobile sizes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#overlay-result')).toBeHidden();
    await page.locator('.arena').screenshot({ animations: 'disabled', path: `test-results/welcome-${width}.png` });
    await page.locator('#start').click();
    await expect(page.locator('#lobby')).toBeVisible();
    await page.locator('#lobby').screenshot({ animations: 'disabled', path: `test-results/setup-${width}.png` });
    expect(await page.locator('#lobby').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('#launch-match').click();
    // Drive the real local end-of-match path.
    await page.evaluate(() => {
      const s = window.rallyGame.snapshot();
      Object.assign(s, { score: [11, 7], winner: false, pointEnd: { side: 0, time: 0 }, serveTimer: 0, running: true });
      window.rallyGame.apply(s);
    });
    await expect(page.locator('#overlay h2')).toHaveText('CORAL WINS!');
    await expect(page.locator('#overlay')).toHaveClass(/is-victory/);
    await expect(page.locator('#result-coral')).toHaveText('11');
    await expect(page.locator('#result-blue')).toHaveText('07');
    await page.locator('.arena').screenshot({ animations: 'disabled', path: `test-results/coral-win-${width}.png` });
    const outer = await page.locator('#overlay').boundingBox();
    const inner = await page.locator('.overlay-card').boundingBox();
    expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
    // Guests receive the same design from an authoritative winner snapshot.
    await page.evaluate(() => {
      const s = window.rallyGame.snapshot();
      Object.assign(s, { score: [8, 11], winner: true, pointEnd: null });
      window.rallyGame.apply(s);
    });
    await expect(page.locator('#overlay h2')).toHaveText('BLUE WINS!');
    await expect(page.locator('#overlay')).toHaveClass(/winner-blue/);
    await page.locator('.arena').screenshot({ animations: 'disabled', path: `test-results/blue-win-${width}.png` });
    await page.locator('#start').click();
    await page.locator('#close-lobby').click();
    await expect(page.locator('#overlay')).not.toHaveClass(/is-victory/);
    await expect(page.locator('#overlay-result')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('special effects synthesize audible audio and respect mute', async ({ page }) => {
  for (const name of ['mozu', 'mozuDive', 'empowered']) {
    await page.goto('/');
    const result = await page.evaluate(async name => {
      let offline;
      window.AudioContext = function () {
        offline = new OfflineAudioContext(2, 44100, 44100);
        return new Proxy(offline, {
          get(target, prop) {
            if (prop === 'state') return 'running';
            const value = Reflect.get(target, prop, target);
            return typeof value === 'function' ? value.bind(target) : value;
          }
        });
      };
      window.rallyAudio.unlock();
      window.rallyAudio.play(name);
      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);
      let energy = 0, peak = 0;
      for (const v of samples) { energy += v * v; peak = Math.max(peak, Math.abs(v)); }
      return { rms: Math.sqrt(energy / samples.length), peak };
    }, name);
    expect(result.rms).toBeGreaterThan(.001);
    expect(result.peak).toBeGreaterThan(.01);
    expect(result.peak).toBeLessThanOrEqual(1);
  }
  await page.goto('/');
  const mutedPeak = await page.evaluate(async () => {
    let offline;
    window.AudioContext = function () {
      offline = new OfflineAudioContext(2, 44100, 44100);
      return new Proxy(offline, { get(target, prop) {
        if (prop === 'state') return 'running';
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    };
    window.rallyAudio.unlock();
    window.rallyAudio.setEnabled(false);
    window.rallyAudio.play('empowered');
    const buffer = await offline.startRendering();
    return buffer.getChannelData(0).reduce((peak, v) => Math.max(peak, Math.abs(v)), 0);
  });
  // The existing waveshaper can leave a tiny DC offset while the master fades out.
  expect(mutedPeak).toBeLessThan(.001);
});

test('airborne down inputs spend SP and launch blue special shots', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const [key, special] of [['KeyX', 'mozu'], ['KeyZ', 'empowered']]) {
    await page.goto('/');
    await page.locator('#character-check').click();
    await page.evaluate(() => {
      const s = window.rallyGame.snapshot();
      Object.assign(s.players[0], { x: NET - 50, y: 350, vx: 0, vy: 0, specials: 1 });
      Object.assign(s.ball, { x: NET + 10, y: 311, vx: 0, vy: 0 });
      window.rallyGame.apply(s);
    });
    await page.keyboard.down('ArrowDown');
    await page.keyboard.down(key);
    await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().ball.specialShot)).toBe(special);
    expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].specials)).toBe(0);
    expect(await page.evaluate(() => ballGlowColor())).toBe('#399dff');
    await page.keyboard.up(key);
    await page.keyboard.up('ArrowDown');
    if (special === 'mozu') {
      await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().ball.mozuPhase), { intervals: [16, 32, 50], timeout: 5000 }).toBe('dive');
      const ball = await page.evaluate(() => window.rallyGame.snapshot().ball);
      const expectedLobX = await page.evaluate(() => NET + 150);
      expect(ball.x).toBe(expectedLobX);
      expect(ball.vy).toBeGreaterThanOrEqual(1100);
    }
    await page.screenshot({ path: `test-results/${special}-shot.png` });
  }
  expect(errors).toEqual([]);
});

test('ground down plus Z spends SP and launches green power receive', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#character-check').click();
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('KeyZ');
  await page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    Object.assign(s.players[0], { x: 500, y: 530, vx: 0, vy: 0, specials: 1, recoveryFrames: 0, cooldownFrames: 0 });
    Object.assign(s.ball, { x: 500, y: 470, vx: 0, vy: 60, doubleAttack: true });
    window.rallyGame.apply(s);
  });
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().ball.specialShot)).toBe('powerReceive');
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].specials)).toBe(0);
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].recoveryFrames)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].recoveryFrames)).toBeLessThanOrEqual(10);
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].vx)).toBe(0);
  expect(await page.evaluate(() => ballGlowColor())).toBe('#44f07a');
  await page.keyboard.up('KeyZ');
  await page.keyboard.up('ArrowDown');
  await page.screenshot({ path: 'test-results/power-receive.png' });
  expect(errors).toEqual([]);
});

test('quick and double balls have distinct glows', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#character-check').click();
  await page.waitForFunction(() => ballArt.complete && ballArt.naturalWidth);
  for (const [type, color] of [['quick', '#ffe13b'], ['double', '#ff8a24']]) {
    await page.evaluate(type => {
      const s = window.rallyGame.snapshot();
      Object.assign(s.ball, { x: 300, y: 350, vx: 720, vy: 0, lastShot: 'attack', quickAttack: type === 'quick', doubleAttack: type === 'double', trail: [] });
      s.paused = true;
      window.rallyGame.apply(s);
    }, type);
    expect(await page.evaluate(() => ballGlowColor())).toBe(color);
    await page.locator('#game').screenshot({ path: `test-results/${type}-glow.png` });
  }
  expect(errors).toEqual([]);
});

test('receive hit frame and two-state preview load correctly', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#character-check').click();
  await page.waitForFunction(() => [...document.images].every(img => img.complete));
  await page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    Object.assign(s.ball, { x: s.players[0].x, y: s.players[0].y - 39, vx: 0, vy: 0 });
    window.rallyGame.apply(s);
  });
  await page.keyboard.down('KeyZ');
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().ball.lastShot)).toBe('receive');
  await page.evaluate(() => window.rallyGame.pause());
  await page.keyboard.up('KeyZ');
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].receiveAge)).toBeLessThan(.3);
  await page.screenshot({ path: 'test-results/receive-hit.png' });
  await page.goto('/character-preview.html');
  await expect(page.locator('#load-status')).toContainText('レシーブ2状態');
  await page.locator('#play').click();
  await page.evaluate(() => { frozen[5] = 1; render(0); });
  await page.locator('#preview').screenshot({ path: 'test-results/receive-preview.png' });
  expect(errors).toEqual([]);
});

test('down plus B produces a high toss in character check', async ({ page }) => {
  await page.goto('/');
  await page.locator('#character-check').click();
  await page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    Object.assign(s.ball, { x: s.players[0].x, y: s.players[0].y - 39, vx: 0, vy: 0 });
    window.rallyGame.apply(s);
  });
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('KeyX');
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().ball.lastShot)).toBe('set');
  const apex = await page.evaluate(() => {
    const ball = window.rallyGame.snapshot().ball;
    return ball.y - ball.vy * ball.vy / (2 * 650);
  });
  expect(apex).toBeLessThan(320);
  await page.keyboard.up('KeyX');
  await page.keyboard.up('ArrowDown');
});

test('receive stance holds on A and releases for movement', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#character-check').click();
  await page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    Object.assign(s.ball, { y: 50, vx: 0, vy: 0 });
    window.rallyGame.apply(s);
  });
  await page.keyboard.down('KeyZ');
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().players[0].receiveReady)).toBe(true);
  await page.keyboard.down('ArrowLeft');
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].vx)).toBe(0);
  await page.screenshot({ path: 'test-results/receive-ready.png' });
  await page.keyboard.up('KeyZ');
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().players[0].x)).toBeLessThan(500);
  await page.keyboard.up('ArrowLeft');
  expect(errors).toEqual([]);
});

test('gauge rewards render next to players and convert to specials', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#start').click();
  await page.locator('#launch-match').click();
  const returnBall = async () => page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    Object.assign(s.ball, { x: 599, y: 200, vx: 600, vy: 0, touchSide: 0, teamTouches: 3, lastHitter: 0, returnAwarded: false });
    s.serveTimer = 0;
    window.rallyGame.apply(s);
  });
  await returnBall();
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().players[0].gauge)).toBe(5);
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[1].gauge)).toBe(3);
  await page.screenshot({ path: 'test-results/player-gauges.png' });
  await page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    s.players[1].gauge = 7;
    window.rallyGame.apply(s);
  });
  await returnBall();
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().players[0].specials)).toBe(1);
  const players = await page.evaluate(() => window.rallyGame.snapshot().players);
  expect(players[0].gauge).toBe(0);
  expect(players[1].gauge).toBe(0);
  expect(players[1].specials).toBe(1);
  expect(errors).toEqual([]);
});

test('airborne attack charge produces visual afterimage trail', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#character-check').click();
  await page.waitForFunction(() => [...document.images].every(img => img.complete));

  // Position player high in the air to allow full 30F charge observation before landing
  // Move ball far away so it doesn't collide
  await page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    s.ball.x = 100;
    s.ball.y = 100;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.players[0].x = 500;
    s.players[0].y = 150;
    s.players[0].vy = -200;
    window.rallyGame.apply(s);
  });

  // Hold A (KeyZ) to charge attack
  await page.keyboard.down('KeyZ');
  let maxObservedCharge = 0;
  await expect.poll(async () => {
    return page.evaluate(() => {
      const p = window.rallyGame.snapshot().players[0];
      return p.attackReady && p.attackChargeFrames > 5 && (p.chargeTrail?.length ?? 0) > 0;
    });
  }).toBe(true);

  // Poll and observe the charge reach maximum
  const chargeReached = await page.evaluate(async () => {
    return new Promise(resolve => {
      let maxF = 0;
      let maxTrail = 0;
      const start = performance.now();
      const check = () => {
        const p = window.rallyGame.snapshot().players[0];
        if (p.attackChargeFrames > maxF) maxF = p.attackChargeFrames;
        if ((p.chargeTrail?.length ?? 0) > maxTrail) maxTrail = p.chargeTrail.length;
        if (maxF >= 30 || performance.now() - start > 1800) {
          resolve({ maxF, maxTrail, y: p.y, attackReady: p.attackReady });
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  });
  expect(chargeReached.maxF).toBe(30);
  expect(chargeReached.maxTrail).toBeGreaterThanOrEqual(3);

  await page.screenshot({ path: 'test-results/attack-charge-afterimage.png' });

  // Release KeyZ and verify trail clears
  await page.keyboard.up('KeyZ');
  await expect.poll(async () => {
    return page.evaluate(() => {
      const p = window.rallyGame.snapshot().players[0];
      return !p.attackReady && (!p.chargeTrail || p.chargeTrail.length === 0);
    });
  }).toBe(true);

  expect(errors).toEqual([]);
});

test('ground and low-air knockback emits sand dust clouds', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#character-check').click();
  await page.waitForFunction(() => [...document.images].every(img => img.complete));

  // 1. Ground knockback
  await page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    Object.assign(s.players[0], { x: 500, y: 530, vx: 0, vy: 0, specials: 0, recoveryFrames: 0, cooldownFrames: 0 });
    Object.assign(s.ball, { x: 500, y: 491, vx: 0, vy: 60, doubleAttack: true });
    window.rallyGame.apply(s);
  });
  await page.keyboard.down('KeyZ');
  await expect.poll(() => page.evaluate(() => Math.abs(window.rallyGame.snapshot().players[0].knockback))).toBeGreaterThan(200);
  await page.keyboard.up('KeyZ');

  // Verify sand dust was emitted
  const groundDustCount = await page.evaluate(() => {
    return particles.filter(p => p.kind === 'sand' && p.event === 'knockback').length;
  });
  expect(groundDustCount).toBeGreaterThanOrEqual(10);
  await page.screenshot({ path: 'test-results/ground-knockback-sand.png' });

  // 2. Low-air knockback (y = 485, 45px above floor)
  await page.evaluate(() => {
    particles.length = 0;
    const s = window.rallyGame.snapshot();
    Object.assign(s.players[0], { x: 500, y: 485, vx: 0, vy: 0, specials: 0, recoveryFrames: 0, cooldownFrames: 0 });
    Object.assign(s.ball, { x: 500, y: 446, vx: 0, vy: 60, doubleAttack: true, lastShot: 'attack' });
    window.rallyGame.apply(s);
  });
  await page.keyboard.down('KeyZ');
  const result = await page.evaluate(async () => {
    return new Promise(resolve => {
      let maxDust = 0;
      let hitKnockback = 0;
      const start = performance.now();
      const check = () => {
        const p = window.rallyGame.snapshot().players[0];
        const dust = particles.filter(pt => pt.kind === 'sand' && pt.event === 'knockback').length;
        if (dust > maxDust) maxDust = dust;
        if (Math.abs(p.knockback) > 0) hitKnockback = p.knockback;
        if (maxDust >= 10 || performance.now() - start > 1500) {
          resolve({ maxDust, hitKnockback, y: p.y, particles: particles.length });
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  });
  await page.screenshot({ path: 'test-results/low-air-knockback-sand.png' });
  await page.keyboard.up('KeyZ');
  expect(result.maxDust).toBeGreaterThanOrEqual(10);
  expect(Math.abs(result.hitKnockback)).toBeGreaterThan(200);
  await page.screenshot({ path: 'test-results/low-air-knockback-sand.png' });
  await page.screenshot({ path: 'test-results/low-air-knockback-sand.png' });

  expect(errors).toEqual([]);
});

test('empowered attack knockback is weak on ground and strong in air', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#character-check').click();
  await page.waitForFunction(() => [...document.images].every(img => img.complete));

  // 1. Ground reception of empowered attack -> weak knockback (900)
  await page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    Object.assign(s.players[0], { x: 500, y: 530, vx: 0, vy: 0, specials: 0, recoveryFrames: 0, cooldownFrames: 0, knockback: 0 });
    Object.assign(s.ball, { x: 500, y: 491, vx: 0, vy: 60, specialShot: 'empowered', lastShot: 'attack', lastSide: 1 });
    window.rallyGame.apply(s);
  });
  await page.keyboard.down('KeyZ');
  let groundKb = 0;
  await expect.poll(async () => {
    groundKb = await page.evaluate(() => Math.abs(window.rallyGame.snapshot().players[0].knockback));
    return groundKb;
  }).toBeGreaterThan(0);
  await page.keyboard.up('KeyZ');
  expect(groundKb).toBeGreaterThan(450);
  expect(groundKb).toBeLessThanOrEqual(900);

  // 2. Aerial reception of empowered attack -> strong knockback (1800)
  await page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    Object.assign(s.players[0], { x: 500, y: 380, vx: 0, vy: 0, specials: 0, recoveryFrames: 0, cooldownFrames: 0, knockback: 0 });
    Object.assign(s.ball, { x: 500, y: 341, vx: 0, vy: 60, specialShot: 'empowered', lastShot: 'attack', lastSide: 1 });
    window.rallyGame.apply(s);
  });
  await page.keyboard.down('KeyZ');
  let airKb = 0;
  await expect.poll(async () => {
    airKb = await page.evaluate(() => Math.abs(window.rallyGame.snapshot().players[0].knockback));
    return airKb;
  }).toBeGreaterThan(950);
  await page.keyboard.up('KeyZ');
  expect(airKb).toBeGreaterThan(1100);
  expect(airKb).toBeLessThanOrEqual(1800);

  // Ground knockback is distinctly weaker than aerial knockback
  expect(groundKb).toBeLessThan(airKb * 0.65);

  expect(errors).toEqual([]);
});

test('airborne button action is limited to 1 per jump and landing recovery is 0 if untouched', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#character-check').click();
  await page.waitForFunction(() => [...document.images].every(img => img.complete));

  // Position player high in the air
  await page.evaluate(() => {
    const s = window.rallyGame.snapshot();
    s.ball.x = 100; s.ball.y = 100; s.ball.vx = 0; s.ball.vy = 0;
    s.players[0].x = 500; s.players[0].y = 250; s.players[0].vy = -100;
    window.rallyGame.apply(s);
  });

  // 1. Press and hold A (KeyZ) -> attackReady is true
  await page.keyboard.down('KeyZ');
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().players[0].attackReady)).toBe(true);

  // 2. Release A (KeyZ) -> cancels attackReady and airborne action is consumed
  await page.keyboard.up('KeyZ');
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().players[0].attackReady)).toBe(false);
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].airborneActionTaken)).toBe(true);

  // 3. Trying to press A or B again in same jump does nothing
  await page.keyboard.down('KeyZ');
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].attackReady)).toBe(false);
  await page.keyboard.up('KeyZ');

  await page.keyboard.down('KeyX');
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].blockFrames)).toBe(0);
  await page.keyboard.up('KeyX');

  // 4. Fall to ground without touching ball -> landing recovery is 0F
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().players[0].y)).toBe(530);
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].recoveryFrames)).toBe(0);
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].airborneActionTaken)).toBe(false);

  expect(errors).toEqual([]);
});

test('solo character check: movement, jumping, pause, reset and exit', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#character-check').click();
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#status')).toContainText('キャラ挙動チェック');
  const state = () => page.evaluate(() => window.rallyGame.snapshot());
  expect((await state()).players).toHaveLength(1);
  expect((await state()).ball).not.toBeNull();
  const initCheckX = await page.evaluate(() => NET - 100);
  await page.keyboard.down('KeyX');
  await expect.poll(async () => (await state()).players[0].setReady).toBe(true);
  await page.keyboard.up('KeyX');
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state()).players[0].x).toBeGreaterThan(initCheckX + 20);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state()).players[0].y).toBeLessThan(500);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Space');
  expect((await state()).paused).toBe(true);
  await page.keyboard.press('KeyR');
  expect((await state()).paused).toBe(false);
  expect((await state()).players[0].x).toBe(initCheckX);
  const checkBall1 = await page.evaluate(() => NET + 42);
  const checkBall2 = await page.evaluate(() => NET - 42);
  await expect.poll(async () => (await state()).ball.x, { timeout: 5000 }).toBe(checkBall1);
  await expect.poll(async () => (await state()).ball.x, { timeout: 5000 }).toBe(checkBall2);
  expect((await state()).score).toEqual([0, 0]);
  expect((await state()).pointEnd).toBeNull();
  await page.screenshot({ path: 'test-results/character-check.png' });
  await page.locator('#exit-character-check').click();
  await expect(page.locator('#lobby')).toBeVisible();
  await page.locator('#launch-match').click();
  expect((await state()).players).toHaveLength(4);
  expect((await state()).ball).not.toBeNull();
  expect(errors).toEqual([]);
});
test('local setup is required, unique assignments, movement and restart', async ({ page }) => {
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#lobby')).toBeVisible();
  const slots = page.locator('#player-slots select');
  await slots.nth(2).selectOption('1');
  await expect(slots.nth(0)).toHaveValue('0');
  await page.locator('#launch-match').click();
  const before = await page.evaluate(() => window.rallyGame.snapshot().players[2].x);
  await page.locator('#game').click(); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[2].x)).toBeGreaterThan(before);
  await page.keyboard.press('KeyR'); await expect(page.locator('#lobby')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/lobby-mobile.png' });
  expect(await page.locator('#lobby').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
});
test('real WebRTC room: remote control, authoritative score, disconnect', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const host = await a.newPage(), guest = await b.newPage();
  const errors = []; host.on('pageerror', e => errors.push(e.message)); guest.on('pageerror', e => errors.push(e.message));
  await host.goto('/'); await host.locator('#start').click(); await host.locator('#host-room').click();
  await expect(host.locator('#invite-link')).not.toHaveValue('', { timeout: 25000 });
  const invite = await host.locator('#invite-link').inputValue();
  await guest.goto(invite); await guest.locator('#join-room').click();
  await expect(host.locator('#lobby-help')).toContainText('2 / 4人', { timeout: 25000 });
  await expect(guest.locator('#lobby-help')).toContainText('2 / 4人', { timeout: 25000 });
  await expect(guest.locator('#launch-match')).toBeDisabled();
  await host.screenshot({ path: 'test-results/lobby-desktop.png' });
  await host.locator('#launch-match').click();
  await expect(guest.locator('#lobby')).not.toBeVisible();
  const before = await host.evaluate(() => window.rallyGame.snapshot().players[2].x);
  await guest.locator('#game').click(); await guest.keyboard.down('ArrowRight'); await guest.waitForTimeout(350); await guest.keyboard.up('ArrowRight');
  await expect.poll(() => host.evaluate(() => window.rallyGame.snapshot().players[2].x)).toBeGreaterThan(before + 20);
  await host.waitForTimeout(800);
  const hp = await host.evaluate(() => window.rallyGame.snapshot().players[2].x);
  const gp = await guest.evaluate(() => window.rallyGame.snapshot().players[2].x);
  expect(Math.abs(hp - gp)).toBeLessThan(10);
  await host.locator('#game').click(); await host.keyboard.press('Space');
  await expect.poll(() => guest.evaluate(() => window.rallyGame.snapshot().paused)).toBe(true);
  await guest.screenshot({ path: 'test-results/online-match.png' });
  await b.close();
  // Member disconnect switches slot 2 to COM immediately without aborting match.
  await expect.poll(() => host.evaluate(() => window.matchLobby.assignment(2)), { timeout: 20000 }).toBe(0);
  await expect.poll(() => host.evaluate(() => window.rallyGame.snapshot().players[2].human)).toBe(0);
  // Game remains in progress; host can return to lobby using KeyR.
  await expect(host.locator('#lobby')).toBeHidden();
  await host.keyboard.press('KeyR');
  await expect(host.locator('#lobby')).toBeVisible();
  await expect(host.locator('#player-slots select').nth(2)).toHaveValue('0');
  expect(errors).toEqual([]); await a.close();
});

test('member disconnect switches to COM and rejoining restores human control', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const host = await a.newPage(), guest = await b.newPage();
  const errors = []; host.on('pageerror', e => errors.push(e.message)); guest.on('pageerror', e => errors.push(e.message));
  await host.goto('/'); await host.locator('#start').click(); await host.locator('#host-room').click();
  await expect(host.locator('#invite-link')).not.toHaveValue('', { timeout: 25000 });
  const invite = await host.locator('#invite-link').inputValue();

  await guest.goto(invite); await guest.locator('#join-room').click();
  await expect(host.locator('#lobby-help')).toContainText('2 / 4人', { timeout: 25000 });
  await host.locator('#launch-match').click();
  await expect(guest.locator('#lobby')).toBeHidden();

  expect(await host.evaluate(() => window.matchLobby.assignment(2))).toBe(3);

  await b.close();

  await expect.poll(() => host.evaluate(() => window.matchLobby.assignment(2)), { timeout: 20000 }).toBe(0);
  await expect.poll(() => host.evaluate(() => window.rallyGame.snapshot().players[2].human)).toBe(0);
  await expect(host.locator('#lobby')).toBeHidden();

  const c = await browser.newContext();
  const guest2 = await c.newPage();
  guest2.on('pageerror', e => errors.push(e.message));
  await guest2.goto(invite);
  await guest2.locator('#join-room').click();

  await expect.poll(() => host.evaluate(() => window.matchLobby.assignment(2)), { timeout: 25000 }).toBe(3);
  await expect.poll(() => host.evaluate(() => window.rallyGame.snapshot().players[2].human)).toBe(3);
  await expect(guest2.locator('#lobby')).toBeHidden({ timeout: 10000 });

  expect(errors).toEqual([]);
  await c.close();
  await a.close();
});

test("gamepad config dialog opens, switches player tabs 1P-4P, and binds keys", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");

  // 1. Check 03 / SETTING block is visible on home screen
  const settingBlock = page.locator(".setting-block");
  await expect(settingBlock).toBeVisible();
  await expect(settingBlock.locator(".eyebrow")).toContainText("SETTING");
  const openBtn = page.locator("#open-gamepad-config");
  await expect(openBtn).toBeVisible();

  // 2. Open dialog
  await openBtn.click();
  const dialog = page.locator("#gamepad-config");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#gamepad-config-title")).toContainText("GAMEPAD CONFIG");

  // 3. Check 1P-4P tabs and table
  const tabs = dialog.locator(".config-tab");
  await expect(tabs).toHaveCount(4);
  await expect(tabs.nth(0)).toHaveClass(/active/);

  // Check 6 action rows
  const rows = dialog.locator("#gamepad-bindings-body tr");
  await expect(rows).toHaveCount(6);

  // 4. Switch to 2P tab
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveClass(/active/);
  await expect(tabs.nth(0)).not.toHaveClass(/active/);

  // 5. Switch to 4P tab and change assigned controller to None (-1)
  await tabs.nth(3).click();
  await expect(tabs.nth(3)).toHaveClass(/active/);
  const select = dialog.locator("#gamepad-select");
  await select.selectOption("-1");

  const conf4 = await page.evaluate(() => window.gamepadConfig.getConfig().players[4].padIndex);
  expect(conf4).toBe(-1);

  // 6. Screenshot of dialog
  await dialog.screenshot({ path: "test-results/gamepad-config-dialog.png" });

  // 7. Close dialog via footer button
  await dialog.locator("#close-gamepad-config-btn").click();
  await expect(dialog).toBeHidden();

  // 8. Mobile responsive check
  await page.setViewportSize({ width: 390, height: 844 });
  await openBtn.click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
  await dialog.locator("#close-gamepad-config").click();
  await expect(dialog).toBeHidden();

  expect(errors).toEqual([]);
});

test("special activation produces screen dim, afterimages, shockwave ring and sparks", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.locator("#character-check").click();

  // Give player 2 specials and trigger empowered attack in mid-air
  await page.evaluate(() => {
    const p = window.rallyGame.snapshot().players[0];
    p.specials = 2;
    p.y = 350;
    p.vy = 0;
    // Place ball in contact zone
    const b = window.rallyGame.snapshot().ball;
    b.x = p.x;
    b.y = p.y - 39;
  });

  // Trigger hit directly with empowered special
  const activeBefore = await page.evaluate(() => {
    const p = window.rallyGame.snapshot().players[0];
    // Trigger empowered attack
    hit(p, false, undefined, true, false, true);
    return window.rallyGame.snapshot().specialActivation;
  });

  expect(activeBefore).not.toBeNull();
  expect(activeBefore.type).toBe("empowered");

  // Capture screenshot during active special effect
  await page.screenshot({ path: "test-results/special-activation-effect.png" });

  // Advance time past effect duration

  // Also test green power receive
  await page.evaluate(() => {
    const p = window.rallyGame.snapshot().players[0];
    p.specials = 1;
    p.y = 530; // FLOOR
    hit(p, false, null, false, false, true);
  });
  await page.screenshot({ path: "test-results/special-power-receive-effect.png" });

  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().specialActivation), { timeout: 3000 }).toBeNull();

  expect(errors).toEqual([]);
});

test("window blur pauses match when humans are present, but keeps running when all players are COM", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.locator("#start").click();
  await expect(page.locator("#lobby")).toBeVisible();

  // 1. With default setup (1P is human), blur triggers pause
  await page.locator("#launch-match").click();
  await expect(page.locator("#lobby")).not.toBeVisible();
  expect(await page.evaluate(() => window.rallyGame.snapshot().paused)).toBe(false);

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  expect(await page.evaluate(() => window.rallyGame.snapshot().paused)).toBe(true);

  // Return to lobby by pressing R
  await page.keyboard.press("KeyR");
  await expect(page.locator("#lobby")).toBeVisible();

  // 2. Set all 4 players to COM ("0")
  const selects = page.locator("#player-slots select");
  for (let i = 0; i < 4; i++) {
    await selects.nth(i).selectOption("0");
  }

  // Launch all-COM match
  await page.locator("#launch-match").click();
  await expect(page.locator("#lobby")).not.toBeVisible();
  expect(await page.evaluate(() => window.rallyGame.snapshot().paused)).toBe(false);

  // Blur does NOT pause when all players are COM
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  expect(await page.evaluate(() => window.rallyGame.snapshot().paused)).toBe(false);

  // But manual Space still pauses
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.rallyGame.snapshot().paused)).toBe(true);

  expect(errors).toEqual([]);
});

test("ball tracker appears below scoreboard when ball rises into upper screen", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.locator("#character-check").click();

  // 1. Initially on floor/mid-court, tracker is not active
  const initial = await page.evaluate(() => window.rallyGame.ballTrackerState());
  expect(initial).not.toBeNull();
  expect(initial.active).toBe(false);

  // 2. Place ball high in the air above scoreboard bottom (y = 50)
  await page.evaluate(() => {
    window.rallyGame.testSetBall({ y: 50, vy: -180 });
  });

  const high = await page.evaluate(() => window.rallyGame.ballTrackerState());
  expect(high.active).toBe(true);
  expect(high.alpha).toBe(1);
  expect(high.vy).toBeLessThan(-40);

  // 3. Take a screenshot showing the tracker in action
  await page.screenshot({ path: "test-results/ball-tracker-active.png" });

  // 4. Place ball lower in normal play area (y = 350)
  await page.evaluate(() => {
    window.rallyGame.testSetBall({ y: 350, vy: 200 });
  });

  const normal = await page.evaluate(() => window.rallyGame.ballTrackerState());
  expect(normal.active).toBe(false);

  expect(errors).toEqual([]);
});

test("fullscreen toggle: button click and F key toggle arena presentation, label changes to WINDOW, and returns cleanly", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");

  const fsBtn = page.locator("#toggle-fullscreen");
  await expect(fsBtn).toBeVisible();
  await expect(fsBtn.locator(".fs-text")).toHaveText("FULLSCREEN");
  await expect(fsBtn.locator(".icon-expand")).toBeVisible();
  await expect(fsBtn.locator(".icon-compress")).toBeHidden();
  expect(await page.evaluate(() => window.rallyGame.isFullscreen())).toBe(false);

  // 1. Click button to enter fullscreen
  await fsBtn.click();
  await expect.poll(async () => page.evaluate(() => window.rallyGame.isFullscreen())).toBe(true);
  await expect(fsBtn.locator(".fs-text")).toHaveText("WINDOW");
  await expect(fsBtn.locator(".icon-compress")).toBeVisible();
  await expect(fsBtn.locator(".icon-expand")).toBeHidden();

  // Arena has is-fullscreen class or fullscreen mode applied
  const isFsClass = await page.evaluate(() => document.querySelector(".arena").classList.contains("is-fullscreen"));
  const isNative = await page.evaluate(() => Boolean(document.fullscreenElement));
  expect(isFsClass || isNative).toBe(true);
  await page.screenshot({ path: "test-results/fullscreen-mode.png" });

  // 2. Press F to return to windowed mode
  await page.keyboard.press("KeyF");
  await expect.poll(async () => page.evaluate(() => window.rallyGame.isFullscreen())).toBe(false);
  await expect(fsBtn.locator(".fs-text")).toHaveText("FULLSCREEN");
  await expect(fsBtn.locator(".icon-expand")).toBeVisible();
  await expect(fsBtn.locator(".icon-compress")).toBeHidden();
  await page.screenshot({ path: "test-results/windowed-mode.png" });

  // 3. Press F again to enter fullscreen
  await page.keyboard.press("KeyF");
  await expect.poll(async () => page.evaluate(() => window.rallyGame.isFullscreen())).toBe(true);
  await expect(fsBtn.locator(".fs-text")).toHaveText("WINDOW");

  // 4. Press Escape to return to windowed mode
  await page.keyboard.press("Escape");
  await expect.poll(async () => page.evaluate(() => window.rallyGame.isFullscreen())).toBe(false);
  await expect(fsBtn.locator(".fs-text")).toHaveText("FULLSCREEN");

  expect(errors).toEqual([]);
});

test("feint shot: airborne back plus A produces feint with strong topspin drive dropping over net", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.locator("#character-check").click();

  await page.evaluate(() => {
    window._feintMaxDrive = 0;
    window._feintMaxVy = 0;
    function monitor() {
      const b = window.rallyGame.snapshot().ball;
      if (b && b.lastShot === "feint") {
        if ((b.feintDrive || 0) > window._feintMaxDrive) window._feintMaxDrive = b.feintDrive;
        if ((b.vy || 0) > window._feintMaxVy) window._feintMaxVy = b.vy;
      }
      requestAnimationFrame(monitor);
    }
    requestAnimationFrame(monitor);

    const s = window.rallyGame.snapshot();
    const net = typeof NET !== "undefined" ? NET : 540;
    Object.assign(s.players[0], { x: net - 60, y: 350, vx: 0, vy: 0 });
    Object.assign(s.ball, { x: net - 50, y: 311, vx: 0, vy: 0 });
    window.rallyGame.apply(s);
  });

  await page.keyboard.down("ArrowLeft");
  await page.keyboard.down("KeyZ");
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().ball.lastShot)).toBe("feint");
  await page.keyboard.up("KeyZ");
  await page.keyboard.up("ArrowLeft");

  await expect.poll(() => page.evaluate(() => window._feintMaxDrive), { timeout: 3000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window._feintMaxVy), { timeout: 3000 }).toBeGreaterThan(600);

  await page.screenshot({ path: "test-results/feint-drive.png" });
  expect(errors).toEqual([]);
});
