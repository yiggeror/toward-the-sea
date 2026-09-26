#!/usr/bin/env python3
"""Fetch CC0 sound effects from Freesound (HQ previews) with full attribution.

For every entry in SOUNDS we search Freesound restricted to the Creative
Commons 0 license, take the first acceptable result (optionally a fixed sound
id), read its page to confirm the license, title and author, and download the
HQ Ogg preview to audio/src/<name>.ogg. Metadata goes to audio/sources.json,
which tools/credits.py turns into CREDITS.md.

usage: python3 tools/fetch_sounds.py [name ...]
"""
import json
import os
import re
import sys
import time
import html
import urllib.parse
import urllib.request
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'audio', 'src')
META = os.path.join(ROOT, 'audio', 'sources.json')

# name: (query, min_dur, max_dur, [preferred sound id or None])
SOUNDS = {
    'city_night': ('city night ambience distant traffic', 30, 600, None),
    'drips': ('water dripping gutter', 10, 300, None),
    'drip_single': ('single water drop', 0.2, 6, None),
    'car_pass_wet': ('car passing wet road', 3, 40, None),
    'can_drop': ('tin can drop', 0.3, 8, None),
    'paper_flutter': ('paper flutter wind', 1, 30, None),
    'paper_rustle': ('paper rustle', 0.5, 20, None),
    'wind_light': ('light wind ambience', 20, 600, None),
    'wind_strong': ('strong wind howling', 15, 600, None),
    'wind_gust': ('wind gust', 2, 30, None),
    'forest_birds': ('forest birds morning', 30, 600, None),
    'stream': ('small stream brook', 20, 600, None),
    'splash_small': ('small water splash', 0.3, 5, None),
    'splash': ('water splash', 0.5, 6, None),
    'rain_heavy': ('heavy rain', 30, 600, None),
    'rain_light': ('light rain', 30, 600, None),
    'rain_roof': ('rain on metal roof', 20, 600, None),
    'thunder_crack': ('thunder crack close', 3, 40, None),
    'thunder_far': ('distant thunder rumble', 5, 60, None),
    'crickets': ('crickets night', 30, 600, None),
    'owl': ('owl hoot', 1, 20, None),
    'truck_far': ('truck passing distance night', 5, 60, None),
    'desert_wind': ('desert wind sand', 20, 600, None),
    'snow_steps': ('footsteps snow crunch', 2, 60, None),
    'winter_wind': ('winter wind soft', 20, 600, None),
    'grass_wind': ('wind through grass', 20, 600, None),
    'waves_beach': ('ocean waves beach', 30, 600, None),
    'waves_far': ('distant ocean waves', 30, 600, None),
    'wave_wash': ('wave wash sand', 3, 60, None),
    'seagulls': ('seagulls', 5, 120, None),
    'sand_steps': ('footsteps sand', 2, 60, None),
    'cloth_shake': ('cloth shake', 0.5, 10, None),
    'whoosh': ('soft whoosh', 0.3, 4, None),
    'tumbleweed': ('dry leaves rolling', 2, 30, None),
    'purr': ('cat purr', 3, 60, None),
}

UA = {'User-Agent': 'Mozilla/5.0 (toward-the-sea sound fetcher; contact via repo)'}


def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                return data if binary else data.decode('utf-8', 'replace')
        except Exception as e:  # network hiccup: retry with backoff
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))


def search(query):
    q = urllib.parse.urlencode({
        'q': query,
        'f': 'license:"Creative Commons 0"',
        's': 'Rating (highest first)',
        'advanced': '1',
        'g': '',
    })
    page = get('https://freesound.org/search/?' + q)
    ids = []
    for m in re.finditer(r'/people/([^/"]+)/sounds/(\d+)/', page):
        if m.group(2) not in [i for _, i in ids]:
            ids.append((m.group(1), m.group(2)))
    return ids


def sound_info(user, sid):
    url = f'https://freesound.org/people/{user}/sounds/{sid}/'
    page = get(url)
    lic = 'CC0' if 'publicdomain/zero/1.0' in page else None
    title = re.search(r'<meta property="og:title" content="([^"]*)"', page)
    title = html.unescape(title.group(1)) if title else f'sound {sid}'
    title = re.sub(r'\s+by\s+' + re.escape(user) + r'\s*$', '', title)
    dur = re.search(r'Duration</dt>\s*<dd[^>]*>\s*([\d:.]+)', page)
    seconds = None
    if dur:
        parts = [float(p) for p in dur.group(1).split(':')]
        seconds = sum(p * 60 ** (len(parts) - 1 - i) for i, p in enumerate(parts))
    prev = re.search(r'(https://cdn\.freesound\.org/previews/\d+/\d+_\d+)-lq\.mp3', page)
    return {'url': url, 'license': lic, 'title': title, 'author': user, 'id': int(sid),
            'duration': seconds, 'preview': (prev.group(1) + '-hq.ogg') if prev else None}


def probe_duration(data):
    with tempfile.NamedTemporaryFile(suffix='.ogg') as f:
        f.write(data)
        f.flush()
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f.name], capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return None


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = json.load(open(META)) if os.path.exists(META) else {}
    names = sys.argv[1:] or list(SOUNDS)
    for name in names:
        query, dmin, dmax, prefer = SOUNDS[name]
        if name in meta and os.path.exists(os.path.join(OUT, name + '.ogg')):
            print(f'{name}: have {meta[name]["title"]}')
            continue
        chosen = None
        try:
            cands = search(query)
        except Exception as e:
            print(f'{name}: search failed: {e}')
            continue
        if prefer:
            cands = [c for c in cands if c[1] == str(prefer)] + cands
        for user, sid in cands[:12]:
            try:
                info = sound_info(user, sid)
            except Exception:
                continue
            if info['license'] != 'CC0' or not info['preview']:
                continue
            try:
                data = get(info['preview'], binary=True)
            except Exception:
                continue
            info['duration'] = probe_duration(data)
            if info['duration'] is None or not (dmin <= info['duration'] <= dmax):
                continue
            chosen = info
            break
        if not chosen:
            print(f'{name}: no acceptable CC0 result for "{query}"')
            continue
        with open(os.path.join(OUT, name + '.ogg'), 'wb') as f:
            f.write(data)
        chosen['query'] = query
        chosen['file'] = f'audio/src/{name}.ogg'
        meta[name] = chosen
        json.dump(meta, open(META, 'w'), indent=1, ensure_ascii=False)
        print(f'{name}: {chosen["title"]} by {chosen["author"]} ({chosen["duration"]}s) -> {len(data)//1024} KB')
        time.sleep(0.5)


if __name__ == '__main__':
    main()
