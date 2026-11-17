// ZIP, bedrooms, bathrooms in. One figure out. Nothing leaves the browser.
import config from './config.js?v=20261117b';

const limits = { beds: [1, 6], baths: [1, 6] };
const state = { beds: 1, baths: 1 };

// The area for the last five-digit number in the address: the ZIP's own area first, then a general
// area whose prefixes the ZIP starts with, then a catch-all with neither. null when none fits.
export function areaFor(address, areas) {
  const zip = (address.match(/\b\d{5}\b/g) || []).pop() || '';
  return areas.find((a) => a.zips.includes(zip))
    || (zip && areas.find((a) => (a.prefixes || []).some((p) => zip.startsWith(p))))
    || areas.find((a) => !a.zips.length && !a.prefixes)
    || null;
}

// The rate for beds and baths: a real "beds-baths" entry ({ monthly, n, scope }), else a sample
// per-bed entry ({ nightly, occupancy }). null when nothing fits.
export function rateFor({ address, beds, baths }, cfg) {
  const area = areaFor(address, cfg.areas);
  return (area && (area.rates[`${beds}-${baths}`] || area.rates[beds])) || null;
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
    // The figure waits for a whole ZIP; until then its room stays empty.
    const zip = $('zip').value;
    if (zip.length < 5) { $('money').replaceChildren(); return; }
    const unit = document.createElement('span');
    const figure = ownerMonthly({ address: zip, ...state }, config);
    if (figure === null) {
      unit.textContent = 'We are not in your area yet. Write to us.';
      $('money').replaceChildren(unit);
      return;
    }
    const rate = rateFor({ address: zip, ...state }, config);
    unit.textContent = config.sample ? 'a month · sample'
      : rate.scope === 'city' ? `a month · from ${rate.n} homes like yours in Denver`
      : `a month · from ${rate.n} homes like yours nearby`;
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
  // Each ZIP × the common bed and bath pairs: "80211  2 BD 1 BA ▲ $2,500/MO".
  // Real data: only pairs measured in that ZIP itself (scope "zip"). Sample data: "ANY ZIP".
  const pairs = [[1, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 3]];
  const marks = [];
  for (const area of config.areas) {
    if (!area.zips.length && !config.sample) continue;
    const zip = area.zips[0] || 'ANY ZIP';
    for (const [beds, baths] of pairs) {
      const rate = rateFor({ address: area.zips[0] || '', beds, baths }, config);
      if (!rate || (!config.sample && rate.scope !== 'zip')) continue;
      const figure = ownerMonthly({ address: area.zips[0] || '', beds, baths }, config);
      marks.push([el('b', zip), `  ${beds} BD ${baths} BA `, el('i', '▲'), ` $${figure.toLocaleString('en-US')}/MO`]);
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
