# chen generation

Created with the built-in image generation tool using the chen portrait as the locked character reference and each corresponding `assets/avatar-templates/*-clean.png` as its pose reference.

Generated strips are packed into six 256x256 cells using nearest-neighbor scaling and preserved transparency, centered at X=128 and grounded at Y=205. The portrait uses the same alignment.

## Shared prompt

Use case: stylized-concept. Asset: SUNSET RALLY game sprite strip. Reference 1 is chen's LOCKED character design: preserve black long twin tails with pink tips, horn-like ornaments, red eyes, blue cropped jacket, black sleeves/cyan cuffs, white-gray short skirt, gloves, tall black boots. Reference 2 is the exact motion/layout template: replace its man with chen. Create one ultra-wide 1536x256 transparent PNG, exactly six equal 256x256 cells horizontally, no grid/text/borders. Pixel-art 16-bit arcade style matching chen portrait, not smooth illustration. Each character centered at local X128, ground Y205, leave 51px transparent below ground. Full body incl hair/feet within own cell, scale similar to template (standing height about 150px). Preserve six template poses and timing, limb angles and action differences. Do not copy template red clothing or red artifacts. Transparent background, no shadow/glow/scenery/weapons/ball. 

## Motion prompts

### 01-idle-clean.png

Motion: six distinct subtle breathing idle poses, bent knees, open hands in ready stance, facing right. Small natural bob and hair motion; seamless loop.

### 02-run-a-clean.png

Motion: running right, FIRST SIX frames of twelve-frame cycle. Match template stride and arm swings left-to-right, alternating legs, lean forward, hair trailing left. Six DIFFERENT sequential poses.

### 03-run-b-clean.png

Motion: running right, LAST SIX frames (7-12) of twelve-frame cycle. Match template stride and arm swings, opposite leg lead relative to first half, alternating foot plant/lift/flight, hair trailing left. Six DIFFERENT sequential poses, cycle returns to first run frame.

### 04-jump-clean.png

Motion: SIX jump phases exactly template: 1 deep squat arms back, 2 rise bent knees hands together in front, 3 apex knees tucked arms above head, 4 descent arms spread, 5 landing preparation arms forward, 6 deep landing crouch. Face right. No extra floating motion lines.

### 05-attack-clean.png

Motion: SIX volleyball spike phases exactly template: 1 approach squat, 2 gather turning torso drawing arm back, 3 airborne windup elbow bent behind head opposite arm pointing right, 4 high spike contact arm extended diagonally up/right, 5 follow-through arm sweeping down, 6 recovery crouch. Face right. Hands empty, no ball rendered.

### 06-defense-clean.png

Motion: SIX DIFFERENT defense poses exactly template: 1 low wide crouch joined forearms receive-ready, 2 forearm receive contact arms straight forward, 3 squat with both hands raised above forehead toss-ready, 4 straighten arms upward overhead set contact, 5 tall blocking jump both arms extended vertically hands open, 6 landing after missed block hands beside face knees bent. Face right three-quarter. No ball.

### 07-special-serve-clean.png

Motion SIX special poses exactly template: 1 successful block arms high leaning right, 2 horizontal airborne diving receive to right both arms extended forwards body horizontal, 3 lying PRONE flat on stomach facing right elbows forward, 4 rising from floor one knee and one hand on floor, 5 upright serve-ready left palm in front waist height, 6 toss-up standing one arm reaching diagonally up/right. No ball. Diving/prone sprites wider and much shorter than standing ones. Keep all six distinct full bodies inside cells.

