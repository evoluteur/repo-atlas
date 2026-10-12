/* repo-atlas · D3 renderers (browser only, needs window.d3) */
(function (root) {
  'use strict';
  const d3 = root.d3;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const fmt = (n) => d3.format(',')(n);
  /** Cluster color by fixed slot, never by rank after filtering. "other" is neutral. */
  const colorOf = (c) => (c.other ? css('--series-other') : css('--series-' + (c.slot + 1)));

  function tooltip(host) {
    let tip = host.querySelector('.tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; host.appendChild(tip); }
    return {
      show(html, x, y) {
        tip.innerHTML = html; tip.hidden = false;
        const hw = host.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
        let left = x + 14, top = y - th - 10;
        if (left + tw > hw - 4) left = Math.max(4, x - tw - 14);
        if (top < 4) top = y + 16;
        tip.style.left = left + 'px'; tip.style.top = top + 'px';
      },
      hide() { tip.hidden = true; }
    };
  }

  const labelSize = (r) => Math.max(9.5, Math.min(13, r / 3.4));
  const STAR = '<span class="star" aria-label="stars">★</span>';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function repoTip(r, c) {
    const reasons = r.flagReasons && r.flagReasons.length
      ? '<ul class="tip-flags">' + r.flagReasons.map((x) => '<li>' + esc(x.text) + '</li>').join('') + '</ul>' : '';
    return `<b>${esc(r.name)}</b><span class="tip-meta">${fmt(r.stars)}${STAR} · ${fmt(r.forks)} forks · pushed ${esc(r.pushed)}</span>`
      + (r.description ? `<span class="tip-desc">${esc(r.description)}</span>` : '')
      + `<span class="tip-cl"><i style="background:${colorOf(c)}"></i>${esc(c.label)}</span>` + reasons;
  }

  /**
   * The atlas map: a circle pack, one region per cluster, one disc per repo
   * (area ∝ stars + 1). Flagged repos wear a dashed ring.
   * Returns the layout so the share card can redraw it.
   */
  function drawMap(host, model, { login, onPick } = {}) {
    host.querySelectorAll('svg').forEach((n) => n.remove());
    const W = Math.max(300, host.clientWidth);
    const H = Math.round(Math.min(W * 0.92, 680));
    const data = { children: model.clusters.map((c) => ({ cluster: c, children: c.repos.map((r) => ({ repo: r, cluster: c })) })) };
    const rootNode = d3.hierarchy(data).sum((d) => (d.repo ? d.repo.stars + 1.5 : 0)).sort((a, b) => b.value - a.value);
    d3.pack().size([W, H]).padding((d) => (d.depth === 0 ? 14 : 2.5))(rootNode);

    // Crop to the regions so the map fills its frame instead of floating in a circle.
    const kids = rootNode.children || [];
    const x0 = d3.min(kids, (d) => d.x - d.r) - 6, x1 = d3.max(kids, (d) => d.x + d.r) + 6;
    const y0 = d3.min(kids, (d) => d.y - d.r) - 6, y1 = d3.max(kids, (d) => d.y + d.r) + 6;
    const svg = d3.select(host).append('svg')
      .attr('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`).attr('width', W).attr('height', Math.round((W * (y1 - y0)) / (x1 - x0)))
      .attr('role', 'img')
      .attr('aria-label', `Map of ${model.repos.length} repositories by ${login} in ${model.clusters.length} groups, sized by stars`);

    const tip = tooltip(host);
    const regions = svg.append('g').selectAll('g').data(rootNode.children || []).join('g').attr('class', 'region');

    regions.append('circle')
      .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r)
      .attr('fill', (d) => colorOf(d.data.cluster)).attr('fill-opacity', 0.1)
      .attr('stroke', (d) => colorOf(d.data.cluster)).attr('stroke-opacity', 0.55).attr('stroke-width', 1.25);

    const leaves = svg.append('g').selectAll('a').data(rootNode.leaves().filter((d) => d.data.repo)).join('a')
      .attr('href', (d) => `https://github.com/${login}/${d.data.repo.name}`)
      .attr('target', '_blank').attr('rel', 'noopener')
      .attr('aria-label', (d) => `${d.data.repo.name}, ${d.data.repo.stars} stars`)
      .attr('class', 'leaf');

    leaves.filter((d) => d.data.repo.flag).append('circle')
      .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r + 3.5)
      .attr('fill', 'none').attr('stroke', css('--critical')).attr('stroke-width', 1.75)
      .attr('stroke-dasharray', '3 2.5');

    leaves.append('circle')
      .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => Math.max(d.r, 2.5))
      .attr('fill', (d) => colorOf(d.data.cluster))
      .attr('stroke', css('--surface')).attr('stroke-width', 1.5);

    leaves.filter((d) => d.r >= 19).append('text')
      .attr('class', 'leaf-label').attr('x', (d) => d.x).attr('y', (d) => d.y)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('fill', css('--ink')).attr('stroke', css('--surface')).attr('stroke-width', 3).attr('paint-order', 'stroke')
      .style('font-size', (d) => labelSize(d.r) + 'px')
      .text((d) => {
        // IBM Plex Mono advances 0.6em per character
        const n = d.data.repo.name, max = Math.floor((d.r * 1.8) / (labelSize(d.r) * 0.6));
        return n.length > max ? n.slice(0, Math.max(3, max - 1)) + '…' : n;
      });

    leaves.filter((d) => d.data.repo.flag).append('text')
      .attr('class', 'flag-mark').attr('x', (d) => d.x + d.r * 0.72).attr('y', (d) => d.y - d.r * 0.72)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('fill', css('--critical')).attr('stroke', css('--surface')).attr('stroke-width', 3).attr('paint-order', 'stroke')
      .text('!');

    // Region names lettered along the inside of the rim, the way a map names a basin.
    const defs = svg.append('defs');
    svg.append('g').attr('class', 'rims').selectAll('g').data(rootNode.children || []).join('g').filter((d) => d.r >= 56).each(function (d, i) {
      const rr = d.r - 11;
      const id = 'rim-' + i + '-' + Math.random().toString(36).slice(2, 7);
      defs.append('path').attr('id', id)
        .attr('d', `M ${d.x - rr} ${d.y} A ${rr} ${rr} 0 0 1 ${d.x + rr} ${d.y}`)
        .attr('fill', 'none');
      // Letter along the top ~110° of the rim. Fall back to the first keyword, else stay quiet.
      const room = Math.floor((rr * 1.9) / 9.2);
      const full = d.data.cluster.label.toUpperCase();
      const first = full.split(' · ')[0];
      const label = full.length <= room ? full : first.length <= room ? first : '';
      if (!label) return;
      d3.select(this).append('text').attr('class', 'rim').attr('fill', css('--ink-2'))
        .attr('stroke', css('--surface')).attr('stroke-width', 3.5).attr('paint-order', 'stroke').attr('stroke-linejoin', 'round')
        .append('textPath').attr('href', '#' + id).attr('startOffset', '50%').attr('text-anchor', 'middle')
        .text(label);
    });

    leaves
      .on('pointerenter pointermove', (e, d) => {
        const [x, y] = d3.pointer(e, host);
        tip.show(repoTip(d.data.repo, d.data.cluster), x, y);
        d3.select(e.currentTarget).classed('hot', true);
        if (onPick) onPick(d.data.cluster.id, true);
      })
      .on('pointerleave', (e, d) => {
        tip.hide(); d3.select(e.currentTarget).classed('hot', false);
        if (onPick) onPick(d.data.cluster.id, false);
      })
      .on('focus', (e, d) => {
        tip.show(repoTip(d.data.repo, d.data.cluster), d.x, d.y);
      })
      .on('blur', () => tip.hide());

    return { W: x1 - x0, H: y1 - y0, ox: x0, oy: y0, nodes: rootNode };
  }

  /** Highlight one region on the map (legend hover). */
  function focusRegion(host, clusterId) {
    d3.select(host).selectAll('g.region').classed('dim', (d) => clusterId && d.data.cluster.id !== clusterId);
    d3.select(host).selectAll('a.leaf').classed('dim', (d) => clusterId && d.data.cluster.id !== clusterId);
  }

  function axisStyle(g) {
    g.selectAll('text').attr('fill', css('--muted')).style('font-family', 'var(--f-data)').style('font-size', '11px');
    g.selectAll('line').attr('stroke', css('--line'));
    g.select('.domain').remove();
  }

  /** Stacked columns: stars held today, by the year each repo was born. */
  function drawBirthYears(host, model) {
    host.querySelectorAll('svg').forEach((n) => n.remove());
    const rows = root.Atlas.starsByBirthYear(model.clusters);
    const keys = model.clusters.map((c) => c.id);
    const byId = Object.fromEntries(model.clusters.map((c) => [c.id, c]));
    const W = Math.max(300, host.clientWidth), H = 260, m = { t: 12, r: 8, b: 26, l: 44 };
    const x = d3.scaleBand().domain(rows.map((r) => r.year)).range([m.l, W - m.r]).paddingInner(0.22).paddingOuter(0.1);
    const stack = d3.stack().keys(keys)(rows);
    const max = d3.max(rows, (r) => d3.sum(keys, (k) => r[k])) || 1;
    const y = d3.scaleLinear().domain([0, max]).nice().range([H - m.b, m.t]);
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H)
      .attr('role', 'img').attr('aria-label', 'Stars held today, stacked by the year each repository was created');

    svg.append('g').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(d3.format('~s')))
      .call(axisStyle).call((g) => g.selectAll('line').attr('stroke-opacity', 0.6));
    const every = Math.ceil(rows.length / Math.max(2, Math.floor((W - m.l) / 44)));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickSize(0).tickPadding(8).tickValues(rows.map((r) => r.year).filter((yv, i) => i % every === 0)).tickFormat((d) => "'" + String(d).slice(2)))
      .call(axisStyle);

    const bw = x.bandwidth();
    svg.append('g').selectAll('g').data(stack).join('g')
      .attr('fill', (s) => colorOf(byId[s.key]))
      .selectAll('rect').data((s) => s.map((d) => Object.assign(d, { key: s.key }))).join('rect')
      .attr('x', (d) => x(d.data.year)).attr('width', bw)
      .attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])))
      .attr('stroke', css('--surface')).attr('stroke-width', (d) => (d[1] - d[0] > 0 ? 2 : 0))
      .attr('rx', 1.5);

    // One hover target per column, wider than the marks.
    const tip = tooltip(host);
    svg.append('g').selectAll('rect').data(rows).join('rect')
      .attr('x', (d) => x(d.year) - (x.step() - bw) / 2).attr('width', x.step()).attr('y', m.t).attr('height', H - m.t - m.b)
      .attr('fill', 'transparent')
      .on('pointerenter pointermove', (e, d) => {
        const total = d3.sum(keys, (k) => d[k]);
        const parts = keys.filter((k) => d[k] > 0).sort((a, b) => d[b] - d[a])
          .map((k) => `<span class="tip-row"><i style="background:${colorOf(byId[k])}"></i>${esc(byId[k].label)}<b>${fmt(d[k])}</b></span>`).join('');
        const born = model.repos.filter((r) => +r.created.slice(0, 4) === d.year).length;
        const [px, py] = d3.pointer(e, host);
        tip.show(`<b>${d.year}</b><span class="tip-meta">${born} repo${born === 1 ? '' : 's'} born · ${fmt(total)}${STAR} today</span>${parts}`, px, py);
      })
      .on('pointerleave', () => tip.hide());
  }

  /** Stacked area: cumulative stars per cluster per month (token mode). */
  function drawStarHistory(host, model, points) {
    host.querySelectorAll('svg').forEach((n) => n.remove());
    const { rows } = root.Atlas.starsOverTime(model.clusters, points);
    if (!rows.length) return;
    const keys = model.clusters.map((c) => c.id);
    const byId = Object.fromEntries(model.clusters.map((c) => [c.id, c]));
    const W = Math.max(300, host.clientWidth), H = 280, m = { t: 12, r: 10, b: 26, l: 44 };
    const x = d3.scaleUtc().domain(d3.extent(rows, (r) => r.t)).range([m.l, W - m.r]);
    const stack = d3.stack().keys(keys)(rows);
    const y = d3.scaleLinear().domain([0, d3.max(stack[stack.length - 1], (d) => d[1]) || 1]).nice().range([H - m.b, m.t]);
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H)
      .attr('role', 'img').attr('aria-label', 'Cumulative stars over time, stacked by group');
    svg.append('g').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(d3.format('~s')))
      .call(axisStyle).call((g) => g.selectAll('line').attr('stroke-opacity', 0.6));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(W / 90))).tickSize(0).tickPadding(8)).call(axisStyle);
    const area = d3.area().x((d) => x(d.data.t)).y0((d) => y(d[0])).y1((d) => y(d[1])).curve(d3.curveMonotoneX);
    svg.append('g').selectAll('path').data(stack).join('path')
      .attr('d', area).attr('fill', (s) => colorOf(byId[s.key])).attr('fill-opacity', 0.85)
      .attr('stroke', css('--surface')).attr('stroke-width', 1);

    const tip = tooltip(host);
    const rule = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--ink')).attr('stroke-opacity', 0.35).attr('hidden', true);
    const bis = d3.bisector((r) => r.t).center;
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (e) => {
        const [px] = d3.pointer(e); const d = rows[bis(rows, x.invert(px))];
        rule.attr('x1', x(d.t)).attr('x2', x(d.t)).attr('hidden', null);
        const total = d3.sum(keys, (k) => d[k]);
        const parts = keys.filter((k) => d[k] > 0).sort((a, b) => d[b] - d[a]).slice(0, 6)
          .map((k) => `<span class="tip-row"><i style="background:${colorOf(byId[k])}"></i>${esc(byId[k].label)}<b>${fmt(d[k])}</b></span>`).join('');
        const [hx, hy] = d3.pointer(e, host);
        tip.show(`<b>${d3.utcFormat('%b %Y')(d.t)}</b><span class="tip-meta">${fmt(total)}${STAR} in total</span>${parts}`, hx, hy);
      })
      .on('pointerleave', () => { tip.hide(); rule.attr('hidden', true); });
  }

  root.Charts = { drawMap, focusRegion, drawBirthYears, drawStarHistory, colorOf, css };
})(window);
