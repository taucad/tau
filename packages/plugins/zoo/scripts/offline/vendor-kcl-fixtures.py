#!/usr/bin/env python3
"""Vendors Zoo's KCL fixtures into the offline regression suite, and records the suite's baselines.

  vendor-kcl-fixtures.py stage <modeling-app> <fixturesDir>
      Copies every KCL sample, every kcl-lib simulation test that executes on Zoo's engine, and every runnable
      standard library doc example into <fixturesDir>, and writes manifest.json with Zoo's physical properties
      (the oracle) and the standard library functions each fixture calls.
  vendor-kcl-fixtures.py baseline <fixturesDir> <measurements.jsonl>
      Records what the offline engine builds for each fixture (from measure-kcl-fixtures.mts) as its baseline.

`fetch-samples.sh` checks out <modeling-app>. See the fixtures README for the whole loop.
"""
import glob
import json
import os
import re
import shutil
import sys

# Fixtures the suite cannot run, with why. A kcl-lib panic aborts the whole test worker, so these stay out.
EXCLUDED = {
    'simulation/import_foreign': 'foreign-format import panics kcl-lib under Node (no global timer object)',
    'simulation/import_glb': 'foreign-format import panics kcl-lib under Node (no global timer object)',
    'simulation/import_glb_no_assign': 'foreign-format import panics kcl-lib under Node (no global timer object)',
    'simulation/import_gltf_embedded': 'foreign-format import panics kcl-lib under Node (no global timer object)',
    'simulation/import_gltf_with_bin': 'foreign-format import panics kcl-lib under Node (no global timer object)',
    'simulation/import_mesh_clone': 'foreign-format import panics kcl-lib under Node (no global timer object)',
    'simulation/import_obj_with_mtl': 'foreign-format import panics kcl-lib under Node (no global timer object)',
    'simulation/import_obj_with_mtl_units': 'foreign-format import panics kcl-lib under Node (no global timer object)',
    'simulation/multiple-foreign-imports-all-render': 'foreign-format import panics kcl-lib under Node (no global timer object)',
    'simulation/named_views_hide_imported': 'foreign-format import panics kcl-lib under Node (no global timer object)',
    'simulation/import_transform': 'imports a 5.5 MB STL',
    'simulation/import_async': 'imports a 5.5 MB STL',
    'simulation/import_stl': 'imports a 5.5 MB STL',
    'simulation/nested_windows_main_kcl': 'imports a Windows-style backslash path, which the host filesystem rejects',
    **{
        f'examples/{example}': 'imports tests/inputs/cube.sldprt, a SolidWorks part only Zoo can convert'
        for example in (
            'prelude-clone-9', 'prelude-clone-11', 'solid-appearance-9', 'transform-hide-1', 'transform-rotate-3',
            'transform-scale-1', 'transform-translate-1', 'transform-translate-2',
        )
    },
}
# Inputs larger than this stay upstream; a fixture that needs one is excluded above.
MAX_INPUT_BYTES = 100_000


def std_functions(root):
    functions = {}
    for file in sorted(glob.glob(f'{root}/rust/kcl-lib/std/*.kcl')):
        module = os.path.basename(file)[:-4]
        for match in re.finditer(r'^export fn (\w+)\(', open(file).read(), re.M):
            functions.setdefault(match.group(1), []).append(module)
    return functions


def calls(directory, functions):
    names = set()
    for file in glob.glob(f'{directory}/**/*.kcl', recursive=True):
        text = re.sub(r'//.*', '', open(file).read())
        for match in re.finditer(r'\b((?:\w+::)*\w+)\s*\(', text):
            name = match.group(1).split('::')[-1]
            if name in functions:
                names.add(name)
    return sorted(names)


def physical_properties(directory):
    file = f'{directory}/physical_properties.snap'
    if not os.path.exists(file):
        return None
    text = open(file).read()
    data = json.loads(text[text.index('{'):])
    # Zoo weighs at 1000 kg/m³, so grams × 1000 is mm³.
    return {'volume': data['weight']['value'] * 1000, 'area': data['surface_area']['value']}


