# Refuge and Resort

refugeandresort.com: a property owner types an address, sets bedrooms and bathrooms, and sees what they could earn per month. One static page, no build, no dependencies, nothing sent anywhere.

- `index.html` — the words on the page
- `config.js` — the numbers behind the figure
- `app.js` — the sum (`ownerMonthly`, `areaFor`) and the page wiring
- `style.css`, `fonts/` — the look

## Change a number

Edit `config.js`. Monthly to the owner = nightly × 30 × occupancy × (1 − cut), rounded to `roundTo`. Rates are per bedroom count; `bathStep` adds to the nightly rate per bathroom past the first; `areas` with `zips` override the catch-all area (`zips: []`).

The rates now are made-up placeholders, so `sample: true` prints "sample" beside the figure. Set it to `false` only with real figures in place.

## Test

    node --test

## Look at it locally

    python3 -m http.server 8000

then open http://localhost:8000. (Opening `index.html` straight from disk will not run the script; browsers block modules on `file://`.)
