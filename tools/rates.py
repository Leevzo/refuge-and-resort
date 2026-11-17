#!/usr/bin/env python3
"""Real monthly earnings by ZIP x bedrooms x bathrooms, nationwide, from Inside Airbnb's public data.

    python3 -I tools/rates.py                       # every US area Inside Airbnb publishes
    python3 -I tools/rates.py --only co/denver,hi/hawaii

What it does, in order:
 1. Reads insideairbnb.com/get-the-data and takes the newest listings file for every US area
    (about 35: Hawaii, Denver, Los Angeles, New York, Nashville, Austin, ... ; they refresh
    about once a quarter. Utah is not among them).
 2. Keeps whole homes that are really operating: earned in the last year, 3+ reviews in it.
 3. Gives each the ZIP whose centre (US Census ZCTA file) is nearest.
 4. Medians of estimated_revenue_l365d / 12, each from at least MIN homes, at four levels:
      ZIP x beds-baths  ->  ZIP x beds  ->  area x beds-baths / beds  ->  whole US x beds-baths / beds
    The page walks down that ladder and says which level the number came from.
 5. Writes rates.js. Our cut is applied on the page (config.js).

Standard library only. Downloads are cached in tools/.cache/ (git-ignored).
"""
import argparse, csv, gzip, hashlib, io, json, math, re, statistics, sys, urllib.request, zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / '.cache'
INDEX = 'https://insideairbnb.com/get-the-data/'
ZCTA = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip'
MIN = 10           # homes a median needs before it is trusted
MAX_BEDS, MAX_BATHS = 6, 4
AGENT = {'User-Agent': 'refuge-and-resort-rates/1.0'}
csv.field_size_limit(10_000_000)


def fetch(url, dest=None):
    req = urllib.request.Request(url, headers=AGENT)
    with urllib.request.urlopen(req, timeout=600) as r:
        data = r.read()
    if dest:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    return data


def us_areas():
    """{'co/denver': ('2026-09-25', url), ...}, newest file per area."""
    page = fetch(INDEX).decode('utf-8', 'replace')
    found = {}
    for url, area, stamp in re.findall(
            r'(https://data\.insideairbnb\.com/united-states/([a-z-]+/[a-z-]+)/(\d{4}-\d{2}-\d{2})/data/listings\.csv\.gz)', page):
        if area not in found or stamp > found[area][0]:
            found[area] = (stamp, url)
    return found


def pretty(area):
    state, slug = area.split('/')
    slug = re.sub(rf'-{state}$', '', slug).replace('-msa', '')
    words = {'dc': 'DC', 'hawaii': 'Hawaii'}
    return ' '.join(words.get(w, w.capitalize()) for w in slug.split('-'))


class Zips:
    """Nearest ZIP centre, bucketed by whole degrees so a lookup checks only nearby centres."""
    def __init__(self):
        path = CACHE / 'zcta.zip'
        if not path.exists():
            fetch(ZCTA, path)
        with zipfile.ZipFile(path) as z:
            text = z.read(z.namelist()[0]).decode('utf-8', 'replace')
        rows = csv.reader(io.StringIO(text), delimiter='\t')
        head = [h.strip() for h in next(rows)]
        gi, la, lo = head.index('GEOID'), head.index('INTPTLAT'), head.index('INTPTLONG')
        self.cells = {}
        for r in rows:
            lat, lon = float(r[la]), float(r[lo])
            self.cells.setdefault((math.floor(lat), math.floor(lon)), []).append((r[gi], lat, lon))

    def nearest(self, lat, lon):
        k = math.cos(math.radians(lat))
        best, dist = None, 1e9
        cy, cx = math.floor(lat), math.floor(lon)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for z, zl, zo in self.cells.get((cy + dy, cx + dx), ()):
                    d = (zl - lat) ** 2 + ((zo - lon) * k) ** 2
                    if d < dist:
                        best, dist = z, d
        return best


def number(text):
    try:
        return float(str(text).replace('$', '').replace(',', '').strip())
    except ValueError:
        return None


def homes(raw, zips):
    """(zip, beds, baths, monthly) for whole homes that are really operating."""
    for row in csv.DictReader(io.StringIO(gzip.decompress(raw).decode('utf-8', 'replace'))):
        if row.get('room_type') != 'Entire home/apt' or (number(row.get('number_of_reviews_ltm')) or 0) < 3:
            continue
        revenue, beds = number(row.get('estimated_revenue_l365d')), number(row.get('bedrooms'))
        baths = number(row.get('bathrooms'))
        if baths is None:
            m = re.match(r'([\d.]+)', row.get('bathrooms_text') or '')
            baths = number(m.group(1)) if m else None
        lat, lon = number(row.get('latitude')), number(row.get('longitude'))
        if not revenue or revenue <= 0 or not beds or not baths or lat is None or lon is None:
            continue
        z = zips.nearest(lat, lon)
        if z:
            yield z, min(int(beds), MAX_BEDS), min(max(int(baths), 1), MAX_BATHS), revenue / 12


def medians(groups):
    """{key: [monthly, n]} for groups with at least MIN homes."""
    return {k: [round(statistics.median(v)), len(v)] for k, v in groups.items() if len(v) >= MIN}