def localize_imports(source, destination):
    """Copies small files imported from outside the fixture into its `inputs/`, and points the imports there."""
    for file in glob.glob(f'{destination}/**/*.kcl', recursive=True):
        text = open(file).read()
        relative_dir = os.path.relpath(os.path.dirname(file), destination)

        def localize(match):
            target = os.path.normpath(os.path.join(source, relative_dir, match.group(1)))
            if not os.path.exists(target) or os.path.getsize(target) > MAX_INPUT_BYTES:
                return match.group(0)
            os.makedirs(f'{destination}/inputs', exist_ok=True)
            for sibling in glob.glob(os.path.splitext(target)[0] + '.*'):
                if os.path.getsize(sibling) <= MAX_INPUT_BYTES and not sibling.endswith('.kcl'):
                    shutil.copy(sibling, f'{destination}/inputs/')
            local = os.path.relpath(f'{destination}/inputs/{os.path.basename(target)}', os.path.dirname(file))
            return f'import "{local}"'

        localized = re.sub(r'import "(\.\./[^"]*)"', localize, text)
        if localized != text:
            open(file, 'w').write(localized)


def pin_version(file, version):
    """Pins the KCL version the way kcl-lib's simulation runner does, so the fixture runs as Zoo ran it."""
    literal = f'"{version}"' if '-' in version else version
    text = open(file).read()
    pattern = r'kclVersion\s*=\s*("[^"]*"|[\d.]+)'
    if re.search(pattern, text):
        text = re.sub(pattern, f'kclVersion = {literal}', text, count=1)
    elif '@settings(' in text:
        text = text.replace('@settings(', f'@settings(kclVersion = {literal}, ', 1)
    else:
        text = f'@settings(kclVersion = {literal})\n' + text
    open(file, 'w').write(text)


def simulation_output(test_dir):
    """The run of a simulation test that succeeded on Zoo's engine, preferring one with physical properties."""
    config = open(f'{test_dir}/config.toml').read() if os.path.exists(f'{test_dir}/config.toml') else ''
    match = re.search(r'kcl_versions\s*=\s*\[([^\]]*)\]', config)
    versions = re.findall(r'"([^"]+)"', match.group(1)) if match else []
    runs = [(None, test_dir)] if os.path.exists(f'{test_dir}/execution_success.snap') else []
    for version in sorted(versions, key=lambda v: {'2': 0, '1': 1}.get(v[0], 2)):
        output = f'{test_dir}/output/kcl-{version.removesuffix("-preview")}'
        if os.path.exists(f'{output}/execution_success.snap'):
            runs.append((version, output))
    with_properties = [run for run in runs if os.path.exists(f'{run[1]}/physical_properties.snap')]
    return (with_properties or runs or [None])[0]


def doc_examples(root):
    """Yields (module, function, index, source, norun) for each KCL doc example; kcl-lib's doc tests skip norun ones."""
    for file in sorted(glob.glob(f'{root}/rust/kcl-lib/std/*.kcl')):
        module = os.path.basename(file)[:-4]
        doc = []
        for line in open(file):
            stripped = line.strip()
            if stripped.startswith('///'):
                doc.append(stripped[4:] if stripped.startswith('/// ') else stripped[3:])
                continue
            match = re.match(r'export fn (\w+)\(', stripped)
            if match:
                blocks, current = [], None
                for entry in doc:
                    if entry.startswith('```'):
                        if current is None:
                            current = ([a.strip() for a in entry[3:].split(',')], [])
                        else:
                            blocks.append(current)
                            current = None
                    elif current is not None:
                        current[1].append(entry)
                for index, (attributes, lines) in enumerate(blocks):
                    if 'kcl' in attributes and 'inline' not in attributes:
                        norun = bool({'norun', 'no_run'} & set(attributes))
                        yield module, match.group(1), index, '\n'.join(lines) + '\n', norun
            if not stripped.startswith('@('):
                doc = []


