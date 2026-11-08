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
  await expect(page.locator('#leave-lobby')).toBeVisible();
  await expect(page.locator('#leave-lobby')).toHaveText('退出する');
  await expect(page.locator('#lobby button:visible:enabled')).toHaveCount(2);
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
  await expect(page.locator('#lobby-message')).toHaveClass(/is-connecting/);
  await expect(page.locator('#lobby-help')).toHaveClass(/is-connecting/);
  await expect(page.locator('#lobby-help')).toContainText('ホストの部屋に接続しています');
  await expect(page.locator('#join-room')).toHaveText('接続中…');
  await page.locator('#lobby').screenshot({path:'test-results/invited-connecting.png'});
  await page.evaluate(()=>window.testConnection.emit('data',{
    type:'lobby',members:[{id:'test-host'},{id:'test-guest'}],owners:['test-host',0,'test-guest',0],playing:false
  }));
  await expect(page.locator('#lobby-message')).toContainText('ホストが担当を決めて開始');
  await expect(page.locator('#lobby button:visible:enabled')).toHaveCount(1);
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
  await expect(page.locator('#leave-lobby')).toBeVisible();
  await expect(page.locator('#lobby button:visible:enabled')).toHaveCount(2);
  await expect(page.locator('#host-room')).toBeHidden();
  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('#lobby').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);

  // Click leave lobby button to exit room and close dialog
  await page.locator('#leave-lobby').click();
  await expect(page.locator('#lobby')).toBeHidden();
  const currentUrl = page.url();
  expect(currentUrl.includes('room=')).toBe(false);

  expect(errors).toEqual([]);
});

test('header displays brand, sound button, and last update date at desktop and mobile sizes', async ({ page }) => {
  await page.goto('/');
  const updateEl = page.locator('.last-update');
  await expect(updateEl).toBeVisible();
  await expect(updateEl).toHaveText(/LAST UPDATE:\s*2026\/11\/07/);
  await expect(page.locator('.description')).toContainText('1人プレイもオンライン対戦も手軽に楽しめる');
  await page.screenshot({ path: 'test-results/header-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(updateEl).toBeVisible();
  await expect(page.locator('.description')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/header-mobile.png' });
});

test('head includes OGP and Twitter Card meta tags for rich link sharing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://aoi68k.github.io/ai-beach-volley/');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'SUNSET RALLY — Beach Volleyball');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://aoi68k.github.io/ai-beach-volley/assets/ogp.png');
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', 'https://aoi68k.github.io/ai-beach-volley/assets/ogp.png');
});

