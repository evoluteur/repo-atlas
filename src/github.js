/* repo-atlas · GitHub client (browser only)
 * REST v3, public data. A token is optional for the repo map and required for
 * star history: GitHub only lists stargazers to authenticated callers.
 */
(function (root) {
  'use strict';

  const API = 'https://api.github.com';

  class GitHubError extends Error {
    constructor(kind, message, extra = {}) { super(message); this.kind = kind; Object.assign(this, extra); }
  }

  async function get(path, { token, accept } = {}) {
    const headers = { Accept: accept || 'application/vnd.github+json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(API + path, { headers });
    } catch (e) {
      throw new GitHubError('network', 'Could not reach api.github.com from this page.');
    }
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = +res.headers.get('x-ratelimit-reset') * 1000 || null;
    if (res.ok) return { data: await res.json(), remaining: remaining == null ? null : +remaining, reset, link: res.headers.get('link') || '' };
    if (res.status === 404) throw new GitHubError('notfound', 'No GitHub user by that name.');
    if (res.status === 401) throw new GitHubError('auth', token ? 'GitHub rejected that token. Check it has not expired.' : 'GitHub needs a token for this.');
    if ((res.status === 403 || res.status === 429) && remaining === '0') {
      throw new GitHubError('ratelimit', 'GitHub rate limit reached.', { reset });
    }
    let msg = 'GitHub answered ' + res.status + '.';
    try { const j = await res.json(); if (j.message) msg += ' ' + j.message; } catch (e) { /* ignore */ }
    throw new GitHubError('http', msg);
  }

  /** All public repos owned by `login`, plus the profile. */
  async function fetchUser(login, { token } = {}) {
    const user = (await get('/users/' + encodeURIComponent(login), { token })).data;
    let page = 1, repos = [], last;
    for (;;) {
      last = await get(`/users/${encodeURIComponent(login)}/repos?per_page=100&type=owner&sort=full_name&page=${page}`, { token });
      repos = repos.concat(last.data);
      if (last.data.length < 100 || !/rel="next"/.test(last.link)) break;
      page++;
      if (page > 30) break; // 3,000 repos is plenty for one atlas
    }
    return {
      user: { login: user.login, name: user.name || '', avatar: user.avatar_url, url: user.html_url, publicRepos: user.public_repos, followers: user.followers },
      repos,
      remaining: last.remaining,
      reset: last.reset
    };
  }

  /** Run `fn` over `items` with at most `n` in flight. */
  async function pool(items, n, fn) {
    let i = 0;
    const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const k = i++; await fn(items[k], k); }
    });
    await Promise.all(workers);
  }

  /**
   * Sampled stargazer timestamps for each repo, as {name: [[starIndex, 'YYYY-MM-DD'], ...]}.
   * Repos with many stars get their first, last and a few middle pages; every
   * star on a fetched page is an exact (index, date) point.
   */
  async function fetchStarPoints(login, repos, { token, maxPages = 5, onProgress } = {}) {
    if (!token) throw new GitHubError('auth', 'Star history needs a GitHub token.');
    const jobs = [];
    repos.filter((r) => r.stars > 0).forEach((r) => {
      root.Atlas.samplePages(r.stars, 100, maxPages).forEach((p) => jobs.push({ name: r.name, page: p }));
    });
    const raw = {};
    let done = 0;
    await pool(jobs, 6, async ({ name, page }) => {
      const res = await get(`/repos/${encodeURIComponent(login)}/${encodeURIComponent(name)}/stargazers?per_page=100&page=${page}`,
        { token, accept: 'application/vnd.github.star+json' });
      const base = (page - 1) * 100;
      (raw[name] = raw[name] || []).push(...res.data.map((s, k) => [base + k + 1, (s.starred_at || '').slice(0, 10)]));
      done++;
      if (onProgress) onProgress(done, jobs.length);
    });
    const out = {};
    Object.keys(raw).forEach((n) => {
      out[n] = raw[n].filter((p) => p[1]).sort((a, b) => a[0] - b[0]);
    });
    return out;
  }

  root.GitHub = { fetchUser, fetchStarPoints, GitHubError };
})(window);
