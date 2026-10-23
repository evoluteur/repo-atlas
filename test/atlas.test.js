// node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/atlas.js');

// A sample of real public repos (github.com/evoluteur, Oct 2026), kept small and inline.
// name, fork, stars, forks, language, topics, created, pushed
const ROWS = [
  ["colorpicker", 0, 300, 124, "JavaScript", "color color-palette color-palettes color-picker color-selector color-theme colorpicker colorpickerview colors javascript jquery jquery-plugin jquery-ui microsoft-office office palette picker picker-component ui-components widget", "2012-06-03", "2026-07-06"],
  ["structured-filter", 0, 265, 61, "JavaScript", "evolutility faceted-search filter filter-plugin filtering filterlist jquery-plugin jquery-ui metadata metadata-driven query-builder querybuilder search-interface searchbar searchview structured-data ui ui-component whereclause widget", "2012-09-02", "2026-07-20"],
  ["evolutility-ui-jquery", 0, 188, 57, "JavaScript", "crud crud-application crud-functionality crud-generator evolutility forms low-code mda metadata metadata-driven model-driven-development models no-code ui", "2012-12-13", "2024-03-17"],
  ["meet-the-fans", 0, 133, 19, "JavaScript", "d3-visualization d3js followers force-layout forks github github-api github-forks github-profile github-projects github-stargazers graph graphql history network repository social-network social-networks stars visualization", "2020-09-28", "2026-10-10"],
  ["evolutility-ui-react", 0, 119, 32, "TypeScript", "crud crud-application crud-functionality evolutility graphql hasura hasura-graphql low-code mda metadata metadata-driven model model-driven model-driven-development no-code react-component spa views", "2016-06-16", "2026-09-05"],
  ["evolutility-server-node", 0, 115, 33, "TypeScript", "crud crud-api crud-functionality crud-operation database evolutility low-code mda metadata metadata-driven model-driven-development models no-code nodejs orm postgres rest rest-api restful-api sql", "2015-07-13", "2026-09-05"],
  ["evolutility-models", 0, 12, 3, "TypeScript", "code-generation crud crud-api crud-app crud-application crud-functionality crud-operation evolutility low-code mda metadata metadata-driven metamodel mock-data model-driven-development models no-code", "2018-12-10", "2026-09-05"],
  ["evolutility-asp.net", 0, 38, 17, "C#", "asp asp-net aspnet aspnet-mvc crud crud-app crud-application crud-functionality crud-generator evolutility framework low-code metadata model-driven mysql no-code sql-server web-application", "2018-06-09", "2024-03-17"],
  ["react-crud-icons", 0, 49, 3, "JavaScript", "button-animation crud crud-app crud-application icon icon-pack icon-set icons iconset inline-svg material-design material-ui react react-component react-components svg svg-icons svg-sprites ui ui-components", "2019-09-01", "2025-01-17"],
  ["motivational-numerology", 0, 98, 40, "HTML", "arithmancy arithmosophy esoterica forecast fortune-telling gematria healing interpretation javascript mental-health mental-health-awareness motivation numbers numerologia numerology occult personal-development personality predictions pythagoras", "2018-09-05", "2026-09-29"],
  ["healing-frequencies", 0, 79, 4, "HTML", "audio chakras cosmic esoterica frequencies frequency healing healing-frequencies resonance solfeggio sound sound-healing sound-synthesis therapy tuning tuning-fork vibration vibrations web-audio web-audio-api", "2024-02-08", "2026-10-05"],
  ["tibetan-singing-bowls", 0, 8, 2, "JavaScript", "esoterica healing-frequencies javascript meditation relaxation singing-bowl sound sound-healing sounds synthesizer tibetan webaudio webaudio-api", "2026-09-22", "2026-10-10"],
  ["binaural-beats", 0, 2, 0, "HTML", "alpha beta binaural-beats binaural-beats-generator binaural-beats-therapy brainwave brainwave-entrainment brainwaves brown-noise delta entrainment gamma meditation pink-noise relaxation schumann theta webaudio", "2026-08-30", "2026-09-26"],
  ["cymatics", 0, 9, 1, "JavaScript", "canvas chladni chladni-patterns cymatics esoterica pattern patterns physics resonance standing-wave vibration vibrations vibrator wave-equation webaudio", "2026-08-31", "2026-10-09"],
  ["sacred-geometry", 0, 9, 0, "JavaScript", "esoterica flower-of-life golden-ratio golden-spiral image-gen image-generation image-generator metatron printable sacred-geometry seed-of-life vesica-piscis", "2026-08-30", "2026-09-22"],
  ["platonic-solids", 0, 6, 0, "JavaScript", "cube dodecahedron esoterica geometry golden-ratio hexahedron icosahedron octahedron platonic platonic-solids polyhedra polyhedron printable sacred-geometry tetrahedron", "2026-08-30", "2026-09-22"],
  ["archimedean-solids", 0, 3, 1, "JavaScript", "3d archimed convex-hull cuboctahedron esoterica geometry polyhedra polyhedron printable rhombicosidodecahedron sacred-geometry svg truncated-icosahedron", "2026-09-12", "2026-10-02"],
  ["mandala-maker", 0, 12, 3, "JavaScript", "art esoterica javascript kaleidoscope mandala mandala-art mandala-maker mandalart mandalas meditation printable sacred-geometry svg", "2026-09-20", "2026-10-10"],
  ["sri-yantra", 0, 5, 0, "JavaScript", "esoterica generator javascript lotus meditation png printable sacred-geometry sri-yantra svg tantra yantra", "2026-09-22", "2026-10-10"],
  ["isomorphic-table-cards", 0, 45, 3, "HTML", "animated-transitions animation animation-css animation-effects card cards cards-views cardview css-animations css3-animations isomorphic isomorphism javascript morph table table-view tabular-data transformation transition transition-animation", "2020-10-03", "2026-07-27"],
  ["d3-table-cards", 0, 26, 3, "HTML", "animation animations card cards cards-views cardview d3 d3-js d3js d3v6 data-grid-view table tableview transformation transition transition-animation transitions ui", "2017-04-12", "2026-07-06"],
  ["braille-tools", 0, 41, 4, "CSS", "braille braille-alphabet braille-characters braille-symbols braille-translator css javascript sprite ui", "2016-11-30", "2026-07-25"],
  ["braille-text", 0, 2, 0, "CSS", "animation-css braille braille-alphabet braille-characters braille-display braille-symbols braille-translator css-animation css-animations sprite", "2023-09-07", "2024-04-29"],
  ["maze-maker", 0, 8, 0, "JavaScript", "javascript maze maze-algorithms maze-creation maze-game maze-generation maze-generation-algorithms maze-generator mazes png printable svg svg-images", "2026-09-25", "2026-10-10"],
  ["online-go.com", 1, 0, 0, "TypeScript", "", "2020-03-24", "2020-03-25"]
];
// Shape each row like GitHub's REST response, so the tests go through normalize() as the app does.
const rest = ([name, fork, stars, forks, language, topics, created, pushed]) => ({
  name, fork: !!fork, stargazers_count: stars, forks_count: forks, language,
  topics: topics.split(' '), created_at: created + 'T00:00:00Z', pushed_at: pushed + 'T00:00:00Z', description: ''
});
const repos = () => ROWS.map((r) => A.normalize(rest(r)));
const NOW = new Date('2026-10-10T12:00:00Z');