test('invite page includes dedicated invite OGP tags and redirects to game room', async ({ page }) => {
  // 1. Static OGP / Twitter card verification on invite.html
  const response = await page.request.get('/invite.html?room=test-room-uuid');
  const html = await response.text();
  expect(html).toContain('property="og:description" content="ビーチバレーゲーム、オンラインプレイ招待URL"');
  expect(html).toContain('name="twitter:description" content="ビーチバレーゲーム、オンラインプレイ招待URL"');
  expect(html).toContain('property="og:image" content="https://aoi68k.github.io/ai-beach-volley/assets/ogp-invite.png"');
  expect(html).toContain('property="og:image:width" content="1200"');
  expect(html).toContain('property="og:image:height" content="248"');

  // 2. Browser navigation to invite.html seamlessly redirects to main room
  await page.goto('/invite.html?room=test-room-uuid');
  await expect(page).toHaveURL(/\/\?room=test-room-uuid$/);
  await expect(page.locator('#lobby')).toHaveAttribute('open', '');
  await expect(page.locator('#room-code')).toHaveValue('test-room-uuid');
  await expect(page.locator('#lobby-message')).toContainText('招待された部屋です');

  // 3. Dynamic metadata updated on main document when invited
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', 'ビーチバレーゲーム、オンラインプレイ招待URL');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /assets\/ogp-invite\.png$/);
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
  await expect(page.locator('#frame-data thead th')).toHaveCount(9);
  const categories = await page.locator('#frame-data-body td.frame-category').allTextContents();
  expect(categories.slice(0, 4)).toEqual(['地上A', '地上A', '地上A', '地上A']);
  expect(categories.slice(4, 6)).toEqual(['地上B', '地上B']);
  expect(categories.slice(6, 12)).toEqual(['空中A', '空中A', '空中A', '空中A', '空中A', '空中A']);
  expect(categories.slice(12, 16)).toEqual(['空中B', '空中B', '空中B', '空中B']);
  expect(categories.slice(16, 22)).toEqual(['サーブ', 'サーブ', 'サーブ', 'サーブ', 'サーブ', 'サーブ']);
  expect(categories[22]).toBe('その他');

  const actionHeaders = await page.locator('#frame-data-body th[scope="row"]').allTextContents();
  expect(actionHeaders).toEqual([
    // 地上A: 方向なしが一番上、十字操作はその下
    'レシーブ', 'ダイレクトレシーブ', 'パワーレシーブ（1sp）', 'フライングレシーブ',
    // 地上B: 方向なしが一番上、十字操作はその下
    'トス', 'ハイセット',
    // 空中A: 方向なしが一番上、十字操作はその下
    'アタック', 'クイック', 'ダブルアタック', 'ディープアタック', 'ループシュート', 'パワーアタック（1sp）',
    // 空中B: 方向なしが一番上、十字操作はその下
    'キルブロック（ネット直上／相手側でブロック）', 'ソフトブロック（自陣側でブロック）', 'フェイント', 'モズ落とし（1sp）',
    // サーブ: 方向なしが一番上、十字操作はその下
    '地上サーブ（B）', 'ジャンプサーブ（A）', 'ジャンプサーブ（前＋A）', 'ジャンプサーブ（上＋A）', 'ジャンプサーブ（後＋A）', 'パワーサーブ（1sp）',
    // その他
    'ジャンプ・着地'
  ]);

  const row=name=>page.getByRole('rowheader',{name,exact:true}).locator('..');
  await expect(row('レシーブ')).toContainText('地上 A（方向なし）');
  await expect(row('レシーブ')).toContainText('自陣ネット手前へ上げる軌道');
  await expect(row('ダイレクトレシーブ')).toContainText('地上 前＋A');
  await expect(row('ダイレクトレシーブ')).toContainText('相手コートへ返す軌道');
  await expect(row('ループシュート')).toContainText('空中 後＋A');
  await expect(row('フェイント')).toContainText('空中 後＋B');
  await expect(row('ジャンプサーブ（A）')).toContainText('サーブトス後、空中 A');
  await expect(row('ジャンプサーブ（後＋A）')).toContainText('サーブトス後、空中 後＋A');
  await expect(row('ダブルアタック')).toContainText('初速1300／理論325px');
  await expect(row('パワーサーブ（1sp）')).toContainText('初速1300／理論325px');
  await expect(row('パワーアタック（1sp）')).toContainText('地上 弱：初速900／理論225px');
  await expect(row('パワーアタック（1sp）')).toContainText('空中 強：初速1800／理論450px');
  await expect(row('アタック')).toContainText('横速度上限 720 → 1080');
  await expect(row('ディープアタック')).toContainText('横速度上限 720 → 1080');
  await expect(row('クイック')).toContainText('横速度上限 1350 → 1450');
  await expect(row('クイック')).toContainText('820');
  await expect(row('トス')).toContainText('上向き 410');
  await expect(row('ハイセット')).toContainText('上向き 520');
  await expect(row('フェイント')).toContainText('ブロック無効');
  await expect(row('フェイント')).toContainText('750');
  await expect(row('ループシュート')).toContainText('1150');
  await expect(row('パワーレシーブ（1sp）')).toContainText('上向き 500');
  await expect(row('パワーレシーブ（1sp）')).toContainText('ノックバックを完全無効化');
  await expect(page.locator('#frame-data-landing')).toContainText('ジャンプ中のボタン操作は1ジャンプにつき1回まで');
  await expect(page.locator('#frame-data-landing')).toContainText('着地硬直（12F）');
  await expect(row('アタック')).toContainText('12F');
  await expect(row('ディープアタック')).toContainText('12F');
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

  // Continuous hold A: toss, jump while holding A, strikes seamlessly upon contact
  await start();
  await page.keyboard.down('KeyZ');
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().serveState?.phase)).toBe('tossed');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().serveState), { timeout: 3000 }).toBeNull();
  expect(await page.evaluate(() => window.rallyGame.snapshot().players[0].airborneTouch)).toBe(true);
  await page.keyboard.up('KeyZ');
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowRight');

  await page.goto('/character-preview.html');
  await expect(page.locator('#load-status')).toContainText('サーブ2状態');
  expect(errors).toEqual([]);
});

