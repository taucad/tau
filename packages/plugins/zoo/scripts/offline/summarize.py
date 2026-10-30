"""Summarises offline sample results: status, volume and area against Zoo's physical properties."""
import json, os, sys

out = sys.argv[1]
rows = []
for name in sorted(os.listdir(out)):
    path = os.path.join(out, name, 'result.json')
    if not os.path.isfile(path):
        if name.endswith('.log'):
            continue
        rows.append({'name': name, 'ok': False, 'failure': 'no result'})
        continue
    rows.append(json.load(open(path)))

def ratio(r, key):
    m, e = (r.get('measured') or {}).get(key), (r.get('expected') or {}).get(key)
    if m is None or not e:
        return None
    return m / e

ok = [r for r in rows if r.get('ok')]
match = [r for r in ok if ratio(r, 'volume') is not None and abs(ratio(r, 'volume') - 1) < 0.01]
print(f"{len(ok)}/{len(rows)} produce a model; {len(match)} within 1% of Zoo's volume")
for r in rows:
    vr, ar = ratio(r, 'volume'), ratio(r, 'area')
    status = 'OK ' if r.get('ok') else 'ERR'
    flag = '' if vr is not None and abs(vr - 1) < 0.01 else ' <<'
    detail = (r.get('failure') or '; '.join(r.get('errors') or []))[:150].replace('\n', ' ')
    vs = f"{vr:7.3f}" if vr is not None else '   -   '
    as_ = f"{ar:7.3f}" if ar is not None else '   -   '
    print(f"{status} {r['name'][:36]:36} vol {vs} area {as_} {int(r.get('wallMs') or 0):6d}ms{flag if r.get('ok') else ''} {detail}")
