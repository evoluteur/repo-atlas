/* repo-atlas · 1200×630 share card drawn on canvas (browser only) */
(function (root) {
  'use strict';

  // The card always uses the light plate so it reads the same wherever it is posted.
  const P = {
    paper: '#f3f5f7', ink: '#16202b', ink2: '#3c4a58', muted: '#5d6b79', line: '#d5dde5',
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'], other: '#a7b1bb'
  };
  const color = (c) => (c.other ? P.other : P.series[c.slot % P.series.length]);
  const F = { display: '"Barlow Condensed", "Arial Narrow", sans-serif', body: '"Source Serif 4", Georgia, serif', data: '"IBM Plex Mono", ui-monospace, Menlo, monospace' };

  function fit(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t + '…';
  }

  async function drawCard(canvas, { login, model, layout, url }) {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* fall back */ }
    const W = 1200, H = 630, dpr = 2;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);

    // graticule: faint survey grid behind the map
    ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
    for (let gx = 40; gx < 600; gx += 40) { ctx.beginPath(); ctx.moveTo(gx + 0.5, 30); ctx.lineTo(gx + 0.5, H - 30); ctx.stroke(); }
    for (let gy = 30; gy < H - 20; gy += 40) { ctx.beginPath(); ctx.moveTo(30, gy + 0.5); ctx.lineTo(590, gy + 0.5); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // map, rescaled from the on-page layout into a 540px square
    const box = 540, ox = 30, oy = 45;
    const s = box / Math.max(layout.W, layout.H);
    const dx = ox + (box - layout.W * s) / 2, dy = oy + (box - layout.H * s) / 2;
    (layout.nodes.children || []).forEach((cn) => {
      const c = cn.data.cluster;
      ctx.beginPath(); ctx.arc(dx + (cn.x - (layout.ox || 0)) * s, dy + (cn.y - (layout.oy || 0)) * s, cn.r * s, 0, 2 * Math.PI);
      ctx.fillStyle = color(c); ctx.globalAlpha = 0.12; ctx.fill(); ctx.globalAlpha = 0.6;
      ctx.strokeStyle = color(c); ctx.lineWidth = 1.25; ctx.stroke(); ctx.globalAlpha = 1;
      (cn.children || []).forEach((ln) => {
        const x = dx + (ln.x - (layout.ox || 0)) * s, y = dy + (ln.y - (layout.oy || 0)) * s, r = Math.max(ln.r * s, 1.8);
        ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color(c); ctx.fill(); ctx.strokeStyle = P.paper; ctx.lineWidth = 1.2; ctx.stroke();
      });
    });

    // right column
    const L = 640, R = W - 56, cw = R - L;
    ctx.fillStyle = P.muted; ctx.font = `600 15px ${F.data}`;
    ctx.fillText('REPO-ATLAS', L, 78);
    ctx.fillStyle = P.ink; ctx.font = `700 64px ${F.display}`;
    ctx.fillText(fit(ctx, '@' + login, cw), L, 140);
    const since = model.span ? model.span[0].slice(0, 4) : '';
    ctx.fillStyle = P.ink2; ctx.font = `400 22px ${F.body}`;
    ctx.fillText(`${model.repos.length} repos · ${model.stars.toLocaleString('en-US')} stars${since ? ' · since ' + since : ''}`, L, 176);

    // where the stars sit
    ctx.fillStyle = P.muted; ctx.font = `600 13px ${F.data}`;
    ctx.fillText('WHERE THE STARS SIT', L, 226);
    const top = model.clusters.filter((c) => !c.other).slice(0, 4);
    const maxS = Math.max(1, ...top.map((c) => c.stars));
    top.forEach((c, i) => {
      const y = 250 + i * 40;
      ctx.fillStyle = P.ink; ctx.font = `600 19px ${F.display}`;
      ctx.fillText(fit(ctx, c.label.toUpperCase(), cw - 80), L, y + 14);
      ctx.fillStyle = P.muted; ctx.font = `500 15px ${F.data}`;
      const v = c.stars.toLocaleString('en-US') + '★'; ctx.textAlign = 'right'; ctx.fillText(v, R, y + 14); ctx.textAlign = 'left';
      ctx.fillStyle = color(c);
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(L, y + 22, Math.max(4, (cw * c.stars) / maxS), 7, 2) : ctx.rect(L, y + 22, Math.max(4, (cw * c.stars) / maxS), 7); ctx.fill();
    });

    ctx.fillStyle = P.muted; ctx.font = `400 14px ${F.data}`;
    ctx.fillText(fit(ctx, url.replace(/^https?:\/\//, ''), cw), L, H - 40);
    return canvas;
  }

  root.ShareCard = { drawCard };
})(window);