def table(groups):
    """'b-ba' and 'b' keys -> [monthly, n] for one set of homes."""
    out = {}
    for (b, ba), v in medians({(b, ba): v for (b, ba), v in groups['pair'].items()}).items():
        out[f'{b}-{ba}'] = v
    for b, v in medians(groups['beds']).items():
        out[str(b)] = v
    return out


def empty():
    return {'pair': {}, 'beds': {}, 'all': 0}


def add(g, b, ba, m):
    g['pair'].setdefault((b, ba), []).append(m)
    g['beds'].setdefault(b, []).append(m)
    g['all'] += 1


# First three ZIP digits of each state we have data for, so any ZIP in that state gets the state figure.
STATES = {
    'ca': ('California', [(900, 961)]), 'co': ('Colorado', [(800, 816)]), 'ct': ('Connecticut', [(60, 69)]),
    'dc': ('DC', [(200, 205)]), 'fl': ('Florida', [(320, 349)]), 'hi': ('Hawaii', [(967, 968)]),
    'il': ('Illinois', [(600, 629)]), 'la': ('Louisiana', [(700, 714)]), 'ma': ('Massachusetts', [(10, 27)]),
    'mn': ('Minnesota', [(550, 567)]), 'mt': ('Montana', [(590, 599)]), 'nc': ('North Carolina', [(270, 289)]),
    'nj': ('New Jersey', [(70, 89)]), 'nv': ('Nevada', [(889, 898)]), 'ny': ('New York', [(100, 149)]),
    'oh': ('Ohio', [(430, 459)]), 'or': ('Oregon', [(970, 979)]), 'ri': ('Rhode Island', [(28, 29)]),
    'tn': ('Tennessee', [(370, 385)]), 'tx': ('Texas', [(750, 799), (885, 885)]), 'wa': ('Washington', [(980, 994)]),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='', help='comma list like co/denver,hi/hawaii; default every US area')
    ap.add_argument('--out', default=str(ROOT / 'rates.js'))
    a = ap.parse_args()

    found = us_areas()
    wanted = [x.strip() for x in a.only.split(',') if x.strip()] or sorted(found)
    zips = Zips()
    by_zip, by_area, by_state, nation, used = {}, {}, {}, empty(), []
    for area in wanted:
        if area not in found:
            print(f'skip {area}: not on Inside Airbnb'); continue
        stamp, url = found[area]
        path = CACHE / f"{area.replace('/', '_')}_{stamp}.csv.gz"
        raw = path.read_bytes() if path.exists() else fetch(url, path)
        g, count = by_area.setdefault(area, empty()), 0
        prefixes = set()
        for z, b, ba, m in homes(raw, zips):
            add(by_zip.setdefault(z, empty()), b, ba, m); add(g, b, ba, m); add(nation, b, ba, m)
            add(by_state.setdefault(area.split('/')[0], empty()), b, ba, m)
            by_zip[z]['area'] = area
            prefixes.add(z[:3]); count += 1
        g['prefixes'] = prefixes
        used.append({'area': area, 'name': pretty(area), 'data_date': stamp, 'homes': count})
        print(f'{area}: {count} homes ({stamp})', flush=True)

    areas = []
    for z in sorted(by_zip):
        g = by_zip[z]
        if g['all'] >= MIN:
            areas.append({'zips': [z], 'in': pretty(g['area']), 'n': g['all'], 'rates': table(g)})
    for area, g in sorted(by_area.items(), key=lambda kv: -kv[1]['all']):
        if g['all'] >= MIN:
            areas.append({'zips': [], 'name': pretty(area), 'prefixes': sorted(g['prefixes']), 'rates': table(g)})
    for st, g in sorted(by_state.items()):
        if g['all'] >= MIN and st in STATES:
            name, spans = STATES[st]
            prefixes = [f'{p:03d}' for lo, hi in spans for p in range(lo, hi + 1)]
            areas.append({'zips': [], 'name': name, 'state': True, 'prefixes': prefixes, 'rates': table(g)})
    areas.append({'zips': [], 'name': 'the US', 'national': True, 'rates': table(nation)})
    if nation['all'] < MIN:
        sys.exit('Too little data came out; rates.js left as it was.')

    data = {'built': date.today().isoformat(), 'sources': used, 'areas': areas}
    text = ('// Written by tools/rates.py from Inside Airbnb public data. Do not edit by hand.\n'
            '// rates: "beds-baths" or "beds" -> [median monthly revenue of real whole homes, how many homes].\n'
            f'export default {json.dumps(data, separators=(",", ":"))};\n')
    out = Path(a.out)
    old = out.read_text() if out.exists() else ''
    strip = lambda t: re.sub(r'"built":"[^"]*"', '', t)
    if strip(old) == strip(text):
        print('No change.')
        return
    out.write_text(text)
    # Stamp the import in config.js with this data's fingerprint, so no browser pairs new code with old numbers.
    cfg = ROOT / 'config.js'
    stamp = hashlib.sha1(text.encode()).hexdigest()[:10]
    cfg.write_text(re.sub(r"from '\./rates\.js(\?v=[0-9a-f]+)?';", f"from './rates.js?v={stamp}';", cfg.read_text()))
    print(f'Wrote {out.name}: {sum(1 for x in areas if x["zips"])} ZIPs, {len(used)} areas, {nation["all"]} homes, {len(text)//1024} KB.')


if __name__ == '__main__':
    main()