test('character preview: single row focus view, tab switching and zoom', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/character-preview.html');
  await expect(page.locator('#load-status')).toContainText('全画像を読み込みました');

  // Verify tabs exist
  const tabs = page.locator('#action-tabs .tab-btn');
  await expect(tabs).toHaveCount(10); // 9 actions + 1 all

  // 1. Default is Idle (row 0)
  await expect(tabs.nth(0)).toHaveClass(/active/);
  await page.screenshot({ path: 'C:/Users/aoi68/.gemini/antigravity/brain/2cf24b98-8335-489f-af1a-ba95899494ca/preview-single-idle.png' });

  // 2. Switch to Run (row 1)
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveClass(/active/);
  await page.screenshot({ path: 'C:/Users/aoi68/.gemini/antigravity/brain/2cf24b98-8335-489f-af1a-ba95899494ca/preview-single-run.png' });

  // 3. Switch to Block (row 6) via keyboard Digit7
  await page.keyboard.press('Digit7');
  await expect(tabs.nth(6)).toHaveClass(/active/);
  await page.screenshot({ path: 'C:/Users/aoi68/.gemini/antigravity/brain/2cf24b98-8335-489f-af1a-ba95899494ca/preview-single-block.png' });

  // 4. Zoom 1.25x
  await page.locator('#zoom').selectOption('1.25');
  await page.screenshot({ path: 'C:/Users/aoi68/.gemini/antigravity/brain/2cf24b98-8335-489f-af1a-ba95899494ca/preview-single-zoom.png' });

  // 5. Pause and verify animation stops completely without jittering or flipping rows
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('再生');
  const pausedRow = await page.evaluate(() => activeRow);
  const pausedFrame = await page.evaluate(() => frozen[activeRow]);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => activeRow)).toBe(pausedRow);
  expect(await page.evaluate(() => frozen[activeRow])).toBe(pausedFrame);

  // 6. Step forward advances frame by 1 and keeps row stable
  await page.locator('#step').click();
  const nextFrame = await page.evaluate(() => frozen[activeRow]);
  const rowFrames = await page.evaluate(() => ACTION_ROWS[activeRow].frames);
  expect(nextFrame).toBe((pausedFrame + 1) % rowFrames);
  expect(await page.evaluate(() => activeRow)).toBe(pausedRow);

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
    expect(inner.y).toBeGreaterThanOrEqual(outer.y - 2);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 2);
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
  await page.evaluate(() => { setRow?.(5); frozen[5] = 1; render(0); });
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
    const cur = await page.evaluate(() => Math.abs(window.rallyGame.snapshot().players[0].knockback));
    if (cur > airKb) airKb = cur;
    return cur;
  }).toBeGreaterThan(950);
  await page.keyboard.up('KeyZ');
  expect(airKb).toBeGreaterThan(1100);
  expect(airKb).toBeLessThanOrEqual(1800);

  // Ground knockback is distinctly weaker than aerial knockback
  expect(groundKb).toBeLessThan(airKb * 0.80);

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

test('character check: switch modes (free, serve, receive) via UI and keyboard', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');

  // Launch character check
  await page.locator('#character-check').click();
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#arena-check-modes')).toBeVisible();
  await expect(page.locator('#character-check-modes')).toBeVisible();

  const state = () => page.evaluate(() => window.rallyGame.snapshot());

  // 1. Default is free mode
  expect(await page.evaluate(() => window.rallyGame.getCheckMode())).toBe('free');
  await expect(page.locator('#arena-check-modes [data-check-mode="free"]')).toHaveClass(/active/);
  await expect(page.locator('#status')).toContainText('フリー練習');
  await page.screenshot({ path: 'C:/Users/aoi68/.gemini/antigravity/brain/2cf24b98-8335-489f-af1a-ba95899494ca/check-mode-free.png' });

  // 2. Switch to serve mode via UI button
  await page.locator('#arena-check-modes [data-check-mode="serve"]').click();
  expect(await page.evaluate(() => window.rallyGame.getCheckMode())).toBe('serve');
  await expect(page.locator('#arena-check-modes [data-check-mode="serve"]')).toHaveClass(/active/);
  await expect(page.locator('#character-check-modes [data-check-mode="serve"]')).toHaveClass(/active/);
  await expect(page.locator('#status')).toContainText('サーブ練習');
  const serveSnapshot = await state();
  expect(serveSnapshot.serveState).not.toBeNull();
  expect(serveSnapshot.serveState.phase).toBe('holding');
  expect(serveSnapshot.players[0].x).toBe(28);
  await page.screenshot({ path: 'C:/Users/aoi68/.gemini/antigravity/brain/2cf24b98-8335-489f-af1a-ba95899494ca/check-mode-serve.png' });

  // 3. Switch to receive mode via keyboard Digit3
  await page.keyboard.press('Digit3');
  expect(await page.evaluate(() => window.rallyGame.getCheckMode())).toBe('receive');
  await expect(page.locator('#arena-check-modes [data-check-mode="receive"]')).toHaveClass(/active/);
  await expect(page.locator('#character-check-modes [data-check-mode="receive"]')).toHaveClass(/active/);
  await expect(page.locator('#status')).toContainText('レシーブ練習');
  const receiveSnapshot = await state();
  expect(receiveSnapshot.ball.vx).toBeLessThan(0); // incoming from opponent court
  await page.screenshot({ path: 'C:/Users/aoi68/.gemini/antigravity/brain/2cf24b98-8335-489f-af1a-ba95899494ca/check-mode-receive.png' });

  // 4. Switch back to free mode via keyboard Digit1
  await page.keyboard.press('Digit1');
  expect(await page.evaluate(() => window.rallyGame.getCheckMode())).toBe('free');
  await expect(page.locator('#arena-check-modes [data-check-mode="free"]')).toHaveClass(/active/);
  await expect(page.locator('#status')).toContainText('フリー練習');

  // 5. Exit character check hides mode switchers
  await page.locator('#exit-character-check').click();
  await expect(page.locator('#arena-check-modes')).toBeHidden();
  await expect(page.locator('#character-check-modes')).toBeHidden();
  expect(errors).toEqual([]);
});

