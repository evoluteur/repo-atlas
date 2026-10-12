/* repo-atlas · page controller */
(function () {
  'use strict';
  const { Atlas, GitHub, Charts, ShareCard, d3 } = window;
  const $ = (id) => document.getElementById(id);
  const DEFAULT_LOGIN = 'evoluteur';
  const HOME = 'https://evoluteur.github.io/repo-atlas/';
  const CACHE_MS = 60 * 60 * 1000;
  const fmt = d3.format(',');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = { login: '', user: null, all: [], model: null, source: '', fetchedAt: '', points: null, layout: null, includeForks: false };

  /* ---------- storage (best effort; the page works without it) ---------- */
  const store = {
    get(k, ses) { try { const s = ses ? sessionStorage : localStorage; const v = s.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v, ses) { try { (ses ? sessionStorage : localStorage).setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } },
    del(k, ses) { try { (ses ? sessionStorage : localStorage).removeItem(k); } catch (e) { /* ignore */ } }
  };
  const token = () => store.get('ra:token', true) || '';

  function permalink(login) {
    const onSite = /^https?:$/.test(location.protocol) && (/github\.io$/.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
    const base = onSite ? location.origin + location.pathname : HOME;
    return base + '?u=' + encodeURIComponent(login);
  }

  function readLoginFromUrl() {
    try {
      const q = new URLSearchParams(location.search).get('u');
      if (q) return q.trim();
      const h = decodeURIComponent(location.hash.slice(1)).replace(/^@/, '');
      if (/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(h)) return h;
    } catch (e) { /* ignore */ }
    return '';
  }

  function writeLoginToUrl(login) {
    try {
      const u = new URL(location.href);
      u.searchParams.set('u', login); u.hash = '';
      history.replaceState(null, '', u.toString());
    } catch (e) { /* sandboxed frames may refuse; the permalink box still shows the link */ }
  }

  /* ---------- loading ---------- */
  async function survey(login, { force = false } = {}) {
    login = login.trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').split('/')[0];
    if (!login) return;
    $('login').value = login;
    state.login = login; state.points = null;
    document.body.classList.add('loading');
    $('go').disabled = true;
    notice('');
    writeLoginToUrl(login);

    const cached = !force && store.get('ra:repos:' + login.toLowerCase());
    try {
      if (cached && Date.now() - cached.at < CACHE_MS) {
        state.user = cached.user; state.all = cached.repos.map((r) => Atlas.normalize(r));
        state.source = 'live'; state.fetchedAt = new Date(cached.at).toISOString().slice(0, 10);
      } else {
        const res = await GitHub.fetchUser(login, { token: token() });
        state.user = res.user;
        state.all = res.repos.map((r) => Atlas.normalize(r));
        state.source = 'live'; state.fetchedAt = new Date().toISOString().slice(0, 10);
        store.set('ra:repos:' + login.toLowerCase(), { at: Date.now(), user: res.user, repos: res.repos.map(slim) });
      }
      const pts = store.get('ra:stars:' + login.toLowerCase());
      if (pts && Date.now() - pts.at < 24 * CACHE_MS) state.points = pts.points;
      render();
    } catch (err) {
      showFailure(login, err);
    } finally {
      document.body.classList.remove('loading');
      $('go').disabled = false;
    }
  }

  // Keep only what the atlas reads, so the cache stays small.
  const slim = (r) => ({ name: r.name, fork: r.fork, archived: r.archived, stargazers_count: r.stargazers_count, forks_count: r.forks_count, language: r.language, topics: r.topics, created_at: r.created_at, pushed_at: r.pushed_at, description: r.description, homepage: r.homepage });

  function reason(err) {
    if (!err) return '';
    if (err.kind === 'ratelimit') return 'GitHub’s hourly limit for this browser is used up' + (err.reset ? `; it resets at ${new Date(err.reset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : '.') + ' Add a token below to raise it.';
    if (err.kind === 'network') return 'This page could not reach api.github.com, so live surveys are off here.';
    return err.message || String(err);
  }

  function showFailure(login, err) {
    const api = `https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=100&type=owner`;
    notice(`<p><b>Could not survey @${esc(login)}.</b> ${esc(reason(err))}</p>
      ${err && err.kind === 'notfound' ? '' : `<div class="paste"><p>You can still map it: open <code>${esc(api)}</code> in a new tab, copy the whole page, and paste it here.</p>
      <textarea id="paste" aria-label="Paste the repos JSON"></textarea>
      <div class="btns"><button class="btn" id="paste-go" type="button">Map pasted repos</button></div></div>`}`, 'err');
    const btn = $('paste-go');
    if (btn) btn.onclick = () => {
      try {
        const arr = JSON.parse($('paste').value);
        if (!Array.isArray(arr) || !arr.length || !arr[0].name) throw new Error('That is not a list of repos.');
        state.user = { login, name: '', avatar: '', url: 'https://github.com/' + login };
        state.all = arr.map((r) => Atlas.normalize(r));
        state.source = 'pasted'; state.fetchedAt = new Date().toISOString().slice(0, 10);
        notice('');
        render();
      } catch (e) {
        notice(`<p><b>That paste did not read as GitHub’s repo list.</b> Copy the full page from <code>${esc(api)}</code>, starting with <code>[</code>.</p>`, 'err');
      }
    };
  }

  function notice(html, kind) {
    const n = $('notice');
    n.innerHTML = html ? `<div class="notice ${kind === 'err' ? 'err' : ''}" role="status">${html}</div>` : '';
  }

  /* ---------- rendering ---------- */
  function render() {
    const model = Atlas.summarize(state.all, { includeForks: state.includeForks });
    const reasons = new Map(model.attention.flagged.map((f) => [f.repo.name, f.reasons]));
    model.repos.forEach((r) => { r.flagReasons = reasons.get(r.name) || null; });
    state.model = model;
    document.title = 'repo-atlas · @' + state.user.login;
    renderPlate(model);
    renderMap();
    renderLegend(model);
    renderAttention(model);
    renderTimeline();
    renderShare();
  }

  function renderPlate(model) {
    const u = state.user;
    const who = $('who');
    who.textContent = '@' + u.login; who.href = u.url || 'https://github.com/' + u.login;
    const img = $('avatar');
    img.onerror = () => { img.hidden = true; $('plate').classList.add('noavatar'); };
    $('plate').classList.toggle('noavatar', !u.avatar);
    if (u.avatar) { img.src = u.avatar + (u.avatar.includes('?') ? '&' : '?') + 's=152'; img.hidden = false; } else img.hidden = true;
    const span = model.span ? `${model.span[0].slice(0, 4)}–${model.span[1].slice(0, 4)}` : '';
    const src = state.source === 'pasted' ? `<span class="source pasted"><i></i>pasted · ${esc(state.fetchedAt)}</span>`
      : `<span class="source"><i></i>live · ${esc(state.fetchedAt)}</span>`;
    $('stats').innerHTML = `<span><b>${fmt(model.repos.length)}</b> repos</span><span><b>${fmt(model.stars)}</b> stars</span>`
      + `<span><b>${model.clusters.filter((c) => !c.other).length}</b> groups</span>`
      + (span ? `<span>${span}</span>` : '')
      + (model.forksHidden ? `<span>${model.forksHidden} fork${model.forksHidden === 1 ? '' : 's'} left out</span>` : '')
      + src;
  }

  function renderMap() {
    state.layout = Charts.drawMap($('map'), state.model, {
      login: state.user.login,
      onPick: (id, on) => document.querySelectorAll('.lg-row').forEach((r) => r.classList.toggle('on', on && r.dataset.id === id))
    });
  }

  function renderLegend(model) {
    const max = Math.max(1, ...model.clusters.map((c) => c.stars));
    const rows = model.clusters.map((c) => {
      const col = Charts.colorOf(c);
      const names = c.repos.slice(0, 4).map((r) => r.name).join(', ') + (c.repos.length > 4 ? ` +${c.repos.length - 4}` : '');
      return `<div class="lg-row" data-id="${c.id}" tabindex="0">
        <i class="sw" style="background:${col}"></i>
        <span class="lg-name">${esc(c.label)}</span>
        <span class="lg-num">${fmt(c.stars)}★</span>
        <span class="lg-sub"><span class="lg-bar"><i style="width:${(100 * c.stars) / max}%;background:${col}"></i></span>${c.repos.length} repo${c.repos.length === 1 ? '' : 's'}</span>
        <span class="lg-repos">${esc(names)}</span>
      </div>`;
    }).join('');
    const el = $('legend');
    el.innerHTML = `<h3>Groups by stars</h3>${rows}`;
    el.querySelectorAll('.lg-row').forEach((row) => {
      const on = () => Charts.focusRegion($('map'), row.dataset.id);
      const off = () => Charts.focusRegion($('map'), null);
      row.addEventListener('pointerenter', on); row.addEventListener('pointerleave', off);
      row.addEventListener('focus', on); row.addEventListener('blur', off);
    });
  }

  function renderAttention(model) {
    const { bar, flagged } = model.attention;
    $('att-why').textContent = `Repos with ${bar}+ stars that have gone quiet or sit on an old stack. Start here.`;
    const login = state.user.login;
    $('att').innerHTML = flagged.length ? flagged.map(({ repo: r, reasons }) => `
      <article class="att-card">
        <div class="att-top">
          <a class="att-name" href="https://github.com/${esc(login)}/${esc(r.name)}" target="_blank" rel="noopener">${esc(r.name)}</a>
          <span class="att-stars">${fmt(r.stars)}★</span>
        </div>
        ${r.description ? `<p class="att-desc">${esc(r.description)}</p>` : ''}
        <ul class="chips">${reasons.map((x) => `<li class="chip ${x.kind}">${esc(x.text)}</li>`).join('')}</ul>
        <div class="att-meta"><span>${fmt(r.forks)} forks</span><span>born ${esc(r.created.slice(0, 4))}</span><span>last push ${esc(r.pushed)}</span>${r.language ? `<span>${esc(r.language)}</span>` : ''}</div>
      </article>`).join('')
      : `<p class="att-empty">Nothing popular has gone quiet. Every repo with ${bar}+ stars was pushed in the last year and none sit on a legacy stack.</p>`;
  }

  function renderTimeline() {
    const m = state.model;
    $('tl-legend').innerHTML = m.clusters.map((c) => `<span><i style="background:${Charts.colorOf(c)}"></i>${esc(c.label)}</span>`).join('');
    if (state.points) {
      $('tl-why').textContent = 'Cumulative stars by month, stacked by group, from stargazer dates.';
      Charts.drawStarHistory($('timeline'), m, state.points);
      $('history').textContent = 'Reload star history';
    } else {
      $('tl-why').textContent = 'Stars held today, stacked by the year each repo was born. Load star history to see when the stars actually arrived.';
      Charts.drawBirthYears($('timeline'), m);
      $('history').textContent = 'Load star history';
    }
  }

  async function loadHistory() {
    if (!token()) {
      $('token-box').open = true; $('token').focus();
      $('progress').textContent = 'Add a token first: GitHub hides star dates from anonymous callers.';
      return;
    }
    const btn = $('history'); btn.disabled = true;
    try {
      const points = await GitHub.fetchStarPoints(state.user.login, state.model.repos, {
        token: token(), onProgress: (d, n) => { $('progress').textContent = `Reading stargazer pages ${d} of ${n}…`; }
      });
      state.points = points;
      store.set('ra:stars:' + state.user.login.toLowerCase(), { at: Date.now(), points });
      $('progress').textContent = `Star history loaded for ${Object.keys(points).length} repos.`;
      renderTimeline(); renderShare();
    } catch (err) {
      $('progress').textContent = reason(err);
    } finally { btn.disabled = false; }
  }

  async function renderShare() {
    const link = permalink(state.user.login);
    $('permalink').textContent = link;
    await ShareCard.drawCard($('card'), { login: state.user.login, model: state.model, layout: state.layout, url: link });
  }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.textContent = ''; }, 3200);
  }

  async function downloadCard() {
    const canvas = $('card');
    const name = `repo-atlas-${state.user.login}.png`;
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    // Inside a claude.ai artifact, downloads go through the viewer's own save dialog.
    let saver = null;
    try { saver = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { saver = null; }
    if (saver) {
      try { await saver.save({ filename: name, data: blob }); toast('Card saved.'); }
      catch (e) { toast('Save was cancelled.'); }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Card downloaded.');
  }

  async function copyLink() {
    const link = $('permalink').textContent;
    try { await navigator.clipboard.writeText(link); toast('Link copied.'); }
    catch (e) {
      const r = document.createRange(); r.selectNodeContents($('permalink'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      toast('Link selected. Press Ctrl+C or ⌘C to copy.');
    }
  }

  /* ---------- wiring ---------- */
  $('survey').addEventListener('submit', (e) => { e.preventDefault(); survey($('login').value, { force: true }); });
  $('history').addEventListener('click', loadHistory);
  $('token-save').addEventListener('click', () => {
    const v = $('token').value.trim();
    if (v) { store.set('ra:token', v, true); $('token').value = ''; $('progress').textContent = 'Token set for this tab.'; loadHistory(); }
    else { store.del('ra:token', true); $('progress').textContent = 'Token cleared.'; }
  });
  $('dl').addEventListener('click', downloadCard);
  $('copy').addEventListener('click', copyLink);

  let rt;
  const redraw = () => { clearTimeout(rt); rt = setTimeout(() => { if (state.model) { renderMap(); renderLegend(state.model); renderTimeline(); renderShare(); } }, 150); };
  window.addEventListener('resize', redraw);
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw); } catch (e) { /* old browsers */ }
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  survey(readLoginFromUrl() || DEFAULT_LOGIN);
})();
