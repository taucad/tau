import json
import math
import re
from pathlib import Path

root = Path(__file__).resolve().parent
assembly = json.loads((root / 'assembly.json').read_text())
sysml = (root / 'turbofan.sysml').read_text()
parts = assembly['parts']
selectors = [part['id'] for part in parts]
assert len(selectors) == len(set(selectors)), 'Duplicate CAD selectors'
leaves = re.findall(r'part\s+(\w+)\s*:\s*ManufacturedPart\[(\d+)\]\s*\{([^}]+)\}', sysml)
declared = {}
for name, count, body in leaves:
    selector = re.search(r'cadSelector\s*=\s*"([^"]+)"', body).group(1)
    assert selector not in declared, selector
    declared[selector] = int(count)
    assert name == selector.split('/')[-1], selector
assert declared == {part['id']: part['count'] for part in parts}, 'SysML/CAD BOM mismatch'
assert sysml.count('{') == sysml.count('}'), 'Unbalanced SysML braces'
assert assembly['length'] == 3600 and assembly['diameter'] == 2000
assert sum(part['count'] for part in parts if part.get('motion') == 'lp') == 329, 'LP spool census changed'
assert sum(part['count'] for part in parts if part.get('motion') == 'hp') == 370, 'HP spool census changed'
assert all(part.get('motion') in (None, 'lp', 'hp') for part in parts), 'Unknown motion link'

for part in parts:
    assert isinstance(part['count'], int) and part['count'] > 0, part['id']
    assert re.fullmatch(r'[0-9a-f]{6}', part['color']), part['id']
    for value in part.values():
        if isinstance(value, (int, float)):
            assert math.isfinite(value), part['id']
    if part['kind'] == 'blade':
        assert part['naca'] in {'0012', '0018', '2410', '2412', '4412', '4415'}, part['id']
        assert part['tip'] > part['root'] > 0 and part['chord'] > 0, part['id']
        assert 0 < part['taper'] <= 1, part['id']
        body = next(body for _, _, body in leaves if f'"{part["id"]}"' in body)
        assert f'nacaSection = "{part["naca"]}"' in body, part['id']
    elif part['kind'] == 'ring':
        assert len(part['profile']) >= 4, part['id']
        assert all(len(point) == 2 and point[1] >= 0 for point in part['profile']), part['id']
    elif part['kind'] == 'box':
        assert min(part['sx'], part['sy'], part['sz']) > 2 * part.get('wall', 0), part['id']
    elif part['kind'] == 'perforated':
        assert part['axial'] * part['around'] == 160, part['id']
        assert 2 * part['hole'] < part['length'] / part['axial'], part['id']
    else:
        raise AssertionError(part['kind'])

for family, expected in [('booster', 3), ('compressor', 6), ('highTurbine', 1), ('lowTurbine', 3)]:
    rows = [part for part in parts if part['id'].startswith(family + '/stage') and part['id'].endswith('/rotorBlades')]
    assert len(rows) == expected, family
    for rotor in rows:
        prefix = rotor['id'].rsplit('/', 1)[0]
        assert {prefix + '/' + name for name in ['disk', 'rotorBlades', 'statorVanes', 'statorShroud', 'spacer', 'lockRing']} <= set(selectors)

print(f'PASS: {len(parts)} terminal part families, {sum(part["count"] for part in parts)} occurrences; SysML/CAD traceability, all rows, NACA assignments, two spool census and manifest dimensions.')
print('This audit checks the project SysML subset and traceability; it is not a SysML v2 language-server validation.')
