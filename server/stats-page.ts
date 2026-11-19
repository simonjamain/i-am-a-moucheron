// Page /stats : graphiques interprétés des statistiques d'équipements (docs/stats.md).
// Autonome (aucune dépendance, SVG en ligne) ; les données viennent de /stats.json.
export const STATS_PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Statistiques des équipements</title>
<style>
  :root {
    --bg: #f6f4ee; --panel: #ffffff; --text: #1d2327; --muted: #5d676e; --line: #d8d4c8;
    --accent: #2c6e9b; --good: #1f7a4d; --bad: #b3452a; --warn: #9a6a00; --band: #e6efe4;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14181b; --panel: #1d2327; --text: #e8e6df; --muted: #9aa5ab; --line: #343d43;
      --accent: #6db3e0; --good: #5fc48f; --bad: #ef8b6f; --warn: #e0b24a; --band: #25352b;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 system-ui, sans-serif; }
  main { max-width: 1000px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  h2 { font-size: 1.1rem; margin: 0 0 4px; }
  p.note { color: var(--muted); margin: 0 0 12px; font-size: .9rem; }
  section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin: 14px 0; }
  .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
  label { display: flex; flex-direction: column; font-size: .8rem; color: var(--muted); gap: 2px; }
  select { font: inherit; padding: 4px 6px; background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 4px; }
  svg { width: 100%; height: auto; display: block; }
  svg text { fill: var(--text); font: 12px system-ui, sans-serif; }
  svg .muted { fill: var(--muted); }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; }
  th, td { text-align: right; padding: 4px 6px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; white-space: normal; }
  .scroll { overflow-x: auto; }
  .tag { font-weight: 600; }
  .sous-payé { color: var(--good); } .sur-payé { color: var(--bad); }
  .insuffisant, .gratuit { color: var(--muted); }
  .summary { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: .9rem; }
  .empty { color: var(--muted); padding: 8px 0; }
</style>
</head>
<body>
<main>
  <h1>Statistiques des équipements</h1>
  <p class="note" id="meta">Chargement…</p>
  <section>
    <div class="filters">
      <label>Version<select id="version"></select></label>
      <label>Joueurs<select id="n">
        <option value="all">Tous</option><option value="1-1">1</option><option value="2-3">2-3</option>
        <option value="4-6">4-6</option><option value="7-999">7 et plus</option></select></label>
      <label>Vagues<select id="wave">
        <option value="all">Toutes</option><option value="1-4">1 à 4</option>
        <option value="5-9">5 à 9</option><option value="10-999">10 et plus</option></select></label>
    </div>
    <div class="summary" id="summary"></div>
  </section>
  <section>
    <h2>Efficacité par poste</h2>
    <p class="note">Puissance délivrée par minute de joueur, relative au chasseur biplan gratuit (1,0). Trait fin : de 25 % à 75 % des vagues observées. Postes grisés : données insuffisantes.</p>
    <div id="chart-index"></div>
  </section>
  <section>
    <h2>Alignement du prix</h2>
    <p class="note">Puissance délivrée par dollar dépensé (achat + ravitaillement), comparée à la médiane. À droite de 1,0 : l'équipement rapporte plus que son coût (sous-payé) ; à gauche, moins (sur-payé). Zone verte : écart toléré.</p>
    <div id="chart-fair"></div>
  </section>
  <section>
    <h2>Taux d'occupation des véhicules</h2>
    <p class="note">Part des postes réellement tenus quand le véhicule sert. Un véhicule à plusieurs postes rarement plein vaut moins que son prix ne le suppose.</p>
    <div id="chart-occupancy"></div>
  </section>
  <section>
    <h2>Détail par poste</h2>
    <div class="scroll"><table id="table-rows"></table></div>
  </section>
  <section>
    <h2>Détail par équipement</h2>
    <div class="scroll"><table id="table-items"></table></div>
  </section>
