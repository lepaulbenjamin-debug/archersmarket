/**
 * Dérive les déclinaisons de marque à partir du logo officiel (assets/icon.png).
 * - détoure le fond noir (flood fill depuis les bords)
 * - variante claire : le métal blanc devient gris, les traits noirs deviennent blancs
 */
// Usage : npm i -D playwright && node scripts/derive-brand-assets.js
// (CHROMIUM_PATH permet de pointer un Chromium déjà installé)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const BRAND = path.join(ASSETS, 'brand');

(async () => {
  fs.mkdirSync(BRAND, { recursive: true });
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const page = await browser.newPage();
  await page.goto('about:blank');

  const src = 'data:image/png;base64,' + fs.readFileSync(path.join(ASSETS, 'icon.png')).toString('base64');

  const out = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.width, H = img.height;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, W, H);
    const px = data.data;

    // 1. Détourage : flood fill des pixels quasi noirs depuis les bords
    const isDark = (i) => px[i] < 40 && px[i + 1] < 40 && px[i + 2] < 40;
    const seen = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) { stack.push(x, x + (H - 1) * W); }
    for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
    while (stack.length) {
      const p = stack.pop();
      if (seen[p]) continue;
      const i = p * 4;
      if (!isDark(i)) continue;
      seen[p] = 1;
      px[i + 3] = 0;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W);
      if (y < H - 1) stack.push(p + W);
    }

    // Boîte englobante du dessin
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (px[(y * W + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    ctx.putImageData(data, 0, 0);

    // Recadrage avec une marge de 2 %
    const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
    const bx = Math.max(0, minX - pad), by = Math.max(0, minY - pad);
    const bw = Math.min(W, maxX + pad) - bx, bh = Math.min(H, maxY + pad) - by;
    const crop = document.createElement('canvas');
    crop.width = bw; crop.height = bh;
    crop.getContext('2d').drawImage(c, bx, by, bw, bh, 0, 0, bw, bh);
    const dark = crop.toDataURL('image/png');

    // 2. Variante claire : niveaux de gris inversés, orange conservé
    const lightCanvas = document.createElement('canvas');
    lightCanvas.width = bw; lightCanvas.height = bh;
    const lctx = lightCanvas.getContext('2d');
    lctx.drawImage(crop, 0, 0);
    const ld = lctx.getImageData(0, 0, bw, bh);
    const lp = ld.data;
    for (let i = 0; i < lp.length; i += 4) {
      if (lp[i + 3] === 0) continue;
      const r = lp[i], g = lp[i + 1], b = lp[i + 2];
      const neutral = Math.max(r, g, b) - Math.min(r, g, b) < 26;
      if (!neutral) continue; // orange de marque : inchangé
      const L = (r + g + b) / 3;
      const v = Math.round(255 - (L / 255) * (255 - 88));
      lp[i] = v; lp[i + 1] = v; lp[i + 2] = v;
    }
    lctx.putImageData(ld, 0, 0);
    const light = lightCanvas.toDataURL('image/png');

    // 3. Monochrome blanc (icône Android monochrome)
    const monoCanvas = document.createElement('canvas');
    monoCanvas.width = bw; monoCanvas.height = bh;
    const mctx = monoCanvas.getContext('2d');
    mctx.drawImage(crop, 0, 0);
    const md = mctx.getImageData(0, 0, bw, bh);
    for (let i = 0; i < md.data.length; i += 4) {
      if (md.data[i + 3] === 0) continue;
      md.data[i] = 255; md.data[i + 1] = 255; md.data[i + 2] = 255;
    }
    mctx.putImageData(md, 0, 0);
    const mono = monoCanvas.toDataURL('image/png');

    // Compose une image centrée dans un carré de 1024
    const square = (source, ratio) =>
      new Promise((resolve) => {
        const s = new Image();
        s.onload = () => {
          const size = 1024;
          const sq = document.createElement('canvas');
          sq.width = size; sq.height = size;
          const sctx = sq.getContext('2d');
          const scale = Math.min((size * ratio) / s.width, (size * ratio) / s.height);
          const w = s.width * scale, h = s.height * scale;
          sctx.drawImage(s, (size - w) / 2, (size - h) / 2, w, h);
          resolve(sq.toDataURL('image/png'));
        };
        s.src = source;
      });

    return {
      dark,
      light,
      splash: await square(dark, 0.86),
      foreground: await square(dark, 0.62),
      monochrome: await square(mono, 0.62),
      ratio: bw / bh,
      box: [bw, bh],
    };
  }, src);

  const write = (file, dataUrl) =>
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

  write(path.join(BRAND, 'emblem-dark.png'), out.dark);
  write(path.join(BRAND, 'emblem-light.png'), out.light);
  write(path.join(ASSETS, 'splash-icon.png'), out.splash);
  write(path.join(ASSETS, 'android-icon-foreground.png'), out.foreground);
  write(path.join(ASSETS, 'android-icon-monochrome.png'), out.monochrome);

  // Fond adaptatif et favicon repris du logo officiel
  await page.setViewportSize({ width: 200, height: 200 });
  await page.setContent(`<body style="margin:0"><div id="bg" style="width:1024px;height:1024px;background:#000"></div></body>`);
  await page.locator('#bg').screenshot({ path: path.join(ASSETS, 'android-icon-background.png') });

  await page.setContent(
    `<body style="margin:0;background:#000"><img id="f" src="${src}" style="display:block;width:96px;height:96px"></body>`,
  );
  await page.locator('#f').screenshot({ path: path.join(ASSETS, 'favicon.png') });

  await browser.close();
  console.log('emblème', out.box.join('x'), 'ratio', out.ratio.toFixed(3));
})();