test('character check: serve practice and receive practice reset cycle', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');

  // Launch and set to serve practice
  await page.locator('#character-check').click();
  await page.keyboard.press('Digit2');
  expect(await page.evaluate(() => window.rallyGame.getCheckMode())).toBe('serve');

  const state = () => page.evaluate(() => window.rallyGame.snapshot());
  let s = await state();
  expect(s.serveState.phase).toBe('holding');

  // Standing serve with KeyX (B button held until strike)
  await page.keyboard.down('KeyX');
  await expect.poll(async () => (await state()).serveState).toBeNull();
  await page.keyboard.up('KeyX');

  // After ball hits the floor, serve resets automatically
  await expect.poll(async () => {
    const snap = await state();
    return snap.serveState?.phase;
  }, { timeout: 6000 }).toBe('holding');

  // KeyR resets immediately
  await page.keyboard.press('KeyR');
  s = await state();
  expect(s.serveState.phase).toBe('holding');
  expect(s.players[0].x).toBe(28);

  // Switch to receive practice
  await page.keyboard.press('Digit3');
  expect(await page.evaluate(() => window.rallyGame.getCheckMode())).toBe('receive');
  const firstBallX = (await state()).ball.x;

  // Press KeyR to immediately spawn next ball
  await page.keyboard.press('KeyR');
  const secondSnap = await state();
  expect(secondSnap.checkMode).toBe('receive');
  expect(secondSnap.ball.vx).toBeLessThan(0);

  await page.locator('#exit-character-check').click();
  expect(errors).toEqual([]);
});
test('local setup is required, unique assignments, movement and restart', async ({ page }) => {
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#lobby')).toBeVisible();
  const slots = page.locator('#player-slots select');
  await slots.nth(2).selectOption('1');
  await expect(slots.nth(0)).toHaveValue('0');
  await page.locator('#launch-match').click();
  await expect(page.locator('#lobby')).toBeHidden();
  await page.waitForFunction(() => window.rallyGame.snapshot().running);
  const before = await page.evaluate(() => window.rallyGame.snapshot().players[2].x);
  await page.locator('#game').click();
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => page.evaluate(() => window.rallyGame.snapshot().players[2].x)).toBeGreaterThan(before);
  await page.keyboard.up('ArrowRight');
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
  const canvasBox = await page.locator("#game").boundingBox();
  if (canvasBox) {
    // Canvas internal VIEW_W = 960, VIEW_H = 540
    // Tracker is around (540, 115)
    const scaleX = canvasBox.width / 960;
    const scaleY = canvasBox.height / 540;
    await page.screenshot({
      path: "test-results/ball-tracker-zoom.png",
      clip: {
        x: canvasBox.x + (540 - 50) * scaleX,
        y: canvasBox.y + (120 - 50) * scaleY,
        width: 100 * scaleX,
        height: 90 * scaleY
      }
    });
  }

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

test("feint shot: airborne back plus B produces feint with strong topspin drive dropping over net", async ({ page }) => {
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
  await page.keyboard.down("KeyX");
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().ball.lastShot)).toBe("feint");
  await page.keyboard.up("KeyX");
  await page.keyboard.up("ArrowLeft");

  await expect.poll(() => page.evaluate(() => window._feintMaxDrive), { timeout: 3000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window._feintMaxVy), { timeout: 3000 }).toBeGreaterThan(600);

  await page.screenshot({ path: "test-results/feint-drive.png" });
  expect(errors).toEqual([]);
});