test('normalize reads REST objects', () => {
  const b = A.normalize({ name: 'y', stargazers_count: 3, forks_count: 0, topics: ['a'], created_at: '2020-02-02T00:00:00Z', pushed_at: '2020-03-03T00:00:00Z' });
  assert.deepEqual([b.name, b.stars, b.forks, b.topics, b.created, b.pushed], ['y', 3, 0, ['a'], '2020-02-02', '2020-03-03']);
});

test('sample totals', () => {
  const r = repos().filter((x) => !x.fork);
  assert.equal(r.length, 24);
  assert.equal(r.reduce((s, x) => s + x.stars, 0), 1572);
});

test('clusters cover every repo exactly once and are deterministic', () => {
  const r = repos().filter((x) => !x.fork);
  const c1 = A.cluster(r), c2 = A.cluster(r);
  const names = c1.flatMap((c) => c.repos.map((x) => x.name)).sort();
  assert.deepEqual(names, r.map((x) => x.name).sort());
  assert.deepEqual(c1.map((c) => c.label), c2.map((c) => c.label));
  assert.ok(c1.filter((c) => !c.other).length <= 8);
});

test('the Evolutility family lands in one group', () => {
  const c = A.cluster(repos().filter((x) => !x.fork));
  const home = (n) => c.find((g) => g.repos.some((x) => x.name === n)).id;
  const ids = new Set(['evolutility-ui-jquery', 'evolutility-ui-react', 'evolutility-server-node', 'evolutility-models', 'evolutility-asp.net'].map(home));
  assert.equal(ids.size, 1);
});

test('samplePages keeps first and last page and stays within budget', () => {
  assert.deepEqual(A.samplePages(250), [1, 2, 3]);
  const p = A.samplePages(3000, 100, 5);
  assert.equal(p.length, 5);
  assert.equal(p[0], 1);
  assert.equal(p[p.length - 1], 30);
});

test('starsOverTime ends at today’s star counts and never decreases', () => {
  const r = [
    { name: 'a', stars: 4, created: '2020-01-01' },
    { name: 'b', stars: 250, created: '2021-01-01' }
  ];
  const clusters = [{ id: 'c0', repos: r }];
  const points = {
    a: [[1, '2020-02-10'], [2, '2020-03-01'], [3, '2021-01-01'], [4, '2022-06-01']],
    b: [[1, '2021-02-01'], [100, '2021-08-01'], [101, '2022-01-01'], [200, '2023-01-01'], [201, '2024-01-01'], [250, '2025-06-01']]
  };
  const { rows } = A.starsOverTime(clusters, points, NOW);
  assert.equal(rows[rows.length - 1].c0, 254);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].c0 >= rows[i - 1].c0);
  assert.equal(rows[0].c0, 1); // Feb 2020 ends with one star
});

test('starsByBirthYear sums to total stars', () => {
  const r = repos().filter((x) => !x.fork);
  const c = A.cluster(r);
  const rows = A.starsByBirthYear(c);
  const total = rows.reduce((s, row) => s + c.reduce((t, g) => t + row[g.id], 0), 0);
  assert.equal(total, 1572);
  assert.equal(rows[0].year, 2012);
});
