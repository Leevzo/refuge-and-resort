#!/usr/bin/env python3
"""Real monthly earnings by ZIP x bedrooms x bathrooms, from Inside Airbnb's public data.

    python3 -I tools/rates.py                 # Denver (the default city)
    python3 -I tools/rates.py --city united-states/co/denver --state-zip-prefix 80

What it does, in order:
 1. Finds the city's newest listings file on insideairbnb.com/get-the-data (they publish
    about once a quarter; when nothing is new, nothing changes).
 2. Keeps whole homes that are really operating: earned in the last year, 3+ reviews in it.
 3. Gives each one the ZIP whose centre (US Census ZCTA file) is nearest to it.
 4. For each ZIP x beds x baths with at least MIN listings, takes the MEDIAN of
    estimated_revenue_l365d / 12 (Inside Airbnb's own estimate of a year's revenue).
    Thin groups fall back to the ZIP x beds, then to the whole city x beds x baths.
 5. Writes rates.js, which the page reads. Our cut is applied on the page (config.js).

Standard library only. Downloads are cached in tools/.cache/ (git-ignored).
"""
import argparse, csv, gzip, io, json, math, re, statistics, sys, urllib.request, zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / '.cache'
INDEX = 'https://insideairbnb.com/get-the-data/'
ZCTA = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip'
MIN = 10           # listings a group needs before its median is trusted
MAX_BEDS, MAX_BATHS = 6, 4
PREFIXES = ['800', '801', '802']   # Denver metro ZIPs; set with --metro
AGENT = {'User-Agent': 'refuge-and-resort-rates/1.0'}


def fetch(url, dest=None):
    req = urllib.request.Request(url, headers=AGENT)
    with urllib.request.urlopen(req, timeout=180) as r:
        data = r.read()
    if dest:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    return data


def newest_listings_url(city):
    page = fetch(INDEX).decode('utf-8', 'replace')
    pat = re.escape(f'https://data.insideairbnb.com/{city}/') + r'(\d{4}-\d{2}-\d{2})/data/listings\.csv\.gz'
    found = sorted(set(re.findall(pat, page)))
    if not found:
        sys.exit(f'No listings file for {city} on {INDEX}')
    stamp = found[-1]
    return stamp, f'https://data.insideairbnb.com/{city}/{stamp}/data/listings.csv.gz'


def zip_centres(prefix):
    path = CACHE / 'zcta.zip'
    if not path.exists():
        fetch(ZCTA, path)
    with zipfile.ZipFile(path) as z:
        text = z.read(z.namelist()[0]).decode('utf-8', 'replace')
    rows = csv.reader(io.StringIO(text), delimiter='\t')
    head = [h.strip() for h in next(rows)]
    gi, la, lo = head.index('GEOID'), head.index('INTPTLAT'), head.index('INTPTLONG')
    return [(r[gi], float(r[la]), float(r[lo])) for r in rows if r[gi].startswith(prefix)]


def nearest_zip(lat, lon, centres):
    k = math.cos(math.radians(lat))
    return min(centres, key=lambda c: (c[1] - lat) ** 2 + ((c[2] - lon) * k) ** 2)[0]


def number(text):
    try:
        return float(str(text).replace('$', '').replace(',', '').strip())
    except ValueError:
        return None


def homes(raw, centres):
    """(zip, beds, baths, monthly) for whole homes that earned in the last year."""
    for row in csv.DictReader(io.StringIO(gzip.decompress(raw).decode('utf-8', 'replace'))):
        if row.get('room_type') != 'Entire home/apt':
            continue
        revenue, beds = number(row.get('estimated_revenue_l365d')), number(row.get('bedrooms'))
        baths = number(row.get('bathrooms'))
        if baths is None:
            m = re.match(r'([\d.]+)', row.get('bathrooms_text') or '')
            baths = number(m.group(1)) if m else None
        lat, lon = number(row.get('latitude')), number(row.get('longitude'))
        if (number(row.get("number_of_reviews_ltm")) or 0) < 3:
            continue
        if not revenue or revenue <= 0 or not beds or not baths or lat is None or lon is None:
            continue
        beds, baths = min(int(beds), MAX_BEDS), min(max(int(baths), 1), MAX_BATHS)
        yield nearest_zip(lat, lon, centres), beds, baths, revenue / 12


def build(rows):
    by = {}
    for z, b, ba, m in rows:
        for key in ((z, b, ba), (z, b), ('*', b, ba), ('*', b)):
            by.setdefault(key, []).append(m)

    def median(key):
        vals = by.get(key, [])
        return (round(statistics.median(vals)), len(vals)) if len(vals) >= MIN else None

    # Each rate says where it came from: "zip" (this ZIP, these beds and baths), "beds" (this ZIP,
    # these beds, any baths) or "city" (the whole city, these beds and baths).
    def best(z, b, ba):
        for key, scope in (((z, b, ba), 'zip'), ((z, b), 'beds'), (('*', b, ba), 'city'), (('*', b), 'city')):
            hit = median(key)
            if hit:
                return {'monthly': hit[0], 'n': hit[1], 'scope': 'city' if z == '*' else scope}
        return None

    def table(z):
        rates = {}
        for b in range(1, MAX_BEDS + 1):
            for ba in range(1, MAX_BATHS + 1):
                hit = best(z, b, ba)
                if hit:
                    rates[f'{b}-{ba}'] = hit
        return rates

    areas = []
    for z in sorted({k[0] for k in by if k[0] != '*'}):
        homes_here = sum(len(by.get((z, b), [])) for b in range(1, MAX_BEDS + 1))
        if homes_here >= MIN:   # a ZIP with too few homes gets the city figures below, not a guess
            areas.append({'zips': [z], 'rates': table(z)})
    # The general area: any other ZIP in the metro starting with these digits gets the city-wide figures.
    areas.append({'zips': [], 'prefixes': PREFIXES, 'rates': table('*')})
    return areas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--city', default='united-states/co/denver')
    ap.add_argument('--state-zip-prefix', default='80')
    ap.add_argument('--metro', default=','.join(PREFIXES), help='ZIP starts that count as this city, e.g. 800,801,802')
    ap.add_argument('--out', default=str(ROOT / 'rates.js'))
    a = ap.parse_args()
    PREFIXES[:] = [p.strip() for p in a.metro.split(',') if p.strip()]

    stamp, url = newest_listings_url(a.city)
    raw_path = CACHE / f"{a.city.replace('/', '_')}_{stamp}.csv.gz"
    raw = raw_path.read_bytes() if raw_path.exists() else fetch(url, raw_path)
    areas = build(homes(raw, zip_centres(a.state_zip_prefix)))
    if not areas:
        sys.exit('No areas came out; rates.js left as it was.')

    data = {'source': url, 'data_date': stamp, 'built': date.today().isoformat(), 'areas': areas}
    text = ('// Written by tools/rates.py from Inside Airbnb public data. Do not edit by hand.\n'
            '// monthly = median estimated revenue a month for whole homes in that ZIP with that many beds-baths;\n'
            '// n = how many real listings that median stands on.\n'
            f'export default {json.dumps(data, separators=(",", ":"))};\n')
    out = Path(a.out)
    old = out.read_text() if out.exists() else ''
    if re.sub(r'"built": "[^"]*"', '', old) == re.sub(r'"built": "[^"]*"', '', text):
        print(f'No change ({stamp}).')
        return
    out.write_text(text)
    print(f'Wrote {out.name}: {len(areas)} ZIPs from {stamp}.')


if __name__ == '__main__':
    main()
