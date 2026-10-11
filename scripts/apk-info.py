"""Print facts about an APK's binary AndroidManifest.xml as JSON: package,
versionCode, versionName, debuggable, whether it is an expo-dev-client build,
whether it bundles JS, and its native ABIs. Stdlib only, so it runs where
aapt2 does not (e.g. aarch64 Linux). Usage: python3 scripts/apk-info.py app.apk"""
import json, struct, sys, zipfile


def strings(d, off):
    _, hsz, _ = struct.unpack_from('<HHI', d, off)
    count, _, flags, s_start, _ = struct.unpack_from('<IIIII', d, off + 8)
    utf8 = flags & 0x100
    offs = struct.unpack_from('<%dI' % count, d, off + hsz)
    base = off + s_start
    out = []
    for o in offs:
        p = base + o
        if utf8:
            n = d[p]; p += 2 if n & 0x80 else 1  # utf16 length
            n = d[p]
            if n & 0x80:
                n = ((n & 0x7f) << 8) | d[p + 1]; p += 2
            else:
                p += 1
            out.append(d[p:p + n].decode('utf-8', 'replace'))
        else:
            n = struct.unpack_from('<H', d, p)[0]; p += 2
            if n & 0x8000:
                n = ((n & 0x7fff) << 16) | struct.unpack_from('<H', d, p)[0]; p += 2
            out.append(d[p:p + 2 * n].decode('utf-16-le', 'replace'))
    return out


def parse(d):
    """Return [(tag, {attr: value})] for every element, in document order."""
    pool, res_ids, elements = [], [], []
    off = struct.unpack_from('<H', d, 2)[0]
    while off < len(d):
        typ, hsz, size = struct.unpack_from('<HHI', d, off)
        if typ == 0x0001:
            pool = strings(d, off)
        elif typ == 0x0180:
            res_ids = list(struct.unpack_from('<%dI' % ((size - hsz) // 4), d, off + hsz))
        elif typ == 0x0102:  # start element
            _, name, a_start, a_size, a_count = struct.unpack_from('<iiHHH', d, off + 16)
            attrs = {}
            for i in range(a_count):
                a = off + 16 + a_start + i * a_size
                _, an, raw, _, _, dtype, data = struct.unpack_from('<iiiHBBI', d, a)
                attr = pool[an] or ''
                if not attr and an < len(res_ids):
                    attr = hex(res_ids[an])
                if dtype == 0x03:
                    val = pool[data]
                elif dtype == 0x12:
                    val = data != 0
                else:
                    val = pool[raw] if raw >= 0 else data
                attrs[attr] = val
            elements.append((pool[name], attrs))
        off += size
    return elements


apk = zipfile.ZipFile(sys.argv[1])
elements = parse(apk.read('AndroidManifest.xml'))
first = {}
for tag, attrs in elements:
    first.setdefault(tag, attrs)
names = apk.namelist()
print(json.dumps({
    'package': first['manifest'].get('package'),
    'versionCode': first['manifest'].get('versionCode'),
    'versionName': first['manifest'].get('versionName'),
    'debuggable': first['application'].get('debuggable', False),
    'devClient': any(tag == 'activity' and 'devlauncher' in str(a.get('name', '')).lower()
                     for tag, a in elements),
    'bundledJs': 'assets/index.android.bundle' in names,
    'abis': sorted({n.split('/')[1] for n in names if n.startswith('lib/')}),
}, indent=2))
