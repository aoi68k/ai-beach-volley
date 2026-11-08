(() => {
  const { fps, rules: r, recovery, speeds, knockback } = window.rallyGame.frameRules();
  const f = value => `${value}F`;
  const rows = [
    // 地上A
    ['地上A', 'レシーブ', '地上 A（方向なし）', '打球時', f(recovery.receive), '地上A長押しで構え（横移動不可）。自陣ネット手前へ山なりに上げ、味方のトス・アタックへ繋ぐ。離れた球へ移動＋Aはフライングレシーブ。打球姿勢が残る間は地上の横移動・ジャンプ不可。'],
    ['地上A', 'ダイレクトレシーブ', '地上 前＋A', '打球時', f(recovery.receive), '構え中に前を入力、または前＋Aで相手コートへ直接返球する。相手コートの中央〜奥へ山なりに飛ぶ。打球姿勢が残る間は地上の横移動・ジャンプ不可。'],
    ['地上A', 'パワーレシーブ（1sp）', '1sp所持・地上 下＋A', '打球時', f(recovery.powerReceive), '1sp消費して緑色に光る球を上げる。ダブルアタックや強化技のノックバックを完全無効化し、接触硬直も10Fと短い。自陣ネット手前へ上がり、味方は即座にクイック可能。'],
    ['地上A', 'フライングレシーブ', '離れた球へ移動＋A', '飛び込み開始', f(recovery.flying), `地上でボールから離れている時にボール方向＋Aで飛び込む。飛び込み${f(r.flyingDive)} → 腹ばい${f(r.flyingProne)} → 起き上がり${f(r.flyingGetup)}。自動移動あり。命中時は残り時間（最低${f(r.flyingMinRecovery)}）を再設定。`],

    // 地上B
    ['地上B', 'トス', '地上/空中 B（方向なし）', '打球時', f(recovery.set), `自陣へ通常のトスを上げる。姿勢が残る間と構え中は地上の横移動・ジャンプ不可。ヒット姿勢は${f(r.tossContact)}。`],
    ['地上B', 'ハイセット', '地上/空中 下＋B', '打球時', f(recovery.set), `下＋Bで自陣へ高く打ち上げるハイセット（高めのトス）。滞空時間が長く、味方の助走や攻撃タイミングを作りやすい。姿勢が残る間と構え中は地上の横移動・ジャンプ不可。ヒット姿勢は${f(r.tossContact)}。`],

    // 空中A
    ['空中A', 'アタック', '空中 A（方向なし）', '着地時', f(r.landingRecovery), `相手コートの前〜中央を狙う標準スパイク。空中でA長押し（${f(r.attackCharge)}継続）で最大弾速へチャージ。A解除でリセット。`],
    ['空中A', 'クイック', 'トス／パワーレシーブ上昇中に空中 A', '着地時', f(r.landingRecovery), '味方トスまたはパワーレシーブが上昇中の早いタイミングで空中アタックすると自動発動。黄色い光。ネット通過後はドライブがかかり急降下する。'],
    ['空中A', 'ダブルアタック', '味方の返球に空中 Aを重ねる', '着地時', f(r.landingRecovery), '味方が相手コートへ返球した球に、もう1人が空中でアタックを重ねると発動。オレンジの光。相手の入力硬直を増加させノックバック。'],
    ['空中A', 'ディープアタック', '空中 前＋A', '着地時', f(r.landingRecovery), `前＋Aでネット頂上より上を狙い相手コート奥へ突き刺すロングスパイク。空中でA長押し（${f(r.attackCharge)}継続）で最大弾速へチャージ。A解除でリセット。`],
    ['空中A', 'ループシュート', '空中 後＋A', '着地時', f(r.landingRecovery), '相手のブロックやジャンプアタックが届かない高弾道で相手コートの中腹へ落とす技。ネット通過後はドライブがかかり急降下する。相手ブロック無効。'],
    ['空中A', 'パワーアタック（1sp）', '1sp所持・空中 下＋A', '着地時', f(r.landingRecovery), '青く発光する強力スパイク。受け手は後方へノックバック（地上受けは弱、空中受けは強）し、球も自陣へ高く弾ける。打球時に1sp消費。'],

    // 空中B
    ['空中B', 'キルブロック（ネット直上／相手側でブロック）', '空中 B（ネット直上・相手側で接触）', '着地時', f(r.landingRecovery), 'ボールがネットを越える前（相手コート側や白帯の真上）で捉えると、ネット越え補正が不要となり相手の足元砂浜へドカンと叩き落とす超高速ブロック（ドシャット）。'],
    ['空中B', 'ソフトブロック（自陣側でブロック）', '空中 B（自陣コート側で接触）', '着地時', f(r.landingRecovery), 'ボールがネットを越えて自陣側に入った後に捉えると、ネットの白帯を安全に飛び越えさせるため滞空時間が引き延ばされ、山なりにふわりと相手コートへ落ちる優しい弾道になる。'],
    ['空中B', 'フェイント', '空中 後＋B', '着地時', f(r.landingRecovery), 'ネット際へ落とす軟打。相手のブロック判定で防がれない（ブロック無効）。ネット通過後はドライブ（下向き加速度）がかかり、相手コートのネット際へ急降下する。'],
    ['空中B', 'モズ落とし（1sp）', '1sp所持・空中 下＋B', '着地時', f(r.landingRecovery), '高く打ち上げ、相手コート上空で急降下する必殺トス。青く発光。打球時に1sp消費。'],

    // サーブ
    ['サーブ', '地上サーブ（B）', '保持中に B（方向なし）', '打球時', f(recovery.attack), '相手コート中央へ高く山なり（直接アタックやブロック不可）。弾速は打球位置とネット越えの軌道で変動。'],
    ['サーブ', 'ジャンプサーブ（A）', 'サーブトス後、空中 A', '着地時', f(r.landingRecovery), 'Aで斜め前へトス後、前ジャンプして空中A。通常アタックと同じ弾道計算。'],
    ['サーブ', 'ジャンプサーブ（前＋A）', 'サーブトス後、空中 前＋A', '着地時', f(r.landingRecovery), '低めで速い弾道で相手コートの前〜中央へ突き刺すジャンプサーブ。'],
    ['サーブ', 'ジャンプサーブ（上＋A）', 'サーブトス後、空中 上＋A', '着地時', f(r.landingRecovery), '相手コート奥へ伸び、ネット通過後に急降下するドライブ弾道。ブロック不可。'],
    ['サーブ', 'ジャンプサーブ（後＋A）', 'サーブトス後、空中 後＋A', '着地時', f(r.landingRecovery), 'ゆっくり山なりの緩急サーブ。'],
    ['サーブ', 'パワーサーブ（1sp）', '1sp所持・サーブトス後、空中 下＋A', '着地時', f(r.landingRecovery), '青い超高速・低空サーブ。地上・空中や受ける技を問わずノックバックし、球は真上へ跳ねる。打球時に1sp消費。'],

    // その他
    ['その他', 'ジャンプ・着地', 'ジャンプ後の着地', '着地時', `空中接触あり：${f(r.landingRecovery)}／なし：0F`, `空中で実際にボールに触れた場合だけ着地硬直（${f(r.landingRecovery)}）が発生し移動・ジャンプ・打球を制限。構え・空振りだけなら追加硬直なし。着地画像は${f(r.landingAnimation)}。`]
  ];
  const cap = (base, max) => `横速度上限 ${base} → ${max ?? Math.round(base * speeds.chargeMultiplier)}（構え最大）`;
  const kb = (level, speed) => `${level}：初速${speed}／理論${Math.round(speed / knockback.decay)}px`;
  const reference = variant => `可変／参考初速 約${Math.round(speeds.referenceServes[variant])}`;
  const motion = {
    'レシーブ': ['なし', '可変（自陣ネット手前へ上げる軌道）', '—'],
    'ダイレクトレシーブ': ['なし', '可変（相手コートへ返す軌道）', '—'],
    'トス': ['なし', `上向き ${speeds.toss}（縦）`, '—'],
    'ハイセット': ['なし', `上向き ${speeds.highToss}（縦）`, '—'],
    'アタック': ['なし', cap(speeds.attack), '—'],
    'クイック': ['なし', cap(speeds.quick, speeds.quickMax ?? 1450), `${speeds.quickDrive ?? 820}`],
    'ダブルアタック': [kb('中', knockback.double), cap(speeds.attack, Math.round(speeds.attack * speeds.chargeMultiplier)), '—'],
    'ディープアタック': ['なし', cap(speeds.attack), '—'],
    'ループシュート': ['なし', '約500〜560', '1150'],
    'パワーアタック（1sp）': [`地上 弱：初速${knockback.empoweredGround}／理論${Math.round(knockback.empoweredGround / knockback.decay)}px、空中 強：初速${knockback.empowered}／理論${Math.round(knockback.empowered / knockback.decay)}px`, cap(Math.round(speeds.attack * speeds.empoweredMultiplier), speeds.empoweredMax ?? 1350), '—'],
    'キルブロック（ネット直上／相手側でブロック）': ['なし', '超高速 約500〜560（急降下）', '—'],
    'ソフトブロック（自陣側でブロック）': ['なし', '緩やか 約110〜200（山なり）', '—'],
    'フェイント': ['なし', '可変（ネット際へ落とす軟打）', '750'],
    'モズ落とし（1sp）': ['なし', `上昇は可変／急降下開始 ${speeds.mozuDive}（縦）`, '820'],
    'パワーレシーブ（1sp）': ['無効化', `上向き ${speeds.powerReceive ?? 500}（縦）`, '—'],
    '地上サーブ（B）': ['なし', '可変（中央へ落ちる軌道）', '—'],
    'ジャンプサーブ（A）': ['なし', cap(speeds.attack), '—'],
    'ジャンプサーブ（前＋A）': ['なし', reference('fast'), '—'],
    'ジャンプサーブ（上＋A）': ['なし', reference('high'), '220'],
    'ジャンプサーブ（後＋A）': ['なし', reference('slow'), '—'],
    'パワーサーブ（1sp）': [kb('中・地上も対象', knockback.powerServe), reference('power'), '—'],
    'フライングレシーブ': ['なし', '可変（高めに打ち上げる）', '—']
  };
  const body = document.querySelector('#frame-data-body');
  let prevCategory = null;
  rows.forEach(row => {
    const category = row[0];
    const actionName = row[1];
    row.splice(5, 0, ...(motion[actionName] ?? ['—', '—', '—']));
    const tr = document.createElement('tr');
    if (prevCategory !== null && category !== prevCategory) {
      tr.classList.add('category-boundary');
    }
    prevCategory = category;
    row.forEach((value, index) => {
      let cell;
      if (index === 0) {
        cell = document.createElement('td');
        cell.className = 'frame-category';
      } else if (index === 1) {
        cell = document.createElement('th');
        cell.scope = 'row';
      } else {
        cell = document.createElement('td');
      }
      cell.textContent = value;
      tr.append(cell);
    });
    body.append(tr);
  });
  document.querySelector('#frame-data-basis').textContent = `1F = 1/${fps}秒。60F = 1秒。画面のリフレッシュレートに関係なく同じ時間で進み、一時停止中は進みません。`;
  document.querySelector('#frame-data-motion').textContent = '速度はゲーム内座標のpx/秒です。「横速度上限」は横成分の設定上限で、実際はネット・着地点に応じて調整します。球全体の速さは縦成分も含むため、重力や打球位置で変わります。「ドライブ効果」はネット通過後にボールが急降下する最大落下速度（px/秒）の強さです。';
  const landingEl = document.querySelector('#frame-data-landing');
  if (landingEl) landingEl.textContent = `【ジャンプ操作と着地硬直】ジャンプ中のボタン操作は1ジャンプにつき1回までです。アタック・ディープアタック・クイック・ダブル・ループシュート・フェイント・空中トス・モズ落とし・パワーアタック・ジャンプサーブ・ブロック等のジャンプ系操作の入力硬直は、空中でボールに触れた場合のみ着地時から発生する着地硬直（${f(r.landingRecovery)}）となります。空中でボールに触れなかった場合は着地硬直0です。`;
  document.querySelector('#frame-data-cooldown').textContent = `通常の再打球待ちは、人が操作するキャラは${f(r.humanCooldown)}、COMは${r.comCooldownMin}〜${f(r.comCooldownMax)}。入力硬直と同時に進むため、合計ではなく長い方が適用されます。`;
  document.querySelector('#frame-data-double').textContent = `ダブルアタックを受けると入力硬直は${r.doubleImpactMultiplier}倍＋ノックバック。レシーブ${f(recovery.receive*r.doubleImpactMultiplier)}、トス${f(recovery.set*r.doubleImpactMultiplier)}、ブロック／アタック／フェイント${f(recovery.attack*r.doubleImpactMultiplier)}。フライングは命中時の残り硬直×${r.doubleImpactMultiplier}です。パワーレシーブで受けた場合はノックバックと倍加硬直を無効化（${f(recovery.powerReceive)}）できます。`;
  document.querySelector('#frame-data-knockback').textContent = `ノックバックは3段階：弱${knockback.empoweredGround}（パワーアタック地上受球） ＜ 中${knockback.double}（ダブル・パワーサーブ） ＜ 強${knockback.empowered}（パワーアタック空中受球）。数値は後方への初速（px/秒）で、時間とともに減衰します。理論距離はコート端などの制限がない場合の目安です。パワーアタックは地上受けで弱・空中受けで強となり、受け手の入力硬直は地上受けで最低${f(Math.round(knockback.impactRecovery*0.75))}、空中受けで最低${f(knockback.impactRecovery)}です。パワーレシーブはこれらのノックバックを無効化できます。`;
  document.querySelector('#frame-data-speed-reference').textContent = '方向付きサーブの「参考初速」は、左側の球位置 x=61・y=320 から打った場合の縦横を合わせた速さです。実際の打球位置・タイミングで変動します。左右チームでは同じ条件なら対称です。';
  const blockSpeedEl = document.querySelector('#frame-data-block-speed');
  if (blockSpeedEl) {
    blockSpeedEl.textContent = '【ブロック成功時の弾速】ブロック成立時の弾速は「ボールを捉えた位置（ネットとの前後関係）」で決まります。ネット直上・相手コート側（ネットを越える前）でキルブロックした場合は、ネット越え補正が不要なため相手の足元砂浜へ突き刺さる超高速弾道（約500〜560px/秒）になります。自陣側（ネットを越えた後）でソフトブロックした場合は、自陣ネットを安全に越えるための軌道補正が入り、山なりの緩やかな返球（約110〜200px/秒）になります。';
  }
  document.querySelector('#frame-data-gauge').textContent = '【スペシャルゲージ増加ルール】ボールがネットを越えて相手コートへ返球されると、自チームの全員にゲージが付与されます。基本増加量は返球までのタッチ数（1回:1pt、2回:2pt、3回:3pt、4回:1pt、5回以上:0pt）で、さらに返球を打った本人はボーナス+2ptを獲得します（例：3タッチでスパイクした選手は合計5pt、味方は3pt）。10pt貯まるとSPが1増加（最大9個まで蓄積可能）。各スペシャル技（モズ落とし・パワーアタック・パワーサーブ・パワーレシーブ）は打球時に1spを消費します。※キャラ挙動チェック中は確認のため毎秒2pt自動増加。';
  document.querySelector('#show-frame-data').onclick = () => {
    const panel = document.querySelector('#frame-data'); panel.open = true;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    panel.querySelector('summary').focus({ preventScroll: true });
  };
})();
