// ZIP, bedrooms, bathrooms in. One figure out. Nothing leaves the browser.
import config from './config.js?v=20261117';

const limits = { beds: [1, 6], baths: [1, 6] };
const state = { beds: 1, baths: 1 };

// The area whose zips hold the last five-digit number in the address; else the catch-all (zips: []).
export function areaFor(address, areas) {
  const zip = (address.match(/\b\d{5}\b/g) || []).pop() || '';
  return areas.find((a) => a.zips.includes(zip)) || areas.find((a) => !a.zips.length) || null;
}

// Monthly to the owner = nightly × 30 × occupancy × (1 − cut), rounded to roundTo. null when no rate fits.
export function ownerMonthly({ address, beds, baths }, cfg) {
  const area = areaFor(address, cfg.areas);
  const rate = area && area.rates[beds];
  if (!rate) return null;
  const nightly = rate.nightly + (cfg.bathStep || 0) * Math.max(0, baths - 1);
  const keeps = nightly * 30 * rate.occupancy * (1 - cfg.cut);
  const step = cfg.roundTo || 1;
  return Math.round(keeps / step) * step;
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
    // The figure waits for a whole ZIP; until then its room stays empty.
    const zip = $('zip').value;
    const figure = zip.length === 5 ? ownerMonthly({ address: zip, ...state }, config) : null;
    if (figure === null) { $('money').replaceChildren(); return; }
    const unit = document.createElement('span');
    unit.textContent = config.sample ? 'a month · sample' : 'a month';
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
  const el = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
  // Every area in config.js × every bed and bath pair it has a rate for: "97201  2 BD 1 BA ▲ $1,500/MO".
  // An area with ZIPs shows its first ZIP; the catch-all shows "ANY ZIP".
  const marks = [];
  for (const area of config.areas) {
    const zip = area.zips[0] || 'ANY ZIP';
    for (const beds of Object.keys(area.rates).map(Number).slice(0, 4)) {
      for (const baths of [1, 2].filter((b) => b <= beds)) {
        const figure = ownerMonthly({ address: area.zips[0] || '', beds, baths }, config);
        if (figure !== null) marks.push([el('b', zip), `  ${beds} BD ${baths} BA `, el('i', '▲'), ` $${figure.toLocaleString('en-US')}/MO`]);
      }
    }
  }
  if (config.sample) marks.push(['SAMPLE RATES']);
  marks.push([el('b', 'REFUGE AND RESORT')]);
  const run = document.createElement('span');
  run.className = 'run';
  for (let half = 0; half < 4; half++) {   // equal copies, so the loop at -50% is seamless
    for (const mark of marks) run.append(...mark.map((m) => (typeof m === 'string' ? m : m.cloneNode(true))), '   ·   ');
  }
  document.getElementById('tape').append(run);
}
