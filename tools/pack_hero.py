"""Pack the three hero GLBs into one small file for the game.

    python3 tools/pack_hero.py

The game used to download three 7 MB files - hero_gassed_run.glb,
hero_regular_run.glb and hero_turbo_run.glb - when each was ~6.7 MB of the
same 2048x2048 PNG texture and only 8-12 KB of animation. This writes
public/models/hero.glb:

  * the gassed file's mesh, skin, skeleton and material, copied byte for byte
  * its texture re-encoded as JPEG (the PNG's alpha is 255 everywhere)
  * all three run clips, the two extra ones re-targeted onto the base file's
    nodes by bone name (the three files share one identical 24-joint rig)

The sources stay in assets-src/models/ (not deployed); the Blender clip
script authors on assets-src/models/hero_regular_run.glb.

Needs Pillow.
"""

import io
import json
import os
import struct

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets-src', 'models')
OUT = os.path.join(ROOT, 'public', 'models', 'hero.glb')
JPEG_QUALITY = 88

# (file, the clip's name in the packed file)
EXTRA = [
    ('hero_turbo_run.glb', 'Run_Turbo'),
    ('hero_regular_run.glb', 'Run_Regular'),
]
BASE = ('hero_gassed_run.glb', 'Run_Gassed')


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, _, _ = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, path
    jlen, jtype = struct.unpack_from('<II', data, 12)
    gj = json.loads(data[20:20 + jlen])
    blen, _ = struct.unpack_from('<II', data, 20 + jlen)
    binary = data[28 + jlen:28 + jlen + blen]
    return gj, binary


def view_bytes(gj, binary, i):
    bv = gj['bufferViews'][i]
    off = bv.get('byteOffset', 0)
    return binary[off:off + bv['byteLength']]


class Packer:
    def __init__(self):
        self.bin = bytearray()
        self.views = []

    def add_view(self, data, template):
        while len(self.bin) % 4:
            self.bin.append(0)
        bv = {k: v for k, v in template.items() if k not in ('byteOffset', 'byteLength', 'buffer')}
        bv.update({'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)})
        self.bin.extend(data)
        self.views.append(bv)
        return len(self.views) - 1


def main():
    base, base_bin = read_glb(os.path.join(SRC, BASE[0]))
    pk = Packer()

    # 1. Copy every base buffer view, swapping the PNG for a JPEG.
    image_views = {img['bufferView'] for img in base.get('images', [])}
    remap = {}
    for i, bv in enumerate(base['bufferViews']):
        data = view_bytes(base, base_bin, i)
        if i in image_views:
            im = Image.open(io.BytesIO(data)).convert('RGB')
            out = io.BytesIO()
            im.save(out, 'JPEG', quality=JPEG_QUALITY, optimize=True, progressive=False)
            data = out.getvalue()
        remap[i] = pk.add_view(data, bv)
    for acc in base['accessors']:
        if 'bufferView' in acc:
            acc['bufferView'] = remap[acc['bufferView']]
    for img in base.get('images', []):
        img['bufferView'] = remap[img['bufferView']]
        img['mimeType'] = 'image/jpeg'
    base['bufferViews'] = pk.views
    base['animations'][0]['name'] = BASE[1]

    # 2. Bring in the other two run clips, re-targeted by node name.
    node_index = {n.get('name'): i for i, n in enumerate(base['nodes'])}
    for fname, clip_name in EXTRA:
        src, src_bin = read_glb(os.path.join(SRC, fname))
        anim = src['animations'][0]
        acc_map = {}

        def copy_accessor(ai):
            if ai in acc_map:
                return acc_map[ai]
            acc = dict(src['accessors'][ai])
            vi = pk.add_view(view_bytes(src, src_bin, acc['bufferView']),
                             src['bufferViews'][acc['bufferView']])
            acc['bufferView'] = vi
            base['accessors'].append(acc)
            acc_map[ai] = len(base['accessors']) - 1
            return acc_map[ai]

        samplers = []
        for s in anim['samplers']:
            samplers.append({**s, 'input': copy_accessor(s['input']),
                             'output': copy_accessor(s['output'])})
        channels = []
        for ch in anim['channels']:
            name = src['nodes'][ch['target']['node']].get('name')
            if name not in node_index:
                raise SystemExit(f'{fname}: node {name!r} not in base rig')
            channels.append({'sampler': ch['sampler'],
                             'target': {**ch['target'], 'node': node_index[name]}})
        base['animations'].append({'name': clip_name, 'samplers': samplers, 'channels': channels})

    while len(pk.bin) % 4:
        pk.bin.append(0)
    base['buffers'] = [{'byteLength': len(pk.bin)}]

    js = json.dumps(base, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    total = 12 + 8 + len(js) + 8 + len(pk.bin)
    with open(OUT, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack('<II', len(pk.bin), 0x004E4942))
        f.write(pk.bin)
    print('wrote', os.path.relpath(OUT, ROOT), '%.0f KB' % (total / 1024),
          'clips:', [a['name'] for a in base['animations']])


if __name__ == '__main__':
    main()
