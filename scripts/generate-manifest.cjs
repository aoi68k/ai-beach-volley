const fs = require('node:fs');
const path = require('node:path');

function scanAvatars() {
  const root = path.resolve(__dirname, '..');
  const avatarsDir = path.join(root, 'assets', 'avatars');

  if (!fs.existsSync(avatarsDir)) {
    console.warn('[AvatarScan] avatars directory not found:', avatarsDir);
    return [];
  }

  const manifest = [
    {
      id: 'default',
      name: 'チーム標準 (デフォルト)',
      type: 'builtin'
    }
  ];

  const entries = fs.readdirSync(avatarsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;

    const folderName = entry.name;
    const folderPath = path.join(avatarsDir, folderName);
    const jsonPath = path.join(folderPath, 'avatar.json');

    let meta = {
      id: folderName,
      name: folderName,
      folder: folderName
    };

    if (fs.existsSync(jsonPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        meta.id = parsed.id || folderName;
        meta.name = parsed.name || folderName;
        if (parsed.type) meta.type = parsed.type;
      } catch (err) {
        console.warn(`[AvatarScan] Error parsing ${jsonPath}:`, err.message);
      }
    } else {
      // Auto-detect type from files in folder
      const files = fs.readdirSync(folderPath);
      const hasSheet = files.some(f => /sheet.*\.png$/i.test(f) || /all-motions.*\.png$/i.test(f));
      const hasSplit = files.some(f => /01.*idle.*\.png$/i.test(f));
      if (hasSplit && !hasSheet) {
        meta.type = 'split';
      } else if (hasSheet) {
        meta.type = 'sheet';
      }
    }

    manifest.push(meta);
  }

  const manifestPath = path.join(avatarsDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`[AvatarScan] Scanned ${manifest.length - 1} avatars into manifest.json:`,
    manifest.slice(1).map(a => a.id).join(', '));

  return manifest;
}

if (require.main === module) {
  scanAvatars();
}

module.exports = { scanAvatars };
