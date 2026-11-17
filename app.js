// ZIP, bedrooms, bathrooms in. One figure out. Nothing leaves the browser.
import config from './config.js?v=20261117c';

const limits = { beds: [1, 6], baths: [1, 6] };
const state = { beds: 1, baths: 1 };

const zipOf = (address) => (String(address).match(/\b\d{5}\b/g) || []).pop() || '';

// The area for the address's ZIP: its own, else a region whose prefixes it starts with,
// else the wide catch-all (the whole US, or the sample table). null when none fits.
export function areaFor(address, areas) {
  const zip = zipOf(address);
  return areas.find((a) => a.zips.includes(zip))
    || (zip && areas.find((a) => (a.prefixes || []).some((p) => zip.startsWith(p))))
    || areas.find((a) => !a.zips.length && !a.prefixes)
    || null;
}

// Walk down the ladder: this ZIP (beds-baths, then beds), its region, then the whole US.
// Returns { monthly, n, scope: 'zip' | 'region' | 'wide', name }, or a sample { nightly, occupancy, ... }.
export function rateFor({ address, beds, baths }, cfg) {
  const zip = zipOf(address);
  const own = cfg.areas.find((a) => a.zips.includes(zip));
  const region = zip && cfg.areas.find((a) => (a.prefixes || []).some((p) => zip.startsWith(p)));
  const wide = cfg.areas.find((a) => !a.zips.length && !a.prefixes);
  for (const [area, scope] of [[own, 'zip'], [region, 'region'], [wide, 'wide']]) {
    if (!area) continue;
    for (const key of [`${beds}-${baths}`, String(beds)]) {
      const r = area.rates[key];
      if (r == null) continue;
      return Array.isArray(r) ? { monthly: r[0], n: r[1], scope, name: area.name } : { ...r, scope, name: area.name };
    }
  }
  return null;
}

// Monthly to the owner = what the home takes in a month × (1 − cut), rounded to roundTo.
export function ownerMonthly({ address, beds, baths }, cfg) {
  const rate = rateFor({ address, beds, baths }, cfg);
  if (!rate) return null;
  const takes = rate.monthly != null
    ? rate.monthly
    : (rate.nightly + (cfg.bathStep || 0) * Math.max(0, baths - 1)) * 30 * rate.occupancy;
  const step = cfg.roundTo || 1;
  return Math.round((takes * (1 - cfg.cut)) / step) * step;
}

if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);

  const draw = () => {
    for (const key of ['beds', 'baths']) {
      const [low, high] = limits[key];
      $(key).textContent = String(state[key]);
      const step = document.querySelector(`.step[data-for="${key}"]`);
      step.querySelector('[data-by="-1"]').disabled = state[key] <= low;
      step.querySelector('[data-by="1"]').disabled = state[key] >= high;
    }
    // Until the ZIP is whole, the figure's room shows a green $ and dashes; then it fills, and follows every tap.
    const zip = $('zip').value;
    const unit = document.createElement('span');
    const figure = zip.length === 5 ? ownerMonthly({ address: zip, ...state }, config) : null;
    $('money').classList.toggle('waiting', figure === null);
    if (figure === null) {
      unit.textContent = zip.length === 5 ? 'We are not in your area yet. Write to us.' : 'a month';
      $('money').replaceChildren('$–,–––', unit);
      return;
    }
    const rate = rateFor({ address: zip, ...state }, config);
    const homes = `${rate.n.toLocaleString('en-US')} home${rate.n === 1 ? '' : 's'} like yours`;
    unit.textContent = config.sample ? 'a month · sample'
      : rate.scope === 'zip' ? `a month · from ${homes} nearby`
      : rate.scope === 'region' ? `a month · from ${homes} in ${rate.name}`
      : `a month · from ${homes} across the US`;
    $('money').replaceChildren(`$${figure.toLocaleString('en-US')}`, unit);
  };

  for (const button of document.querySelectorAll('.step button')) {
    button.addEventListener('click', () => {
      const key = button.parentElement.dataset.for;
      const [low, high] = limits[key];
      state[key] = Math.min(high, Math.max(low, state[key] + Number(button.dataset.by)));
      draw();
    });
  }
  $('zip').addEventListener('input', () => { $('zip').value = $('zip').value.replace(/\D/g, '').slice(0, 5); draw(); });
  draw();
}