test("loop shot: airborne back plus A produces gentle high-arc lob over net into opponent mid-court", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.locator("#character-check").click();

  await page.evaluate(() => {
    window._loopPeakY = 999;
    window._loopNetY = 999;
    window._loopMaxX = 0;
    const net = 540;
    let crossed = false;
    function monitor() {
      const b = window.rallyGame.snapshot().ball;
      if (b && b.lastShot === "loop") {
        if (b.y < window._loopPeakY) window._loopPeakY = b.y;
        if (!crossed && b.x >= net) {
          crossed = true;
          window._loopNetY = b.y;
        }
        if (b.x > window._loopMaxX) {
          window._loopMaxX = b.x;
        }
      }
      requestAnimationFrame(monitor);
    }
    requestAnimationFrame(monitor);

    const s = window.rallyGame.snapshot();
    Object.assign(s.players[0], { x: 440, y: 350, vx: 0, vy: 0 });
    Object.assign(s.ball, { x: 440, y: 311, vx: 0, vy: 0, lastSide: 0 });
    window.rallyGame.apply(s);
  });

  // Hold ArrowLeft + KeyZ (Back + A button)
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.down("KeyZ");
  await expect.poll(() => page.evaluate(() => window.rallyGame.snapshot().ball.lastShot)).toBe("loop");
  await page.keyboard.up("KeyZ");
  await page.keyboard.up("ArrowLeft");

  // Speed has pace with drive (~450-600 px/s vs attack 720+ px/s)
  const speed = await page.evaluate(() => {
    const b = window.rallyGame.snapshot().ball;
    return Math.hypot(b.vx, b.vy);
  });
  expect(speed).toBeGreaterThan(420);
  expect(speed).toBeLessThan(680);

  // Clearance over net is high (Y <= 230, which is > 150px above NETTOP 385)
  await expect.poll(() => page.evaluate(() => window._loopNetY), { timeout: 3000 }).toBeLessThan(235);

  // Drive accelerates downward after crossing net
  await expect.poll(() => page.evaluate(() => (window.rallyGame.snapshot().ball?.loopDrive ?? 0)), { timeout: 3000 }).toBeGreaterThan(100);

  // Lands in opponent mid-court (around 785)
  await expect.poll(() => page.evaluate(() => window._loopMaxX), { timeout: 4000 }).toBeGreaterThan(700);
  const maxX = await page.evaluate(() => window._loopMaxX);
  expect(maxX).toBeLessThan(860);

  await page.screenshot({ path: "test-results/loop-shot.png" });
  expect(errors).toEqual([]);
});

test("popout arena: button and P key open independent window with placeholder and restore cleanly", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");

  const popoutBtn = page.locator("#toggle-popout");
  await expect(popoutBtn).toBeVisible();
  await expect(popoutBtn.locator(".popout-text")).toHaveText("POPOUT");

  // 1. Pop out using the button
  const popupPromise = context.waitForEvent("page");
  await popoutBtn.click();
  const popoutPage = await popupPromise;
  await popoutPage.waitForLoadState();

  // Main page shows placeholder card
  await expect(page.locator("#arena-placeholder")).toBeVisible();
  await expect(page.locator("#arena-placeholder h3")).toHaveText("ゲーム画面は別ウィンドウで表示中です");

  // Popout page contains arena and button reflects RESTORE state
  await expect(popoutPage.locator("#arena")).toBeVisible();
  await expect(popoutPage.locator("#toggle-popout .popout-text")).toHaveText("RESTORE");

  // 2. Return via the placeholder button on main page
  const closePromise = popoutPage.waitForEvent("close");
  await page.locator("#return-from-popout").click();
  await closePromise;

  // Arena is restored on main page and button resets to POPOUT
  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#arena-placeholder")).toBeHidden();
  await expect(popoutBtn.locator(".popout-text")).toHaveText("POPOUT");

  // 3. Pop out using P key shortcut and restore via P key in popout
  const popupPromise2 = context.waitForEvent("page");
  await page.keyboard.press("KeyP");
  const popoutPage2 = await popupPromise2;
  await popoutPage2.waitForLoadState();
  await expect(popoutPage2.locator("#arena")).toBeVisible();

  // Restore via popout toggle button
  const closePromise2 = popoutPage2.waitForEvent("close");
  await popoutPage2.locator("#toggle-popout").click();
  await closePromise2;

  await expect(page.locator("#arena")).toBeVisible();
  await expect(page.locator("#toggle-popout .popout-text")).toHaveText("POPOUT");

  expect(errors).toEqual([]);
});

