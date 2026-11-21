"""Build and zip Street Football for the game portals.

    python3 tools/package_portals.py              # crazygames, poki, itch
    python3 tools/package_portals.py poki         # just one

For each portal it runs a Vite build with VITE_PORTAL set (src/portal.js picks
the SDK, vite.config.js puts the SDK <script> in <head>) and zips the output
into portal-builds/street-football-<portal>.zip with index.html at the root
of the zip, which every portal expects.

Left out of the zips: the full-size roster portraits and field concept
images. The game never loads them; they're only on the GitHub Pages site so
the Notion gallery can show them.
"""

import os
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'portal-builds')
PORTALS = ['crazygames', 'poki', 'itch']
SKIP = [re.compile(r'^art/roster/\d\d-[^/]+\.jpg$'), re.compile(r'^art/field-[a-z]+\.jpg$')]


def build(portal):
    dist = os.path.join(ROOT, 'build', portal)
    shutil.rmtree(dist, ignore_errors=True)
    env = dict(os.environ, VITE_PORTAL=portal)
    subprocess.run(['npx', 'vite', 'build', '--outDir', dist, '--emptyOutDir'],
                   cwd=ROOT, env=env, check=True, stdout=subprocess.DEVNULL)
    os.makedirs(OUT, exist_ok=True)
    zpath = os.path.join(OUT, f'street-football-{portal}.zip')
    files = 0
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        for base, _, names in os.walk(dist):
            for n in sorted(names):
                full = os.path.join(base, n)
                rel = os.path.relpath(full, dist).replace(os.sep, '/')
                if any(p.match(rel) for p in SKIP):
                    continue
                z.write(full, rel)
                files += 1
    with zipfile.ZipFile(zpath) as z:
        assert 'index.html' in z.namelist(), 'index.html must be at the zip root'
        html = z.read('index.html').decode()
    sdk = 'crazygames-sdk' if portal == 'crazygames' else 'poki-sdk' if portal == 'poki' else None
    if sdk:
        assert sdk in html, f'{portal}: SDK script missing from index.html'
    else:
        assert 'crazygames-sdk' not in html and 'poki-sdk' not in html
    size = os.path.getsize(zpath) / 1024 / 1024
    print(f'{portal:11s} {zpath[len(ROOT) + 1:]}  {size:.1f} MB  {files} files')


def main():
    wanted = sys.argv[1:] or PORTALS
    for p in wanted:
        if p not in PORTALS:
            raise SystemExit(f'unknown portal {p!r}; pick from {PORTALS}')
        build(p)


if __name__ == '__main__':
    main()
