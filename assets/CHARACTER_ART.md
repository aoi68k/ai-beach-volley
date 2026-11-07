# 採用中の画像

4人全員の走りに、ユーザー指定の全身絵PNGを無加工で採用。各2172×724px、6列×2行、1セル362×362px。上段左→右、下段左→右の12コマを基準24fpsで再生する。

| キャラ | 保存先（characters/） | 指定された原本 |
| --- | --- | --- |
| 赤・男性 | coral-male-run-selected.png | exec-d1bb1a22-3142-4043-b3ae-444482ba2f7e.png |
| 赤・女性 | coral-female-run-selected.png | exec-a96ae707-dc0f-42b3-884c-ad2f5f685ff3.png |
| 青・男性 | blue-male-run-selected.png | exec-90573932-00f5-4940-a073-029eb0b4363d.png |
| 青・女性 | blue-female-run-selected.png | exec-425a2bc3-2a6d-4181-be12-41ef47d0a1ae.png |

全画像についてコピー元とSHA-256が一致。PNGの再生成、パーツ分割、再合成は行っていない。待機・アタック・ジャンプ・トス・レシーブは既存画像を維持し、走り画像の読み込み失敗時はそのキャラだけ旧v3へ戻る。

## 過去の復元記録

# Character sprites v3（復元済み）

直近のv4走りは不採用。ゲームとプレビューは元のv3走り6コマ・12fpsへ復元した。元の左右の連続性の問題は未解決。調査記録は `RUN_ANIMATION_REVIEW.md` を参照。v4画像とrigは調査資料として残すが、ゲーム／プレビューからは参照しない。



内蔵ImageGenで既存4人の中間ポーズを生成。各画像は1536 × 1024の透過PNG、6列 × 4行、1セル256 × 256。

| キャラ | 採用画像 |
| --- | --- |
| 赤・男性 | `characters/coral-male-v3.png` |
| 赤・女性 | `characters/coral-female-v3.png` |
| 青・男性 | `characters/blue-male-v3.png` |
| 青・女性 | `characters/blue-female-v3.png` |

| 行 | 動作 | コマ | ゲーム内の再生 |
| --- | --- | --- | --- |
| 0 | 待機 | 6 | 4fpsで呼吸ループ |
| 1 | 走り | 6 | 基準12fps、移動速度に追従 |
| 2 | アタック | 6 | 開始・振りかぶり・最大の溜め・振り抜き・フォロースルー・復帰、0.36秒で1回再生 |
| 3 | ジャンプ | 6 | 踏み切りの屈伸・伸展・上昇・頂点・下降・着地 |

新規96コマ。トス／ブロックとレシーブはv2の各1コマをそのまま参照するため、使用コマは計104枚。
ジャンプは入力時に従来どおり即座に物理計算を開始し、最初の0.05秒を屈伸、次の0.07秒を伸展に使用する。以降は鉛直速度で上昇・頂点・下降を判定。接地時に着地ポーズを0.16秒表示し、待機／走りへ復帰する。再ジャンプや新しい打球入力は遅延させない。着地時は直前のアタックポーズより着地ポーズを優先する。
アタックの見た目は打球イベントから再生し、当たり判定や球の発射タイミングを変更しない。プレイヤー単位で時計を管理し、一時停止中は全てのアニメーションを止める。

描画は112px角、v3の足元基準はセル内246px、v2は252px。右チームは水平反転。部分的なロード失敗はそのキャラだけv2へ戻し、両画像のロード前は手描きCanvasキャラへ戻す。

プレビュー: `../character-preview.html`（リポジトリルート）。再生・コマ送り・速度変更・左右反転・背景色切替に対応。
検証: `node tests/animation.test.cjs`。実ブラウザでもラリーと暗色背景上の透過を確認。
最終プロンプト一式: `characters/generation-prompts.json`。青チームには内蔵ImageGenで背景透過の修正も実施。

