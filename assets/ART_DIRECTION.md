# A / Tropical Day

採用方向：明るい青空、ターコイズの海、白い砂浜。硬いドットの輪郭と色面を維持し、背景とキャラの描き込みを増やす。

## Background generation

Tool: built-in ImageGen. Output: `tropical-beach.png`.

Prompt:

Use case: stylized-concept. Production environment background asset for a 2D side-view beach volleyball game, landscape 16:9. Bright tropical midday, rich crisp handcrafted 32-bit PIXEL ART, consistent visible square pixels and stepped silhouettes, no antialiasing or blur. Azure blue sky with beautifully shaded cumulus clouds, turquoise ocean with layered wave bands and sparkling pixel foam, distant lush limestone tropical islands at far left and far right. Palm leaves frame only the extreme top corners. Sky top 40 percent; island/horizon 40–58 percent; ocean 58–72 percent; surf 72–75 percent; clean ivory-golden sand bottom 25 percent. Uncluttered central gameplay region. Camera straight horizontal side view, level shoreline, flat ground. No people, characters, ball, net, poles, scoreboard, UI, court markings, text, logos, or buildings. Dense pixel clusters and patterned shading.

## Implementation

背景は遠景（空・雲）、中景（島・水平線）、近景（海）の3層でパララックス描画。コート・砂浜・波打ち際にはパララックスを適用せず、白線と同じワールド座標で描く。時間経過だけによる背景の揺れは付けない。キャラは参考画像に合わせた4人×24コマ（走り6・待機6・アタック6・ジャンプ6）の透過アニメーションと既存のトス／レシーブ画像を使用。仕様と生成プロンプトは `CHARACTER_ART.md` を参照。画像ロード前はCanvasのドット描画を使う。背景ロード前は既存背景へフォールバックする。