</main>
<script>
const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const token = new URLSearchParams(location.search).get('token');
const fmt = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: d }));
function svg(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
function bars(host, rows, { max, unit, line = 1, band = null, labelWidth = 250, right = 130 }) {
  host.replaceChildren();
  if (!rows.length) { const p = document.createElement('div'); p.className = 'empty'; p.textContent = 'Pas encore de données pour ce filtre.'; host.append(p); return; }
  const W = 900, rowH = 26, top = 6, plot = W - labelWidth - right;
  const x = (v) => labelWidth + Math.max(0, Math.min(v, max)) / max * plot;
  const chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + (top * 2 + rows.length * rowH), role: 'img', 'aria-label': unit });
  if (band) chart.append(svg('rect', { x: x(band[0]), y: top, width: x(band[1]) - x(band[0]), height: rows.length * rowH, fill: 'var(--band)' }));
  rows.forEach((row, i) => {
    const y = top + i * rowH;
    chart.append(svg('text', { x: labelWidth - 8, y: y + 17, 'text-anchor': 'end', class: row.faded ? 'muted' : '' }, row.label));
    const color = row.faded ? 'var(--line)' : row.color || 'var(--accent)';
    chart.append(svg('rect', { x: labelWidth, y: y + 5, width: Math.max(1, x(row.value) - labelWidth), height: 14, fill: color, rx: 2 }));
    if (row.low !== undefined && row.high !== undefined && row.low !== null && row.high !== null && !row.faded) {
      chart.append(svg('line', { x1: x(row.low), x2: x(row.high), y1: y + 12, y2: y + 12, stroke: 'var(--text)', 'stroke-width': 1.5 }));
      for (const edge of [row.low, row.high]) chart.append(svg('line', { x1: x(edge), x2: x(edge), y1: y + 8, y2: y + 16, stroke: 'var(--text)', 'stroke-width': 1.5 }));
    }
    chart.append(svg('text', { x: Math.min(W - 4, x(Math.max(row.value, row.high ?? 0)) + 6), y: y + 17, class: row.faded ? 'muted' : '' }, row.note));
  });
  if (line !== null) chart.append(svg('line', { x1: x(line), x2: x(line), y1: top, y2: top + rows.length * rowH, stroke: 'var(--muted)', 'stroke-dasharray': '4 3' }));
  host.append(chart);
}
function table(host, head, rows) {
  host.replaceChildren();
  const thead = host.createTHead().insertRow();
  for (const h of head) thead.append(Object.assign(document.createElement('th'), { textContent: h }));
  const body = host.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    row.forEach((cell, i) => {
      const td = tr.insertCell();
      td.textContent = cell;
      if (head[i] === 'Statut') td.className = 'tag ' + String(cell).replace(' ', '-');
    });
  }
}
function render(data) {
  const since = new Date(data.since).toLocaleString('fr-FR');
  $('meta').textContent = 'Version ' + data.version + ' — mesures depuis le ' + since + ' (le mode debug et la vague en cours ne sont pas comptés).';
  const select = $('version');
  if (!select.options.length || select.dataset.count !== String(data.versions.length)) {
    select.replaceChildren(...data.versions.map((v) => new Option('v' + v, v)));
    select.dataset.count = String(data.versions.length);
  }
  select.value = String(data.version);
  const w = data.waves;
  $('summary').replaceChildren(...[
    w.count + ' vagues', fmt(w.power, 0) + ' de puissance proposée',
    w.power ? fmt(100 * w.killed / w.power, 0) + ' % éliminée' : '', w.power ? fmt(100 * w.leaked / w.power, 0) + ' % arrivée à la poubelle' : '', w.lost + ' défaite(s)',
  ].filter(Boolean).map((t) => Object.assign(document.createElement('span'), { textContent: t })));
  const rows = data.rows.filter((r) => r.humanMinutes > 0 || r.power > 0);
  const baseRate = data.rows.find((r) => r.item === data.constants.baseline.item && r.seat === data.constants.baseline.seat)?.rate;
  const maxIndex = Math.max(2, ...rows.map((r) => (baseRate && r.p75 ? r.p75 / baseRate : r.index || 0)));
  bars($('chart-index'), rows.map((r) => ({
    label: r.name + ' · ' + r.seat, value: r.index ?? 0, faded: r.index === null,
    low: baseRate && r.p25 !== null ? r.p25 / baseRate : null, high: baseRate && r.p75 !== null ? r.p75 / baseRate : null,
    note: r.index === null ? 'insuffisant (' + fmt(r.humanMinutes, 1) + ' min)' : fmt(r.index) + ' · ' + fmt(r.humanMinutes, 0) + ' min',
    color: r.index >= 1 ? 'var(--good)' : 'var(--warn)',
  })), { max: Math.ceil(maxIndex * 1.05), unit: 'indice d efficacité', line: 1 });
  const items = data.items.filter((i) => i.fairRatio !== null || i.status === 'gratuit' || i.status === 'insuffisant');
  const rated = data.items.filter((i) => i.fairRatio !== null);
  const maxFair = Math.max(2, ...rated.map((i) => i.fairRatio));
  const f = data.constants.fairBand;
  bars($('chart-fair'), rated.map((i) => ({
    label: i.name, value: i.fairRatio,
    note: i.status + (i.fairPrice !== null ? ' · ≈ ' + fmt(i.fairPrice, 0) + ' $ au lieu de ' + fmt(i.price, 0) + ' $' : ''),
    color: i.status === 'sous-payé' ? 'var(--good)' : i.status === 'sur-payé' ? 'var(--bad)' : 'var(--accent)',
  })), { max: Math.ceil(maxFair * 1.05), unit: 'efficacité par dollar relative à la médiane', line: 1, band: [1 - f, 1 + f], labelWidth: 200, right: 250 });
  const occupied = data.items.filter((i) => i.occupancy !== null && i.seats > 1);
  bars($('chart-occupancy'), occupied.map((i) => ({
    label: i.name + ' (' + i.seats + ' postes)', value: i.occupancy, note: fmt(100 * i.occupancy, 0) + ' % · ' + fmt(i.vehicleMinutes, 0) + ' min',
    faded: i.vehicleMinutes < 5,
  })), { max: 1, unit: 'taux d occupation', line: null });
  table($('table-rows'), ['Poste', 'Min. joueur', 'Puissance', 'Air', 'Sol', 'Par min', 'Médiane', 'Indice'],
    rows.map((r) => [r.name + ' · ' + r.seat + (Object.keys(r.weapons).length > 1 ? ' (' + Object.entries(r.weapons).map(([k, v]) => k + ' ' + fmt(v, 1)).join(', ') + ')' : ''),
      fmt(r.humanMinutes, 1), fmt(r.power, 1), fmt(r.air, 1), fmt(r.ground, 1), fmt(r.rate), fmt(r.median), fmt(r.index)]));
  table($('table-items'), ['Équipement', 'Prix', 'Achats', 'Dépensé $', 'Service $', 'Pertes', 'Occupation', 'Puissance/$', 'Prix équitable', 'Statut'],
    data.items.map((i) => [i.name, fmt(i.price, 0), i.bought, fmt(i.boughtDollars, 0), fmt(i.serviceDollars, 1), i.lost,
      i.occupancy === null ? '—' : fmt(100 * i.occupancy, 0) + ' %', fmt(i.powerPerDollar), fmt(i.fairPrice, 0), i.status]));
}
async function load() {
  const q = new URLSearchParams({ version: $('version').value || '', n: $('n').value, wave: $('wave').value });
  if (!q.get('version')) q.delete('version');
  if (token) q.set('token', token);
  const response = await fetch('/stats.json?' + q);
  if (!response.ok) { $('meta').textContent = 'Accès refusé ou statistiques indisponibles (' + response.status + ').'; return; }
  render(await response.json());
}
for (const id of ['version', 'n', 'wave']) $(id).addEventListener('change', load);
load();
setInterval(load, 30000);
</script>
</body>
</html>`;
