// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerMonthly, areaFor } from '../app.js';
import { sampleAreas } from '../config.js';

const sample = { cut: 0.20, roundTo: 50, bathStep: 0, areas: sampleAreas };
const at = (beds, baths = 1, address = '') => ownerMonthly({ address, beds, baths }, sample);

test('sample figures, worked by hand', () => {
  // 80 × 30 × 0.6 × 0.8 = 1152 → nearest 50 = 1150
  assert.equal(at(1), 1150);
  // 105 × 30 × 0.6 × 0.8 = 1512 → 1500
  assert.equal(at(2), 1500);
  // 135 × 30 × 0.6 × 0.8 = 1944 → 1950
  assert.equal(at(3), 1950);
  // 250 × 30 × 0.6 × 0.8 = 3600 → 3600
  assert.equal(at(6), 3600);
});

test('bathrooms do not move the figure while bathStep is 0', () => {
  assert.equal(at(3, 4), at(3, 1));
});

test('no rate for the bedrooms gives null', () => {
  assert.equal(at(7), null);
});

const cfg = {
  cut: 0.25,
  roundTo: 10,
  bathStep: 20,
  areas: [
    { zips: ['97201'], rates: { 2: { nightly: 100, occupancy: 0.5 } } },
    { zips: [], rates: { 2: { nightly: 90, occupancy: 0.5 } } },
  ],
};

test('zip-keyed area, bathStep and roundTo', () => {
  // (100 + 20 × 2) × 30 × 0.5 × 0.75 = 1575 → nearest 10 = 1580
  assert.equal(ownerMonthly({ address: '12 Elm St, Portland OR 97201', beds: 2, baths: 3 }, cfg), 1580);
  // other zip falls to the catch-all: 90 × 30 × 0.5 × 0.75 = 1012.5 → 1010
  assert.equal(ownerMonthly({ address: '1 Main St 10001', beds: 2, baths: 1 }, cfg), 1010);
});

test('areaFor takes the last five-digit number as the zip', () => {
  assert.equal(areaFor('12345 Oak Rd 97201', cfg.areas), cfg.areas[0]);
  assert.equal(areaFor('', cfg.areas), cfg.areas[1]);
  assert.equal(areaFor('97201', [{ zips: ['10001'], rates: {} }]), null);
});

const real = {
  cut: 0.20,
  roundTo: 50,
  areas: [
    { zips: ['80211'], rates: { '2-1': { monthly: 3156, n: 65, scope: 'zip' } } },
    { zips: [], prefixes: ['800', '801', '802'], rates: { '2-1': { monthly: 2867, n: 410, scope: 'city' } } },
  ],
};

test('real figures: monthly x (1 - cut), the ZIP first, then the metro, else nothing', () => {
  // 3156 x 0.8 = 2524.8 -> nearest 50 = 2500
  assert.equal(ownerMonthly({ address: '80211', beds: 2, baths: 1 }, real), 2500);
  // another Denver ZIP takes the city figure: 2867 x 0.8 = 2293.6 -> 2300
  assert.equal(ownerMonthly({ address: '80227', beds: 2, baths: 1 }, real), 2300);
  // outside the metro: no figure, not a guess
  assert.equal(ownerMonthly({ address: '97201', beds: 2, baths: 1 }, real), null);
  // a pair with no data: no figure
  assert.equal(ownerMonthly({ address: '80211', beds: 5, baths: 4 }, real), null);
});
