// The numbers behind the figure.
//
// rates.js holds REAL figures, written by tools/rates.py from Inside Airbnb's public data:
// for each ZIP and each beds-baths pair, the median a month that real whole homes earn.
// The page shows what the owner keeps: that × (1 − cut), rounded to roundTo.
//
// If rates.js is ever empty, the made-up sample table below is used and the figure says "sample".
import rates from './rates.js';

export const sampleAreas = [
  {
    zips: [],
    rates: {
      1: { nightly: 80, occupancy: 0.6 },
      2: { nightly: 105, occupancy: 0.6 },
      3: { nightly: 135, occupancy: 0.6 },
      4: { nightly: 170, occupancy: 0.6 },
      5: { nightly: 210, occupancy: 0.6 },
      6: { nightly: 250, occupancy: 0.6 },
    },
  },
];

const real = rates.areas && rates.areas.length > 0;

export default {
  cut: 0.20,         // our share of what the place takes in
  roundTo: 50,
  bathStep: 0,       // sample table only: added to the nightly rate per bathroom past the first
  sample: !real,
  // ZIPs that always run first on the tape: 84060 Park City, Utah; 96753 Kihei, Maui; 81326 Hesperus, Colorado.
  // (Utah ZIPs show the US figure, marked US, until there is Utah data. One is enough until then.)
  tapeZips: ['84060', '96753', '81326'],
  dataDate: real ? rates.data_date : null,
  areas: real ? rates.areas : sampleAreas,
};