## v2（維持するトス／レシーブ・フォールバック）

Built-in ImageGenで生成。参照: `work/ChatGPT 画像 2026年11月3日 18_50_51.png`。
採用画像: `assets/volleyball-players-v2.png`（1536 × 1024、透過PNG）。
6列×4行。各セル256 × 256。赤男・赤女・青男・青女の順。
列は待機、走りA、走りB、レシーブ、トス／ブロック、ジャンプ／アタック。
全員右向き。右チームは描画時に反転。112px角で描画し足元をセル内252pxに揃える。
元のCanvasキャラはロード待ち・読み込み失敗時のフォールバックとして維持。

## Generation prompt

Use case: style-transfer.
Asset type: production transparent sprite atlas for a side-view beach volleyball game.
Reference image 1 supplies the four adult athlete identities, outfits and polished Japanese arcade pixel-art style. Create ONLY the characters as an exact regular 6-column by 4-row sprite sheet on true transparent background. No scene, net, ball, text, labels, grid lines, shadows or UI.
Canvas 1536 wide by 1024 high, each cell exactly 256 x 256. One full-body athlete centered horizontally in each cell, feet baseline at 236 pixels within cell, head around 48 pixels. Keep ALL extremities inside cell with padding. Same character scale throughout; athletic adult proportions, NOT chibi. Crisp pixel clusters, clean dark contours, beautiful warm skin shading and cloth folds readable at small game scale.
All characters face RIGHT in three-quarter side view.
Row 1: adult male red team, spiky brown hair, red headband with tails, red sleeveless jersey with white palm motif and red shorts with white trim.
Row 2: adult female red team, tan skin, long brown ponytail with hibiscus flower, red athletic crop top and red shorts with white trim.
Row 3: adult male blue team, blond spiky hair, sunglasses, blue sleeveless palm jersey, blue shorts white trim.
Row 4: adult female blue team, dark ponytail, blue visor, blue athletic crop top and blue shorts white trim.
Exactly six poses per row, left to right:
1 neutral ready stance slightly bent knees, hands ready.
2 running stride A right foot forward.
3 running stride B left foot forward.
4 low forearm volleyball receive, joined forearms extended forward.
5 overhead set/block with BOTH hands open raised above forehead.
6 airborne spike, one arm cocked above head, opposite arm forward, bent trailing leg.
Bare feet and matching wrist bands. Preserve the four distinct identities across every pose. Sharp high-quality 32-bit arcade pixel art faithful to reference. Transparent empty space between sprites, no opaque background.

## ブロック専用画像（2026-11-04）

`characters/block-v1.png`: 内蔵ImageGenで作成した透過PNG（1536×1024、6列×4行）。参照は `../assets/volleyball-players-v2.png`。上から赤男・赤女・青男・青女。画像は生成時の6コマを保存し、採用するのは3・4・5コマ目。

- ブロック判定中（blockTime > 0）：3コマ目を固定表示。
- ブロック成功直後：4コマ目を固定表示。
- 空振りで判定終了：5コマ目を固定表示。着地、別アクション、actionTime終了で通常の描画に戻る。
- キャラプレビューは採用した3状態だけを表示し、1コマ進む／戻るで切替可能。
- 画像の読み込み失敗時は元のトス／ブロック画像にフォールバック。物理演算と判定期間は変更しない。

最終生成プロンプト：`characters/block-generation-prompt.txt`。透過を保ったまま生成画像を無加工でコピー。112px角、セル内足元250pxを描画基準とする。

## アタックの採用コマ（更新）

空中ショット入力で3コマ目を固定表示。実際の打球イベントから5コマ目を0.12秒、6コマ目を0.24秒表示。クイック・ダブルも同様。空振りはヒット後のポーズへ進めず、入力を離すと通常のジャンプ表示へ戻る。フェイントは従来の6コマを維持。プレビューでは3→5→6を表示する。