// The letter: a small window over the blurred page. Send opens the writer's own mail, addressed and filled.
if (typeof document !== 'undefined') {
  const letter = document.getElementById('letter');
  const to = 'Levi@refugeandresort.com';
  document.getElementById('contact').addEventListener('click', () => letter.showModal());
  document.getElementById('close').addEventListener('click', () => letter.close());
  letter.addEventListener('click', (e) => { if (e.target === letter) letter.close(); });
  document.getElementById('letter-form').addEventListener('submit', () => {
    const from = document.getElementById('from').value.trim();
    const words = document.getElementById('words').value.trim();
    const zip = document.getElementById('zip').value;
    const body = `${words}\n\nFrom: ${from}${zip ? `\nZIP: ${zip}` : ''}`;
    location.href = `mailto:${to}?subject=${encodeURIComponent('Refuge and Resort')}&body=${encodeURIComponent(body)}`;
  });
}

// The tape: what each size of home earns, read from config.js, run along the top like a trading floor.
if (typeof document !== 'undefined') {
  const el = (tag, text, cls) => Object.assign(document.createElement(tag), { textContent: text, className: cls || '' });

  // A small gold pixel sword, point up: the house mark in place of a trader's triangle.
  const sword = () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 5 9');
    svg.setAttribute('class', 'sword');
    for (const [x, y, w, h] of [[2, 0, 1, 5], [0, 5, 5, 1], [2, 6, 1, 2], [1, 8, 3, 1]]) {
      const r = document.createElementNS(ns, 'rect');
      for (const [k, v] of Object.entries({ x, y, width: w, height: h })) r.setAttribute(k, v);
      svg.append(r);
    }
    return svg;
  };

  // Which ZIPs run on the tape: the ones named in config.tapeZips first (Utah, Hawaii, 81326 ...),
  // then the busiest measured ZIP of every region in the data. Three bed-bath pairs each.
  // A figure not measured in that ZIP itself says where it came from: its region, or "US".
  const featured = config.tapeZips || [];
  const busiest = new Map();
  for (const a of config.areas) {
    if (a.zips.length && a.in && (!busiest.has(a.in) || a.n > busiest.get(a.in).n)) busiest.set(a.in, a);
  }
  const zips = [...new Set([...featured, ...[...busiest.values()].map((a) => a.zips[0])])];
  const pairs = [[1, 1], [2, 1], [3, 2]];
  const marks = [];
  for (const zip of config.sample ? ['ANY ZIP'] : zips) {
    for (const [beds, baths] of pairs) {
      const address = config.sample ? '' : zip;
      const rate = rateFor({ address, beds, baths }, config);
      const figure = ownerMonthly({ address, beds, baths }, config);
      if (!rate || figure === null) continue;
      const where = config.sample || rate.scope === 'zip' ? '' : rate.scope === 'region' ? ` ${rate.name}` : ' US';
      marks.push([el('b', zip), '  ', el('span', `${beds} BD`, 'bed'), ' ', el('span', `${baths} BA`, 'bath'), ' ', sword(),
        ` $${figure.toLocaleString('en-US')}/MO`, ...(where ? [el('em', where)] : [])]);
    }
  }
  if (config.sample) marks.push(['SAMPLE RATES']);
  marks.push([el('b', 'REFUGE AND RESORT')]);
  const run = document.createElement('span');
  run.className = 'run';
  for (let half = 0; half < 4; half++) {   // equal copies, so the loop at -50% is seamless
    for (const mark of marks) run.append(...mark.map((m) => (typeof m === 'string' ? m : m.cloneNode(true))), '   ·   ');
  }
  run.style.animationDuration = `${Math.max(60, marks.length * 4)}s`;   // a steady pace however long the tape
  document.getElementById('tape').append(run);
}
