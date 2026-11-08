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

  const outPath = path.resolve(__dirname, '../assets/ogp.png');
  await page.screenshot({ path: outPath, type: 'png' });
  console.log(`Saved OGP image to ${outPath}`);

  await browser.close();
}

generateOgp().catch(err => {
  console.error(err);
  process.exit(1);
});