## トスのヒット画像（2026-11-04）

`characters/toss-hit-v1.png`：内蔵ImageGenで既存v2のトス姿勢を参照して作成。1254×1254、2列×2行、各627px角、透過PNG。左上が赤男、右上が赤女、左下が青男、右下が青女。生成画像は無加工で保存。

トス入力中は既存のトス1コマ目（v2の5列目）を表示し、打球後0.3秒だけ新しい伸展姿勢を表示。ゲーム内120px角、足元は各セル589/589/602/604pxの位置で合わせる。プレビューも同じ比率で表示。読み込み失敗時は旧トスへ戻る。ボールの軌道・打球判定は変更しない。

生成プロンプト：`characters/toss-generation-prompt.txt`。

### トスのヒット v2（採用）

`characters/toss-hit-v2.png` に更新。v1を内蔵ImageGenで編集し、4人とも肘を伸ばして手を上げた。1254×1254の透過PNGを無加工保存。上段はy=0〜605、下段はy=606〜1253で切り出し、上げた手を切らず縦横比を維持。足元基準は各切り出し領域内589/589/624/625px。v1は比較用に保存。生成指示は `characters/toss-v2-generation-prompt.txt`。

## フライングレシーブ専用画像（2026-11-05）

`characters/flying-receive-v1.png`：2064×1536（3列×4行、各セル688×384px）の透過PNG。上から赤男・赤女・青男・青女、左から「飛び込み（0.24秒）」「はらばい（0.36秒）」「片膝・片手起き上がり（0.32秒）」の3状態（合計0.92秒）。ゲーム内では横136px・縦76px（セル内接地基準y=364px）で描画し、飛び込む向きに合わせて左右反転する。読み込み失敗時はv2のレシーブへフォールバック。`character-preview.html` でも3状態を確認可能。


## レシーブのヒット画像

`characters/receive-hit-v1.png`：内蔵ImageGenで既存 `volleyball-players-v2.png` のキャラ・絵柄を参照して新規作成した透過PNG。1254×1254、2列×2行（627px角）、左上が赤男、右上が赤女、左下が青男、右下が青女。生成画像を透過のまま無加工で保存。

既存v2の4列目を「構え」として保持。実際のレシーブ打球から18F（0.3秒）だけ、膝・上体を伸ばし両前腕を前に出した新しいヒット姿勢を表示し、その後は既存の構えに戻す。`FRAME_RULES.receiveContact` で表示時間を管理。打球の軌道・硬直・判定は変更しない。

ゲーム内では100px角、セル内の足元606/607/605/605pxを接地基準として描画。左右反転は通常のチーム向きに従う。新画像の未読込時は既存のレシーブへフォールバック。`character-preview.html` は「構え／ヒット」の2状態を表示。

最終生成プロンプト：`characters/receive-hit-generation-prompt.txt`。内蔵ImageGen使用。


## サーブ専用画像

`characters/serve-v1.png`：既存 `volleyball-players-v2.png` を参照し、内蔵ImageGenで作成した透過PNG。1774×887、4列×2行（各443.5px角）。生成画像は無加工で保存。上段は赤男の「保持／トス」、赤女の「保持／トス」、下段は同じ順で青男・青女。ボールは画像に含めず既存のボール画像を手元へ別描画する。

ゲーム内132px角（待機姿勢と体格を合わせて旧104pxから約27%拡大）。足元基準は赤男・赤女429/443.5、青男・青女431/443.5。ボール保持中は1コマ目、Aトス後は地上にいる最初の0.3秒だけ2コマ目。ジャンプと打球は既存画像を使用する。保持・放出するボールの手元位置も拡大率に合わせ、サーブ中は画面端に16pxの余白を確保して腕が切れないようにする。アニメーションプレビューも同じ拡大率で「サーブ・2状態」を表示。

生成プロンプト：`characters/serve-generation-prompt.txt`。内蔵ImageGen使用。
