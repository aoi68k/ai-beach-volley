const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function generateOgp() {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  const previewPath = path.resolve(__dirname, '../assets/gameplay-preview.png');
  const previewBase64 = fs.readFileSync(previewPath).toString('base64');
  const dataUri = `data:image/png;base64,${previewBase64}`;

  // 1200x630 で background-size: cover, center
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body, html {
            width: 1200px;
            height: 630px;
            overflow: hidden;
            background: #000;
          }
          .bg {
            width: 1200px;
            height: 630px;
            background-image: url('${dataUri}');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
          }
        </style>
      </head>
      <body>
        <div class="bg"></div>
      </body>
    </html>
  `);

  // 1. Regular OGP (1200x630, full gameplay view)
  const outPath = path.resolve(__dirname, '../assets/ogp.png');
  await page.screenshot({ path: outPath, type: 'png' });
  console.log(`Saved OGP image to ${outPath}`);

  // 2. Invite OGP (1200x386, lower half with all 4 characters focused)
  const inviteW = 1200;
  const inviteH = 386;
  const invitePage = await context.newPage();
  await invitePage.setViewportSize({ width: inviteW, height: inviteH });
  await invitePage.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body, html {
            width: ${inviteW}px;
            height: ${inviteH}px;
            overflow: hidden;
            background: #000;
          }
          canvas {
            display: block;
            width: ${inviteW}px;
            height: ${inviteH}px;
          }
        </style>
      </head>
      <body>
        <canvas id="c" width="${inviteW}" height="${inviteH}"></canvas>
        <script>
          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          img.onload = () => {
            ctx.imageSmoothingEnabled = false;
            // Crop lower half: sy=230, sh=378 from 1174x608 original
            ctx.drawImage(img, 0, 230, 1174, 378, 0, 0, ${inviteW}, ${inviteH});
            window.__rendered = true;
          };
          img.src = '${dataUri}';
        </script>
      </body>
    </html>
  `);
  await invitePage.waitForFunction(() => window.__rendered === true);
  const outInvitePath = path.resolve(__dirname, '../assets/ogp-invite.png');
  await invitePage.screenshot({ path: outInvitePath, type: 'png' });
  console.log(`Saved Invite OGP image to ${outInvitePath}`);
  await invitePage.close();

  await browser.close();
}

generateOgp().catch(err => {
  console.error(err);
  process.exit(1);
});
