/* repo-atlas · analysis core
 * Pure functions, no DOM, no network. Runs in the browser (window.Atlas)
 * and in Node (require) so the clustering and timelines can be tested.
 */
(function (root) {
  'use strict';

  // Topics that say nothing about what a repo is *about*.
  const STOP = new Set([
    'javascript', 'typescript', 'js', 'ts', 'html', 'css', 'svg', 'png', 'ui', 'pwa',
    'printable', 'generator', 'web', 'app', 'webapp', 'website', 'demo', 'library',
    'open-source', 'opensource', 'hacktoberfest', 'awesome', 'tool', 'tools',
    'free', 'online', 'simple', 'project', 'code', 'example', 'examples', 'pdf',
    'image', 'images', 'file', 'files', 'download', 'export', 'json', 'data'
  ]);
  // Hyphen parts we never split out on their own.
  const PART_STOP = new Set(['with', 'from', 'for', 'and', 'the', 'based', 'api', 'app', 'apps', 'view', 'views', 'tool', 'tools', 'maker', 'gen', 'files', 'file', 'free']);
  const WORD_STOP = new Set(['with', 'from', 'that', 'this', 'your', 'their', 'into', 'like', 'using', 'used', 'over', 'each', 'them', 'they', 'what', 'when', 'which', 'then', 'than', 'also', 'just', 'more', 'most', 'some', 'very', 'make', 'made', 'simple', 'page', 'pages', 'web', 'online', 'free', 'build', 'built', 'based', 'small', 'light', 'lightweight', 'easy', 'only', 'other', 'both', 'between', 'about', 'download']);

  // Tokens that only came from splitting a hyphenated topic. They help similarity
  // but make poor labels ("sacred · geometry" instead of "sacred geometry").
  const PARTS = new Set();
  const FULL = new Set();

  const singular = (t) => (t.length > 4 && /[^s]s$/.test(t) && !/(ss|us|is|ics)$/.test(t)) ? t.slice(0, -1) : t;

  /** Normalise a repo object as GitHub's REST API returns it. */
  function normalize(r) {
    return {
      name: r.name, fork: !!r.fork, archived: !!r.archived, stars: r.stargazers_count || 0,
      forks: r.forks_count || 0, language: r.language || '', topics: r.topics || [],
      created: (r.created_at || '').slice(0, 10), pushed: (r.pushed_at || '').slice(0, 10),
      description: r.description || '', homepage: r.homepage || ''
    };
  }

  /** Feature tokens for one repo: topics, meaningful hyphen parts, and (if no topics) description words. */
  function tokensFor(repo) {
    const out = new Set();
    for (const raw of repo.topics) {
      const t = raw.toLowerCase();
      if (STOP.has(t)) continue;
      FULL.add(singular(t));
      out.add(singular(t));
      const parts = t.split('-');
      if (parts.length > 1) for (const p of parts) {
        if (p.length >= 4 && !STOP.has(p) && !PART_STOP.has(p)) { const sp = singular(p); out.add(sp); PARTS.add(sp); }
      }
    }
    if (out.size < 2 && repo.description) {
      for (const w of repo.description.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) || []) {
        if (!WORD_STOP.has(w) && !STOP.has(w)) out.add(singular(w));
      }
    }
    return out;
  }

  /** TF-IDF vectors (binary tf). Tokens seen once carry no shared signal and are dropped;
   *  tokens on more than `maxShare` of repos are too generic to separate anything. */
  function vectorize(repos, { maxShare = 0.45 } = {}) {
    const toks = repos.map(tokensFor);
    const df = new Map();
    toks.forEach((s) => s.forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
    const N = repos.length;
    const idf = new Map();
    df.forEach((n, t) => { if (n >= 2 && n / N <= maxShare) idf.set(t, Math.log(N / n)); });
    const vecs = toks.map((s) => {
      const v = new Map(); let norm = 0;
      s.forEach((t) => { const w = idf.get(t); if (w) { v.set(t, w); norm += w * w; } });
      return { v, norm: Math.sqrt(norm) };
    });
    return { vecs, idf, toks };
  }

  function cosine(a, b) {
    if (!a.norm || !b.norm) return 0;
    let dot = 0; const [s, l] = a.v.size < b.v.size ? [a.v, b.v] : [b.v, a.v];
    s.forEach((w, t) => { const x = l.get(t); if (x) dot += w * x; });
    return dot / (a.norm * b.norm);
  }

  /** Average-linkage agglomerative clustering, stopping when no pair of clusters
   *  is more similar than `threshold`. Deterministic for a given input order. */
  function agglomerate(sim, n, threshold) {
    let clusters = Array.from({ length: n }, (_, i) => [i]);
    const avg = (A, B) => { let s = 0; for (const i of A) for (const j of B) s += sim[i][j]; return s / (A.length * B.length); };
    for (;;) {
      let best = -1, bi = -1, bj = -1;
      for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
        const s = avg(clusters[i], clusters[j]);
        if (s > best) { best = s; bi = i; bj = j; }
      }
      if (best < threshold || bi < 0) break;
      clusters[bi] = clusters[bi].concat(clusters[bj]);
      clusters.splice(bj, 1);
    }
    return clusters;
  }

  const pretty = (t) => t.replace(/-/g, ' ');

  /** Two most characteristic tokens of a cluster: frequent inside it, rare outside it. */
  function labelFor(members, toks, idf, N) {
    const count = new Map();
    members.forEach((i) => toks[i].forEach((t) => { if (idf.has(t)) count.set(t, (count.get(t) || 0) + 1); }));
    const scored = [...count.entries()]
      .map(([t, c]) => [t, (c / members.length) * (idf.get(t) || 0) * (c > 1 ? 1 : 0.4) * (PARTS.has(t) && !FULL.has(t) ? 0.55 : 1)])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    // Two labels never share a word ("crud" and "crud-app" say the same thing).
    // A compound topic replaces a shorter word it contains only when it covers at
    // least as many repos: "sacred-geometry" beats "geometry", "crud" beats "crud-application".
    const words = (t) => t.split('-');
    const clash = (a, b) => words(a).some((w) => words(b).includes(w));
    const picked = [];
    for (const [t] of scored) {
      const k = picked.findIndex((p) => clash(p, t));
      if (k >= 0) {
        const p = picked[k];
        if (FULL.has(t) && words(p).every((w) => words(t).includes(w)) && count.get(t) >= count.get(p)) {
          picked[k] = t;
          for (let j = picked.length - 1; j >= 0; j--) if (j !== k && clash(picked[j], t)) picked.splice(j, 1);
        }
        continue;
      }
      if (picked.length < 2) picked.push(t);
    }
    return picked.length ? picked.map(pretty).join(' · ') : 'misc';
  }

  /**
   * Group repos into topic clusters.
   * Returns [{id, label, repos:[...], stars, keywords}], biggest-by-stars first,
   * with single-repo leftovers folded into one "Loners" group at the end.
   * At most `maxClusters` named groups; the rest fold into "Other".
   */
  function cluster(repos, { threshold = 0.16, maxClusters = 8 } = {}) {
    const N = repos.length;
    if (!N) return [];
    const { vecs, idf, toks } = vectorize(repos);
    const sim = vecs.map((a, i) => vecs.map((b, j) => (i === j ? 1 : cosine(a, b))));
    const groups = agglomerate(sim, N, threshold);

    const real = groups.filter((g) => g.length > 1);
    const loners = groups.filter((g) => g.length === 1).flat();
    const starSum = (g) => g.reduce((s, i) => s + repos[i].stars, 0);
    real.sort((a, b) => starSum(b) - starSum(a) || b.length - a.length);

    const named = real.slice(0, maxClusters);
    const folded = real.slice(maxClusters).flat().concat(loners);

    const out = named.map((g, k) => ({
      id: 'c' + k,
      slot: k,
      label: labelFor(g, toks, idf, N),
      repos: g.map((i) => repos[i]).sort((a, b) => b.stars - a.stars),
      stars: starSum(g),
      other: false
    }));
    if (folded.length) out.push({
      id: 'other',
      label: real.length > maxClusters ? 'other & loners' : 'loners',
      repos: folded.map((i) => repos[i]).sort((a, b) => b.stars - a.stars),
      stars: starSum(folded),
      other: true
    });
    out.forEach((c) => c.repos.forEach((r) => { r.cluster = c.id; }));
    return out;
  }

  /** Stars held today, stacked by the year each repo was created. Works without a token. */
  function starsByBirthYear(clusters) {
    const years = new Map();
    clusters.forEach((c) => c.repos.forEach((r) => {
      const y = +r.created.slice(0, 4);
      if (!years.has(y)) years.set(y, {});
      const row = years.get(y);
      row[c.id] = (row[c.id] || 0) + r.stars;
    }));
    const ys = [...years.keys()].sort((a, b) => a - b);
    if (!ys.length) return [];
    const out = [];
    for (let y = ys[0]; y <= ys[ys.length - 1]; y++) {
      const row = { year: y }; clusters.forEach((c) => { row[c.id] = (years.get(y) || {})[c.id] || 0; });
      out.push(row);
    }
    return out;
  }

  /**
   * Cumulative stars per cluster per month, from sampled stargazer points.
   * `points[repoName]` = [[starIndex(1-based), 'YYYY-MM-DD'], ...] sorted by index;
   * counts between samples are interpolated by date, the total is pinned to today's count.
   */
  function starsOverTime(clusters, points, now = new Date()) {
    const series = [];
    let first = Infinity;
    clusters.forEach((c) => c.repos.forEach((r) => {
      const p = points[r.name];
      if (p && p.length) first = Math.min(first, Date.parse(p[0][1]));
    }));
    if (!isFinite(first)) return { months: [], rows: [] };
    const months = [];
    const d = new Date(first); d.setUTCDate(1);
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    for (let m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); m <= end;) {
      months.push(m);
      const x = new Date(m); m = Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1);
    }
    const countAt = (pts, total, t) => {
      // pts: [[idx, ms]] ascending; returns stars held at time t
      if (t < pts[0][1]) return 0;
      for (let i = pts.length - 1; i >= 0; i--) {
        if (t >= pts[i][1]) {
          const a = pts[i], b = pts[i + 1] || [total, +now];
          if (b[1] <= a[1]) return a[0];
          return Math.min(total, Math.floor(a[0] + (b[0] - a[0]) * (t - a[1]) / (b[1] - a[1])));
        }
      }
      return 0;
    };
    const prepared = {};
    clusters.forEach((c) => c.repos.forEach((r) => {
      const p = points[r.name];
      if (p && p.length) prepared[r.name] = p.map(([i, s]) => [i, Date.parse(s)]);
    }));
    const rows = months.map((m) => {
      const row = { t: m };
      // a month's value is the count at the END of the month (or now)
      const t = Math.min(+now, Date.UTC(new Date(m).getUTCFullYear(), new Date(m).getUTCMonth() + 1, 1) - 1);
      clusters.forEach((c) => {
        let s = 0;
        c.repos.forEach((r) => { const p = prepared[r.name]; if (p) s += countAt(p, r.stars, t); });
        row[c.id] = s;
      });
      return row;
    });
    return { months, rows };
  }

  /** Which stargazer pages to fetch for a repo: all of them when few, otherwise
   *  the first, the last and evenly spaced ones in between. */
  function samplePages(stars, perPage = 100, maxPages = 5) {
    const n = Math.ceil(stars / perPage);
    if (n <= maxPages) return Array.from({ length: n }, (_, i) => i + 1);
    const out = new Set([1, n]);
    for (let k = 1; k < maxPages - 1; k++) out.add(1 + Math.round((k * (n - 1)) / (maxPages - 1)));
    return [...out].sort((a, b) => a - b);
  }

  /**
   * Highlights: the most-starred repo of each named group, in group order.
   * An account with no groups gets its top repos instead.
   */
  function highlights(clusters, { fallback = 3 } = {}) {
    const best = (rs) => rs.slice().sort((a, b) => b.stars - a.stars || (b.pushed > a.pushed ? 1 : b.pushed < a.pushed ? -1 : 0));
    const named = clusters.filter((c) => !c.other && c.repos.length);
    if (named.length) return named.map((c) => ({ repo: best(c.repos)[0], cluster: c }));
    const other = clusters.find((c) => c.other);
    return other ? best(other.repos).slice(0, fallback).map((repo) => ({ repo, cluster: other })) : [];
  }

  function summarize(all, { includeForks = false } = {}) {
    const repos = all.filter((r) => includeForks || !r.fork);
    const clusters = cluster(repos);
    const hl = highlights(clusters);
    const stars = repos.reduce((s, r) => s + r.stars, 0);
    const span = repos.length ? [repos.reduce((m, r) => (r.created < m ? r.created : m), '9999'), repos.reduce((m, r) => (r.pushed > m ? r.pushed : m), '0000')] : null;
    return { repos, clusters, highlights: hl, stars, span, forksHidden: all.length - repos.length };
  }

  const api = { normalize, tokensFor, vectorize, cosine, cluster, highlights, starsByBirthYear, starsOverTime, samplePages, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Atlas = api;
})(typeof window !== 'undefined' ? window : globalThis);