def stage(root, fixtures):
    functions = std_functions(root)
    for group in ('samples', 'simulation', 'examples'):
        shutil.rmtree(f'{fixtures}/{group}', ignore_errors=True)
    entries, excluded = [], []
    ignore = shutil.ignore_patterns('*.snap', '*.png', '*.md', 'output', 'config.toml')

    def add(path, source, upstream, version, oracle):
        if path in EXCLUDED:
            shutil.rmtree(f'{fixtures}/{path}')
            excluded.append({'path': path, 'reason': EXCLUDED[path]})
            return
        entry = {'path': path, 'upstream': upstream, 'functions': calls(f'{fixtures}/{path}', functions)}
        if version:
            entry['kclVersion'] = version
        if oracle:
            entry['zoo'] = oracle
        entries.append(entry)

    samples = f'{root}/public/kcl-samples'
    for name in sorted(os.listdir(samples)):
        if not os.path.isdir(f'{samples}/{name}') or name == 'screenshots':
            continue
        shutil.copytree(f'{samples}/{name}', f'{fixtures}/samples/{name}', ignore=ignore)
        oracle = physical_properties(f'{root}/rust/kcl-lib/tests/kcl_samples/{name}')
        add(f'samples/{name}', 'sample', f'public/kcl-samples/{name}', None, oracle)

    tests = f'{root}/rust/kcl-lib/tests'
    for name in sorted(os.listdir(tests)):
        if name == 'kcl_samples' or not os.path.exists(f'{tests}/{name}/input.kcl'):
            continue
        run = simulation_output(f'{tests}/{name}')
        if run is None:
            continue
        version, output = run
        destination = f'{fixtures}/simulation/{name}'
        shutil.copytree(f'{tests}/{name}', destination, ignore=ignore)
        os.rename(f'{destination}/input.kcl', f'{destination}/main.kcl')
        localize_imports(f'{tests}/{name}', destination)
        if version:
            pin_version(f'{destination}/main.kcl', version)
        add(f'simulation/{name}', 'simulation', f'rust/kcl-lib/tests/{name}', version, physical_properties(output))

    for module, function, index, source, norun in doc_examples(root):
        path = f'examples/{module}-{function}-{index}'
        os.makedirs(f'{fixtures}/{path}')
        open(f'{fixtures}/{path}/main.kcl', 'w').write(source)
        add(path, 'example', f'rust/kcl-lib/std/{module}.kcl#{function}', None, None)
        entries[-1]['functions'] = sorted(set(entries[-1]['functions']) | {function})
        if norun:
            # Zoo's doc tests never run these, so a failure may be the example's, not the engine's.
            entries[-1]['norun'] = True

    # Tau's own fixtures, under tau/, cover what no Zoo fixture calls; stage keeps them.
    for name in sorted(os.listdir(f'{fixtures}/tau')) if os.path.isdir(f'{fixtures}/tau') else []:
        add(f'tau/{name}', 'tau', None, None, None)
        del entries[-1]['upstream']

    previous = load(fixtures)
    for entry in entries:
        if entry['path'] in previous and 'offline' in previous[entry['path']]:
            entry['offline'] = previous[entry['path']]['offline']
    covered = {name for entry in entries for name in entry['functions']}
    manifest = {
        'upstream': {'repository': 'https://github.com/KittyCAD/modeling-app', 'commit': git_head(root)},
        'functions': {name: modules for name, modules in sorted(functions.items())},
        'uncovered': sorted(set(functions) - covered),
        'excluded': excluded,
        'fixtures': entries,
    }
    write(fixtures, manifest)
    print(f'{len(entries)} fixtures, {len(excluded)} excluded, {len(manifest["uncovered"])} functions uncovered')


def git_head(root):
    head = open(f'{root}/.git/HEAD').read().strip()
    if head.startswith('ref: '):
        return open(f'{root}/.git/{head[5:]}').read().strip()
    return head


def load(fixtures):
    file = f'{fixtures}/manifest.json'
    if not os.path.exists(file):
        return {}
    return {entry['path']: entry for entry in json.load(open(file))['fixtures']}


def write(fixtures, manifest):
    with open(f'{fixtures}/manifest.json', 'w') as file:
        json.dump(manifest, file, indent=2)
        file.write('\n')


def significant(value):
    return float(f'{value:.10g}')


def baseline(fixtures, measurements):
    manifest = json.load(open(f'{fixtures}/manifest.json'))
    measured = {}
    for line in open(measurements):
        result = json.loads(line)
        measured[result['id']] = result
    for entry in manifest['fixtures']:
        result = measured.get(entry['path'])
        if result is None:
            continue
        if 'gap' in result:
            entry['offline'] = {'gap': result['gap']}
        else:
            entry['offline'] = {
                'solids': result['solids'],
                'volume': significant(result['volume']),
                'area': significant(result['area']),
            }
    write(fixtures, manifest)


if __name__ == '__main__':
    command, *arguments = sys.argv[1:]
    {'stage': stage, 'baseline': baseline}[command](*arguments)