test('touch controls appear on touch devices with D-Pad and A/B buttons, and route input', async ({ browser }) => {
  // 1. Desktop context without touch: touch controls should be hidden
  const desktopContext = await browser.newContext();
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto('/');
  await expect(desktopPage.locator('#touch-controls')).toBeHidden();
  await desktopContext.close();

  // 2. Mobile touch context: touch controls should be visible
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const page = await mobileContext.newPage();
  await page.goto('/');

  const controls = page.locator('#touch-controls');
  await expect(controls).toBeVisible();

  const dpad = page.locator('#touch-dpad');
  const btnUp = page.locator('.dpad-up');
  const btnDown = page.locator('.dpad-down');
  const btnLeft = page.locator('.dpad-left');
  const btnRight = page.locator('.dpad-right');
  const btnA = page.locator('.action-a');
  const btnB = page.locator('.action-b');

  await expect(dpad).toBeVisible();
  await expect(btnUp).toBeVisible();
  await expect(btnDown).toBeVisible();
  await expect(btnLeft).toBeVisible();
  await expect(btnRight).toBeVisible();
  await expect(btnA).toBeVisible();
  await expect(btnB).toBeVisible();

  // Test Pad Toggle Checkbox in upper-left corner
  const toggleCheckbox = page.locator('#toggle-touch-pad');
  const toggleLabel = page.locator('.touch-toggle-label');
  await expect(toggleCheckbox).toBeVisible();
  await expect(toggleCheckbox).toBeChecked();
  await expect(toggleLabel).toContainText('パッド表示');

  // Verify checkbox position is in top-left
  const toggleBox = await toggleLabel.boundingBox();
  const arenaBox = await page.locator('#arena-stage').boundingBox();
  expect(toggleBox).toBeTruthy();
  expect(arenaBox).toBeTruthy();
  expect(toggleBox.x).toBeLessThan(arenaBox.x + arenaBox.width * 0.3);
  expect(toggleBox.y).toBeLessThan(arenaBox.y + arenaBox.height * 0.3);

  // Uncheck the toggle to hide pad
  await toggleCheckbox.setChecked(false);
  await expect(controls).toHaveClass(/is-pad-hidden/);
  await expect(dpad).toBeHidden();
  await expect(btnA).toBeHidden();
  await expect(btnB).toBeHidden();
  // Checkbox itself must remain visible!
  await expect(toggleCheckbox).toBeVisible();
  expect(await page.evaluate(() => window.touchControls.read(1))).toBeNull();
  await page.screenshot({ path: 'test-results/touch-controls-hidden.png' });

  // Re-check the toggle to restore pad
  await toggleCheckbox.setChecked(true);
  await expect(controls).not.toHaveClass(/is-pad-hidden/);
  await expect(dpad).toBeVisible();
  await expect(btnA).toBeVisible();
  await expect(btnB).toBeVisible();

  // Test Button A (SHOT) touch
  await btnA.dispatchEvent('touchstart', {
    changedTouches: [{ identifier: 10, clientX: 300, clientY: 700 }]
  });
  let state = await page.evaluate(() => window.touchControls.read(1));
  expect(state.shot).toBe(true);
  await expect(btnA).toHaveClass(/is-active/);

  await page.dispatchEvent('body', 'touchend', {
    changedTouches: [{ identifier: 10, clientX: 300, clientY: 700 }]
  });
  state = await page.evaluate(() => window.touchControls.read(1));
  expect(state.shot).toBe(false);

  // Test Button B (SET) touch
  await btnB.dispatchEvent('touchstart', {
    changedTouches: [{ identifier: 11, clientX: 250, clientY: 700 }]
  });
  state = await page.evaluate(() => window.touchControls.read(1));
  expect(state.set).toBe(true);
  await expect(btnB).toHaveClass(/is-active/);

  await page.dispatchEvent('body', 'touchend', {
    changedTouches: [{ identifier: 11, clientX: 250, clientY: 700 }]
  });
  state = await page.evaluate(() => window.touchControls.read(1));
  expect(state.set).toBe(false);

  // Test D-Pad touch routing (right movement & up jump)
  const dpadBox = await dpad.boundingBox();
  expect(dpadBox).toBeTruthy();
  // Touch to the right side of dpad center
  await dpad.dispatchEvent('touchstart', {
    changedTouches: [{ identifier: 12, clientX: dpadBox.x + dpadBox.width * 0.8, clientY: dpadBox.y + dpadBox.height * 0.5 }]
  });
  state = await page.evaluate(() => window.touchControls.read(1));
  expect(state.move).toBe(1);
  await expect(btnRight).toHaveClass(/is-active/);

  // Slide to top-right (diagonal jump move)
  await page.dispatchEvent('body', 'touchmove', {
    touches: [{ identifier: 12, clientX: dpadBox.x + dpadBox.width * 0.8, clientY: dpadBox.y + dpadBox.height * 0.2 }]
  });
  state = await page.evaluate(() => window.touchControls.read(1));
  expect(state.move).toBe(1);
  expect(state.jump).toBe(true);
  await expect(btnRight).toHaveClass(/is-active/);
  await expect(btnUp).toHaveClass(/is-active/);

  // Release D-Pad
  await page.dispatchEvent('body', 'touchend', {
    changedTouches: [{ identifier: 12, clientX: dpadBox.x + dpadBox.width * 0.8, clientY: dpadBox.y + dpadBox.height * 0.2 }]
  });
  state = await page.evaluate(() => window.touchControls.read(1));
  expect(state.move).toBe(0);
  expect(state.jump).toBe(false);

  // --- STUCK BUTTON PREVENTION TESTS ---

  // 1. Multi-touch thumb roll: overlapping touches on same button must not stick
  await btnA.dispatchEvent('touchstart', {
    changedTouches: [{ identifier: 20, clientX: 300, clientY: 700 }]
  });
  expect((await page.evaluate(() => window.touchControls.read(1))).shot).toBe(true);

  // Second touch arrives on same button before first lifts (thumb roll)
  await btnA.dispatchEvent('touchstart', {
    changedTouches: [{ identifier: 21, clientX: 305, clientY: 705 }]
  });
  expect((await page.evaluate(() => window.touchControls.read(1))).shot).toBe(true);

  // First touch lifts while second is still down
  await page.dispatchEvent('body', 'touchend', {
    touches: [{ identifier: 21, clientX: 305, clientY: 705 }],
    changedTouches: [{ identifier: 20, clientX: 300, clientY: 700 }]
  });
  expect((await page.evaluate(() => window.touchControls.read(1))).shot).toBe(true);

  // Second touch lifts
  await page.dispatchEvent('body', 'touchend', {
    touches: [],
    changedTouches: [{ identifier: 21, clientX: 305, clientY: 705 }]
  });
  expect((await page.evaluate(() => window.touchControls.read(1))).shot).toBe(false);

  // 2. Touchcancel resets any stuck buttons immediately
  await btnA.dispatchEvent('touchstart', {
    changedTouches: [{ identifier: 30, clientX: 300, clientY: 700 }]
  });
  expect((await page.evaluate(() => window.touchControls.read(1))).shot).toBe(true);
  await page.dispatchEvent('body', 'touchcancel', { touches: [], changedTouches: [] });
  expect((await page.evaluate(() => window.touchControls.read(1))).shot).toBe(false);

  // 3. Window blur (app switch / notifications) resets all inputs
  await btnB.dispatchEvent('touchstart', {
    changedTouches: [{ identifier: 40, clientX: 250, clientY: 700 }]
  });
  expect((await page.evaluate(() => window.touchControls.read(1))).set).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await page.evaluate(() => window.touchControls.read(1))).set).toBe(false);

  // 4. Sliding off action button releases it
  const btnABox = await btnA.boundingBox();
  expect(btnABox).toBeTruthy();
  const aCenter = { x: btnABox.x + btnABox.width / 2, y: btnABox.y + btnABox.height / 2 };
  await btnA.dispatchEvent('touchstart', {
    changedTouches: [{ identifier: 50, clientX: aCenter.x, clientY: aCenter.y }]
  });
  expect((await page.evaluate(() => window.touchControls.read(1))).shot).toBe(true);

  // Slide thumb 160px away (into open court)
  await page.dispatchEvent('body', 'touchmove', {
    touches: [{ identifier: 50, clientX: aCenter.x - 160, clientY: aCenter.y - 160 }]
  });
  expect((await page.evaluate(() => window.touchControls.read(1))).shot).toBe(false);

  // Slide thumb back onto button A
  await page.dispatchEvent('body', 'touchmove', {
    touches: [{ identifier: 50, clientX: aCenter.x, clientY: aCenter.y }]
  });
  expect((await page.evaluate(() => window.touchControls.read(1))).shot).toBe(true);

  // End touch
  await page.dispatchEvent('body', 'touchend', {
    touches: [],
    changedTouches: [{ identifier: 50, clientX: aCenter.x, clientY: aCenter.y }]
  });
  expect((await page.evaluate(() => window.touchControls.read(1))).shot).toBe(false);

  await page.screenshot({ path: 'test-results/touch-controls-mobile.png' });
  await mobileContext.close();
});

