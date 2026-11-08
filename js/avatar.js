// js/avatar.js - Character Avatar Management & Rendering System

(function() {
  'use strict';

  // 42-motion cell coordinate mapping for 7 rows x 6 columns
  // Row 0: Idle (6 frames)
  // Row 1: Run A (frames 0-5)
  // Row 2: Run B (frames 6-11)
  // Row 3: Jump (6 frames: squat, rise, peak, fall, prep, land)
  // Row 4: Attack (6 frames: approach, gather, windup, contact, follow, recover)
  // Row 5: Defense (0: rec-ready, 1: rec-hit, 2: toss-ready, 3: toss-hit, 4: block-active, 5: block-miss)
  // Row 6: Special/Serve (0: block-success, 1: dive, 2: prone, 3: getup, 4: serve-hold, 5: serve-toss)
  function getAvatarCell(pose) {
    if (!pose) return { row: 0, col: 0 };
    if (pose.service) {
      return { row: 6, col: pose.frame === 0 ? 4 : 5 };
    }
    if (pose.flying) {
      const f = Math.max(0, Math.min(2, pose.frame ?? 0));
      return { row: 6, col: 1 + f };
    }
    if (pose.block) {
      if (pose.frame === 3) return { row: 6, col: 0 }; // Block successful
      if (pose.frame === 2) return { row: 5, col: 4 }; // Active block
      return { row: 5, col: 5 }; // Block missed
    }
    if (pose.toss) {
      return { row: 5, col: 3 }; // Toss contact
    }
    if (pose.receive) {
      return { row: 5, col: 1 }; // Receive contact
    }
    if (pose.legacy) {
      if (pose.frame === 3) return { row: 5, col: 0 }; // Receive ready
      if (pose.frame === 4) return { row: 5, col: 2 }; // Toss ready
      return { row: 0, col: 0 };
    }
    if (pose.selectedRun) {
      const f = Math.abs(pose.frame ?? 0) % 12;
      return f < 6 ? { row: 1, col: f } : { row: 2, col: f - 6 };
    }
    if (pose.row === 3) {
      return { row: 3, col: Math.max(0, Math.min(5, pose.frame ?? 0)) };
    }
    if (pose.row === 2) {
      return { row: 4, col: Math.max(0, Math.min(5, pose.frame ?? 0)) };
    }
    if (pose.row === 1) {
      const f = Math.abs(pose.frame ?? 0) % 12;
      return f < 6 ? { row: 1, col: f } : { row: 2, col: f - 6 };
    }
    return { row: 0, col: Math.max(0, Math.min(5, pose.frame ?? 0)) };
  }

  class Avatar {
    constructor(def) {
      this.id = def.id;
      this.name = def.name || def.id;
      this.author = def.author || 'Custom';
      this.description = def.description || '';
      this.version = def.version || '1.0';
      this.type = def.type || 'sheet'; // 'builtin' | 'sheet' | 'split'
      this.folder = def.folder || null;
      this.portrait = def.portrait || null;
      this.portraitUrl = def.portraitUrl || (this.folder && this.portrait ? `${this.folder}/${this.portrait}` : null);
      this.sheetUrl = def.sheetUrl || (this.folder && def.sheet ? `${this.folder}/${def.sheet}` : null);
      this.parts = def.parts || null;
      this.partsUrls = def.partsUrls || null;
      this.ready = false;

      this.sheetImage = null;
      this.partImages = [];
      this.load();
    }

    load() {
      if (this.type === 'builtin') {
        this.ready = true;
        return;
      }

      if (this.type === 'sheet' && this.sheetUrl) {
        this.sheetImage = new Image();
        this.sheetImage.onload = () => {
          this.ready = true;
        };
        this.sheetImage.onerror = () => {
          console.warn(`[Avatar] Failed to load sheet image for ${this.id}: ${this.sheetUrl}`);
        };
        this.sheetImage.src = this.sheetUrl;
      } else if (this.type === 'split') {
        const rowKeys = ['idle', 'runA', 'runB', 'jump', 'attack', 'defense', 'special'];
        let loadedCount = 0;
        this.partImages = [];

        rowKeys.forEach((key, rowIndex) => {
          const filename = this.parts?.[key] || this.partsUrls?.[rowIndex];
          if (!filename) return;
          const url = this.partsUrls?.[rowIndex] || `${this.folder}/${filename}`;
          const img = new Image();
          img.onload = () => {
            loadedCount++;
            if (loadedCount >= rowKeys.length) this.ready = true;
          };
          img.onerror = () => {
            console.warn(`[Avatar] Failed to load split image ${key} for ${this.id}: ${url}`);
          };
          img.src = url;
          this.partImages[rowIndex] = img;
        });
      }
    }

    draw(ctx, p, pose, customX, customY, alpha = 1, glowColor = null) {
      if (!this.ready || this.type === 'builtin') return false;

      const cell = getAvatarCell(pose);
      let img = null;
      let sx = 0, sy = 0, sw = 256, sh = 256;

      if (this.type === 'sheet' && this.sheetImage?.complete && this.sheetImage.naturalWidth) {
        img = this.sheetImage;
        const colW = img.naturalWidth / 6;
        const rowH = img.naturalHeight / 7;
        sx = cell.col * colW;
        sy = cell.row * rowH;
        sw = colW;
        sh = rowH;
      } else if (this.type === 'split' && this.partImages[cell.row]?.complete && this.partImages[cell.row].naturalWidth) {
        img = this.partImages[cell.row];
        const colW = img.naturalWidth / 6;
        const rowH = img.naturalHeight;
        sx = cell.col * colW;
        sy = 0;
        sw = colW;
        sh = rowH;
      }

      if (!img) return false;

      // Scaling relative to standard character baseline
      // Template baseline is ground Y = 205, center X = 128 (within 256x256 cell)
      // Preview character size was 160, in-game size is 112 -> scale ratio = 112 / 160 = 0.7
      const scale = 112 / 160;
      const dw = 256 * scale;
      const dh = 256 * scale;
      const destX = -128 * scale;
      const destY = -205 * scale;
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

      ctx.drawImage(img, sx, sy, sw, sh, destX, destY, dw, dh);
      ctx.restore();
      return true;
    }
  }

  class AvatarManager {
    constructor() {
      this.avatars = new Map();
      this.playerAvatars = ['default', 'default', 'default', 'default'];
      this.listeners = new Set();
      this.ready = false;

      // Default builtin avatar
      this.registerAvatar(new Avatar({
        id: 'default',
        name: 'チーム標準 (デフォルト)',
        type: 'builtin'
      }));

      this.loadStorage();
    }

    loadStorage() {
      try {
        const saved = localStorage.getItem('sr_player_avatars');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === 4) {
            this.playerAvatars = parsed;
          }
        }
      } catch (e) {
        console.warn('[AvatarManager] Failed to load avatars from storage', e);
      }
    }

    saveStorage() {
      try {
        localStorage.setItem('sr_player_avatars', JSON.stringify(this.playerAvatars));
      } catch (e) {
        console.warn('[AvatarManager] Failed to save avatars to storage', e);
      }
    }

    async init() {
      try {
        const resp = await fetch('assets/avatars/manifest.json');
        if (resp.ok) {
          const manifest = await resp.json();
          for (const item of manifest) {
            if (item.id === 'default') continue;
            await this.loadAvatarFolder(item.folder, item);
          }
        }
      } catch (e) {
        console.warn('[AvatarManager] Failed to fetch avatar manifest', e);
      }
      this.ready = true;
      this.notify();
    }

    async loadAvatarFolder(folderName, metaHint = {}) {
      const folderPath = `assets/avatars/${folderName}`;
      try {
        const jsonResp = await fetch(`${folderPath}/avatar.json`);
        if (jsonResp.ok) {
          const config = await jsonResp.json();
          config.folder = folderPath;
          const avatar = new Avatar(config);
          this.registerAvatar(avatar);
          return avatar;
        }
      } catch (e) {
        // Fallback to metaHint
      }

      // Minimal fallback if avatar.json is absent
      const fallbackAvatar = new Avatar({
        id: metaHint.id || folderName,
        name: metaHint.name || folderName,
        folder: folderPath,
        type: 'sheet',
        sheet: 'sheet.png',
        portrait: 'portrait.png'
      });
      this.registerAvatar(fallbackAvatar);
      return fallbackAvatar;
    }

    registerAvatar(avatar) {
      this.avatars.set(avatar.id, avatar);
      this.notify();
    }

    getAvatars() {
      return Array.from(this.avatars.values());
    }

    getAvatar(id) {
      return this.avatars.get(id) || this.avatars.get('default');
    }

    getPlayerAvatar(playerIndex) {
      const id = this.playerAvatars[playerIndex] || 'default';
      return this.getAvatar(id);
    }

    setPlayerAvatar(playerIndex, avatarId) {
      if (playerIndex < 0 || playerIndex >= 4) return;
      this.playerAvatars[playerIndex] = avatarId;
      this.saveStorage();
      this.notify();
    }

    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    notify() {
      for (const fn of this.listeners) {
        try { fn(); } catch (err) { console.error(err); }
      }
    }

    // Import from local files / folders (Drag & Drop or folder input)
    async importFromFiles(fileList) {
      const files = Array.from(fileList);
      if (!files.length) return null;

      // Look for avatar.json
      let jsonFile = files.find(f => f.name.toLowerCase() === 'avatar.json');
      let sheetFile = files.find(f => /sheet.*\.png$/i.test(f.name) || /all-motions.*\.png$/i.test(f.name));
      let portraitFile = files.find(f => /portrait.*\.png$/i.test(f.name) || /icon.*\.png$/i.test(f.name));

      // Check for split parts (01-idle, 02-run, etc.)
      const splitMatches = {
        idle: files.find(f => /01.*idle.*\.png$/i.test(f.name) || /idle.*\.png$/i.test(f.name)),
        runA: files.find(f => /02.*run.*a.*\.png$/i.test(f.name) || /run-a.*\.png$/i.test(f.name)),
        runB: files.find(f => /03.*run.*b.*\.png$/i.test(f.name) || /run-b.*\.png$/i.test(f.name)),
        jump: files.find(f => /04.*jump.*\.png$/i.test(f.name) || /jump.*\.png$/i.test(f.name)),
        attack: files.find(f => /05.*attack.*\.png$/i.test(f.name) || /attack.*\.png$/i.test(f.name)),
        defense: files.find(f => /06.*defense.*\.png$/i.test(f.name) || /defense.*\.png$/i.test(f.name)),
        special: files.find(f => /07.*special.*\.png$/i.test(f.name) || /special.*\.png$/i.test(f.name))
      };

      let config = {};
      if (jsonFile) {
        try {
          const text = await jsonFile.text();
          config = JSON.parse(text);
        } catch (e) {
          console.warn('[AvatarManager] Failed to parse imported avatar.json', e);
        }
      }

      // Determine ID and name from folder name if available
      const pathParts = (files[0].webkitRelativePath || files[0].name).split('/');
      const folderName = pathParts.length > 1 ? pathParts[0] : 'custom-avatar';
      const id = config.id || `custom-${Date.now()}`;
      const name = config.name || folderName;

      let type = 'sheet';
      let sheetUrl = null;
      let portraitUrl = null;
      let partsUrls = null;

      if (portraitFile) {
        portraitUrl = URL.createObjectURL(portraitFile);
      }

      const hasAllSplits = Object.values(splitMatches).every(Boolean);
      if (hasAllSplits && !sheetFile) {
        type = 'split';
        partsUrls = [
          URL.createObjectURL(splitMatches.idle),
          URL.createObjectURL(splitMatches.runA),
          URL.createObjectURL(splitMatches.runB),
          URL.createObjectURL(splitMatches.jump),
          URL.createObjectURL(splitMatches.attack),
          URL.createObjectURL(splitMatches.defense),
          URL.createObjectURL(splitMatches.special)
        ];
        if (!portraitUrl && splitMatches.idle) {
          portraitUrl = URL.createObjectURL(splitMatches.idle);
        }
      } else if (sheetFile) {
        type = 'sheet';
        sheetUrl = URL.createObjectURL(sheetFile);
        if (!portraitUrl) portraitUrl = sheetUrl;
      } else if (files[0] && files[0].type.startsWith('image/')) {
        // Fallback: single image as sheet
        type = 'sheet';
        sheetUrl = URL.createObjectURL(files[0]);
        portraitUrl = sheetUrl;
      } else {
        throw new Error('アバター画像ファイル (sheet.png または 01-idle 等) が見つかりませんでした。');
      }

      const importedAvatar = new Avatar({
        id,
        name,
        author: config.author || 'User Upload',
        description: config.description || 'ローカルから読み込まれたカスタムアバター',
        type,
        sheetUrl,
        portraitUrl,
        partsUrls
      });

      this.registerAvatar(importedAvatar);
      return importedAvatar;
    }
  }

  // Global singleton
  window.avatarManager = new AvatarManager();

  // Initialize after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.avatarManager.init());
  } else {
    window.avatarManager.init();
  }
})();
