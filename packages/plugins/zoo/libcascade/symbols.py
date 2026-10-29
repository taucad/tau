"""Regenerates the bindings list in libcascade-kcl.yml: every libcascade class, enum and constant the offline engine
calls, plus their base classes and the types in their signatures.

Usage: python3 libcascade/symbols.py  (from packages/plugins/zoo; reads the full libcascade API from the workspace's
node_modules, which the opencascade plugin still depends on)
"""
import os
import re
import sys

here = os.path.dirname(os.path.abspath(__file__))
package = os.path.dirname(here)
workspace = os.path.dirname(os.path.dirname(os.path.dirname(package)))
types_path = os.path.join(workspace, 'node_modules', 'libcascade', 'dist', 'types.d.ts')
yml_path = os.path.join(here, 'libcascade-kcl.yml')

# Reached through return values rather than `oc.<name>`, so the source scan cannot see them.
extras = {
    'BRepBuilderAPI_MakeShape', 'Poly_PolygonOnTriangulation', 'Poly_Triangulation', 'TopoDS_Edge', 'TopoDS_Face',
    'TopoDS_Shape', 'TopoDS_Shell', 'TopoDS_Solid', 'TopoDS_Vertex', 'TopoDS_Wire',
}
# Runtime members of the module object, not bindings.
runtime = {'FS', 'wasmMemory', 'TauOffline'}
# Nested enums the binder cannot emit.
unbindable = {'gp_Dir_D', 'gp_Dir2d_D'}

source = ''
for directory, _, files in os.walk(os.path.join(package, 'src', 'offline')):
    for name in files:
        if name.endswith('.ts') and not name.endswith(('.test.ts', '.d.ts')):
            source += open(os.path.join(directory, name)).read()
seeds = (set(re.findall(r'\boc\.([A-Za-z_][A-Za-z0-9_]*)', source)) | extras) - runtime

declarations = open(types_path).read()
pattern = re.compile(
    r'^declare (?:abstract )?(class|enum|namespace|const|type|interface) ([A-Za-z_][A-Za-z0-9_]*)'
    r'(?: extends ([A-Za-z_][A-Za-z0-9_]*))?',
    re.M,
)
kinds, bodies, parents = {}, {}, {}
matches = list(pattern.finditer(declarations))
for index, match in enumerate(matches):
    name = match.group(2)
    kinds[name] = match.group(1)
    end = matches[index + 1].start() if index + 1 < len(matches) else len(declarations)
    bodies[name] = re.sub(r'/\*\*.*?\*/', '', declarations[match.end():end], flags=re.S)
    if match.group(3):
        parents[name] = match.group(3)


def lineage(name):
    out = []
    while name in parents:
        name = parents[name]
        out.append(name)
    return out


symbols = set()
for seed in sorted(seeds):
    if seed not in kinds:
        sys.exit(f'unknown libcascade symbol: {seed}')
    symbols.add(seed)
    symbols.update(lineage(seed))
for name in list(symbols):
    for used in set(re.findall(r'\b[A-Za-z_][A-Za-z0-9_]*\b', bodies.get(name, ''))):
        if used != name and kinds.get(used) in ('class', 'enum', 'const'):
            symbols.add(used)
            symbols.update(lineage(used))
symbols -= unbindable

yml = open(yml_path).read()
listing = ''.join(f'    - symbol: {name}\n' for name in sorted(symbols))
yml, count = re.subn(r'(  bindings:\n)(?:    - symbol: .*\n)+', lambda m: m.group(1) + listing, yml)
if count != 1:
    sys.exit('bindings list not found in libcascade-kcl.yml')
open(yml_path, 'w').write(yml)
print(f'{len(symbols)} symbols')