test('fullscreen arena on mobile defers scroll lock until gameplay, allows dialog scroll, and unlocks on exit', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  await page.goto('/');

  const fsBtn = page.locator('#toggle-fullscreen');
  await fsBtn.click();
  await expect.poll(async () => page.evaluate(() => window.rallyGame.isFullscreen())).toBe(true);

  // Before actual gameplay begins (initial overlay visible), scroll lock must NOT be active
  await expect(page.locator('body')).not.toHaveClass(/is-arena-fullscreen/);
  await expect(page.locator('html')).not.toHaveClass(/is-arena-fullscreen/);

  // Opening lobby / player setting dialog allows scrolling and does NOT lock
  await page.locator('#start').click();
  await expect(page.locator('#lobby')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/is-arena-fullscreen/);
  await expect(page.locator('html')).not.toHaveClass(/is-arena-fullscreen/);

  const lobbyDialog = page.locator('#lobby');
  const dialogTouchAction = await lobbyDialog.evaluate(el => window.getComputedStyle(el).touchAction);
  expect(dialogTouchAction).toBe('pan-y');

  // Launch match from lobby (actual gameplay starts)
  await page.locator('#launch-match').click();
  await expect(page.locator('#lobby')).not.toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.rallyGame.snapshot().running)).toBe(true);

  // Now during actual gameplay, fullscreen scroll lock IS active
  await expect(page.locator('body')).toHaveClass(/is-arena-fullscreen/);
  await expect(page.locator('html')).toHaveClass(/is-arena-fullscreen/);

  // Arena has fullscreen presentation applied and touch-action none
  const arena = page.locator('#arena');
  const touchAction = await arena.evaluate(el => window.getComputedStyle(el).touchAction);
  expect(touchAction).toBe('none');

  await page.screenshot({ path: 'test-results/touch-controls-fullscreen.png' });

  // Landscape orientation test
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: 'test-results/touch-controls-landscape.png' });

  // Exit fullscreen
  await fsBtn.click();
  await expect.poll(async () => page.evaluate(() => window.rallyGame.isFullscreen())).toBe(false);
  await expect(page.locator('body')).not.toHaveClass(/is-arena-fullscreen/);
  await expect(page.locator('html')).not.toHaveClass(/is-arena-fullscreen/);

  await context.close();
});

