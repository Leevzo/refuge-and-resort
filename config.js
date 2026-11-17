// The numbers behind the figure. Change one here, the page follows.
// (The words on the page live in index.html.)
//
// What a place takes in per month = nightly × 30 × occupancy.
// What the owner keeps            = that × (1 − cut), rounded to roundTo.
//
// sample: true marks the figure "sample". The rates below are made-up
// placeholders. Put real figures for the area in, then set sample to false.
export default {
  cut: 0.20,         // our share of what the place takes in
  sample: true,
  roundTo: 50,
  bathStep: 0,       // added to the nightly rate for each bathroom past the first; 0 = bathrooms do not move the figure
  areas: [
    {
      zips: [],      // five-digit zips this table answers for; empty = every address
      rates: {
        1: { nightly: 80, occupancy: 0.6 },
        2: { nightly: 105, occupancy: 0.6 },
        3: { nightly: 135, occupancy: 0.6 },
        4: { nightly: 170, occupancy: 0.6 },
        5: { nightly: 210, occupancy: 0.6 },
        6: { nightly: 250, occupancy: 0.6 },
      },
    },
  ],
};