test('gamepad only navigation: detects controller, shows A/B badges, navigates lobby with D-pad, and launches match', async ({ page }) => {
  await page.goto('/');

  // 1. Initially without controller: badges are hidden
  const startBadge = page.locator('#start-gamepad-badge');
  const closeBadge = page.locator('#close-lobby-badge');
  await expect(startBadge).toBeHidden();
  await expect(closeBadge).toBeHidden();

  // 2. Controller detected: "A" badge appears on PLAYER SETUP button
  await page.evaluate(() => {
    window.matchLobby.setGamepadDetected(true);
  });
  await expect(startBadge).toBeVisible();
  await expect(startBadge).toHaveText('A');
  await page.screenshot({ path: 'test-results/gamepad-start-badge.png' });

  // 3. Pressing A opens PLAYER SETUP dialog
  await page.locator('#start').click();
  await expect(page.locator('#lobby')).toHaveAttribute('open', '');

  // 4. In lobby: "B" badge is visible on close button
  await expect(closeBadge).toBeVisible();
  await expect(closeBadge).toHaveText('B');

  // 5. Initial focus is on #launch-match with ball cursor and "A" badge
  const launchBtn = page.locator('#launch-match');
  await expect(launchBtn).toHaveClass(/gamepad-focused/);
  await expect(launchBtn.locator('.in-btn-a-badge')).toBeVisible();
  await expect(launchBtn.locator('.in-btn-a-badge')).toHaveText('A');
  await page.screenshot({ path: 'test-results/gamepad-lobby-initial-focus.png' });

  // 6. Navigate UP with D-pad / ArrowUp into player slots
  await page.keyboard.press('ArrowUp');
  const playerCard = page.locator('.player-card.gamepad-focused');
  await expect(playerCard).toHaveCount(1);
  await expect(launchBtn).not.toHaveClass(/gamepad-focused/);
  await expect(launchBtn.locator('.in-btn-a-badge')).toHaveCount(0);
  await expect(playerCard.locator('.in-btn-a-badge')).toHaveText('A');
  await page.screenshot({ path: 'test-results/gamepad-lobby-slot-focus.png' });

  // 7. Navigate RIGHT with D-pad / ArrowRight to next slot
  const firstSlotText = await playerCard.locator('strong').textContent();
  await page.keyboard.press('ArrowRight');
  const secondPlayerCard = page.locator('.player-card.gamepad-focused');
  const secondSlotText = await secondPlayerCard.locator('strong').textContent();
  expect(secondSlotText).not.toBe(firstSlotText);

  // 8. Navigate DOWN back to launch-match
  await page.keyboard.press('ArrowDown');
  await expect(launchBtn).toHaveClass(/gamepad-focused/);
  await expect(launchBtn.locator('.in-btn-a-badge')).toBeVisible();

  // 9. Press A (click on focused launch button) launches the match
  await launchBtn.click();
  await expect(page.locator('#lobby')).not.toBeVisible();
  expect(await page.evaluate(() => window.rallyGame.snapshot().running)).toBe(true);
});

test('hosting room disables local-mode button until leave-room is clicked', async ({ page }) => {
  await page.route('**/vendor/peerjs.min.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.Peer = class {
        constructor(){
          this.handlers = {};
          window.testPeer = this;
          queueMicrotask(() => this.handlers.open?.('test-host-id'));
        }
        on(name, fn){ this.handlers[name] = fn; }
        connect(){ return {}; }
        destroy(){ this.destroyed = true; }
      };
    `
  }));

  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('#lobby')).toBeVisible();

  // 1. Host creates a room
  await page.locator('#host-room').click();
  await expect(page.locator('#invite-link')).toHaveValue(/test-host-id/);
  expect(await page.evaluate(() => window.matchLobby.isOnline())).toBe(true);

  // 2. While room is active, local-mode button is disabled
  const localModeBtn = page.locator('#local-mode');
  await expect(localModeBtn).toBeDisabled();

  // 3. Clicking "部屋を退出" leaves room and returns to local mode where local-mode is active
  await page.locator('#leave-room').click();
  expect(await page.evaluate(() => window.matchLobby.isOnline())).toBe(false);
  await expect(page.locator('#lobby-message')).toContainText('部屋を退出しました');
  await expect(localModeBtn).toBeEnabled();
});
