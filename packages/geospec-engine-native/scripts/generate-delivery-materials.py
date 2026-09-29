#!/usr/bin/env python3
"""Generate native license/component material and a source-relink asset.

Python 3.12+, Git, Xcode tools, Node/pnpm/NAPI and the pinned Rust 1.88
toolchain are prerequisites. Python material generation additionally requires
the prepared CPython/maturin environments.
Usage: generate-delivery-materials.py --cohort node|python --output PATH
       (--relink-output PATH | --relink-reference PATH)
       --relink-archive PATH
Optional env: GEOSPEC_DELIVERY_CACHE, GEOSPEC_OCCT_PREFIX.
Node material requires GEOSPEC_MIXED_RECEIPT, GEOSPEC_MIXED_COMMANDS and
GEOSPEC_MIXED_INPUTS selecting the actual successful mixed build and closure.
New source kits require GEOSPEC_PRODUCER_RECEIPT (the selected producer's
identity-source-proof.json); its observations remain attributed to that run.
The command reads prepared sources and an existing prefix. It does not build,
install, download, execute a product binary, or publish.
Exit: 0 success; 1 invalid/missing input or generation failure; 2 bad arguments.
"""

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tomllib
import zlib


PACKAGE = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DELIVERY_CACHE = ROOT / 'node_modules/.cache/geospec-engine-native/delivery-wasm-eh'
DEFAULT_OCCT_PREFIX = ROOT / 'node_modules/.cache/geospec-engine-native/occt/install'
TARGET = 'aarch64-apple-darwin'
RUST_TOOLCHAIN = '1.88'
SOURCE_RELINK_ASSET = 'geospec-engine-native-source-relink.tar.gz'
SOURCE_RELINK_ROOT = 'geospec-engine-native-source-relink'
Q7_BUDGETS = {
    'rootPlusDarwinPlatformMaxBytes': 33_554_432,
    'eachWheelMaxBytes': 25_165_824,
    'installedClosureMaxLogicalBytes': 134_217_728,
    'installedClosureMaxAllocatedBytes': 134_217_728,
}
LICENSE_TEXT = re.compile(r'^(?:licen[cs]e|copying|unlicense)(?:[._-].*)?$', re.IGNORECASE)
NOTICE = re.compile(r'^notice(?:[._-].*)?$', re.IGNORECASE)
SKIPPED_SOURCE_PARTS = {
    '.git', '.pytest_cache', '__pycache__', 'dist', 'generated', 'licenses',
    'node_modules', 'target',
}


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    return json.loads(Path(path).read_text())


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + '\n')


def identity(records):
    encoded = json.dumps(records, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(encoded).hexdigest()


def new_directory(path):
    require(not path.exists(), f'Refusing to replace existing output: {path}')
    path.mkdir(parents=True)


def run(command):
    environment = os.environ.copy()
    environment['CARGO_NET_OFFLINE'] = 'true'
    return subprocess.check_output(command, cwd=ROOT, env=environment, text=True)


def selected_executable(name):
    found = shutil.which(name)
    require(found is not None, f'Missing required executable: {name}')
    return Path(found).resolve()


def executable_identity(path, version_arguments=()):
    path = Path(path).resolve()
    require(path.is_file(), f'Missing selected executable: {path}')
    result = {'path': str(path), 'sha256': digest(path)}
    if version_arguments:
        result['version'] = run([str(path), *version_arguments]).strip()
    return result


def cargo_metadata(cohort, mixed=None):
    if mixed is not None:
        closure = mixed['closure']
        command = [closure['cargo'], 'metadata', '--format-version', '1',
                   '--locked', '--offline', '--filter-platform', 'wasm32-unknown-emscripten',
                   '--manifest-path', str(PACKAGE / 'bindings/emscripten/Cargo.toml')]
        return json.loads(subprocess.check_output(
            command, cwd=ROOT, env=mixed_environment(closure), text=True,
        ))
    manifest = PACKAGE / f'bindings/{cohort}/Cargo.toml'
    output = run([
        str(selected_executable('rustup')), 'run', RUST_TOOLCHAIN, 'cargo', 'metadata',
        '--format-version', '1', '--locked', '--offline',
        '--filter-platform', TARGET, '--manifest-path', str(manifest),
    ])
    return json.loads(output)


def resolved_packages(metadata):
    root = metadata['resolve']['root']
    require(root, 'Cargo metadata omitted the root package')
    nodes = {item['id']: item for item in metadata['resolve']['nodes']}
    packages = {item['id']: item for item in metadata['packages']}
    reachable = set()
    pending = [root]
    while pending:
        package_id = pending.pop()
        if package_id in reachable:
            continue
        reachable.add(package_id)
        require(package_id in nodes, f'Cargo metadata omitted resolve node: {package_id}')
        pending.extend(item['pkg'] for item in nodes[package_id]['deps'])
    return sorted(
        ((packages[package_id], nodes[package_id]) for package_id in reachable),
        key=lambda value: (value[0]['name'], value[0]['version']),
    )


def walk_files(root):
    return sorted(path for path in Path(root).rglob('*') if path.is_file())


def directory_identity(root):
    records = []
    for path in walk_files(root):
        relative = path.relative_to(root)
        if any(part in SKIPPED_SOURCE_PARTS for part in relative.parts):
            continue
        if path.suffix in {'.pyc', '.pyo'}:
            continue
        records.append({
            'path': relative.as_posix(),
            'sha256': digest(path),
            'bytes': path.stat().st_size,
        })
    return {'files': len(records), 'sha256': identity(records)}


def copy_license_file(source, output, copied):
    source = Path(source)
    source_hash = digest(source)
    key = f'{source_hash}-{source.name}'
    if key not in copied:
        destination = output / 'cargo' / key
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        copied[key] = destination.relative_to(output).as_posix()
    return copied[key]


def fallback_license(expression, output, copied):
    paths = []
    if 'Apache-2.0' in expression:
        paths.append(copy_license_file(PACKAGE / 'LICENSE', output, copied))
    if 'MIT' in expression:
        path = output / 'fallback/MIT.txt'
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                'MIT License\n\n'
                'Copyright (c) the component authors listed in ../components.json\n\n'
                'Permission is hereby granted, free of charge, to any person obtaining a copy\n'
                'of this software and associated documentation files (the "Software"), to deal\n'
                'in the Software without restriction, including without limitation the rights\n'
                'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n'
                'copies of the Software, and to permit persons to whom the Software is\n'
                'furnished to do so, subject to the following conditions:\n\n'
                'The above copyright notice and this permission notice shall be included in all\n'
                'copies or substantial portions of the Software.\n\n'
                'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n'
                'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n'
                'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n'
                'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n'
                'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n'
                'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n'
                'SOFTWARE.\n'
            )
        paths.append(path.relative_to(output).as_posix())
    require(paths, f'No license material for expression: {expression}')
    return sorted(set(paths))


def cargo_components(cohort, output, metadata=None):
    if metadata is None:
        metadata = cargo_metadata(cohort)
    root_id = metadata['resolve']['root']
    root_package = next(item for item in metadata['packages'] if item['id'] == root_id)
    copied = {}
    components = []
    for item, node in resolved_packages(metadata):
        expression = item.get('license')
        require(expression, f"Missing declared license: {item['name']}@{item['version']}")
        source_root = Path(item['manifest_path']).parent
        supplied = sorted(
            path for path in source_root.iterdir()
            if path.is_file() and (LICENSE_TEXT.match(path.name) or NOTICE.match(path.name))
        )
        license_files = [copy_license_file(path, output, copied) for path in supplied]
        has_license_text = any(LICENSE_TEXT.match(path.name) for path in supplied)
        if not has_license_text:
            license_files.extend(fallback_license(expression, output, copied))
        checksum_path = source_root / '.cargo-checksum.json'
        source_identity = (
            {'type': 'cargo-package', 'sha256': read_json(checksum_path)['package']}
            if checksum_path.exists()
            else {'type': 'local-source-tree', **directory_identity(source_root)}
        )
        components.append({
            'name': item['name'],
            'version': item['version'],
            'cohort': cohort,
            'declaredLicense': expression,
            'authors': item['authors'],
            'repository': item.get('repository'),
            'source': item.get('source'),
            'sourceIdentity': source_identity,
            'features': sorted(node['features']),
            'licenseFiles': sorted(set(license_files)),
            'usedFallbackLicenseText': not has_license_text,
        })
    return components, f"{root_package['name']}@{root_package['version']}"


def copy_external_licenses(cohort, output, delivery_cache):
    copies = [
        ('GeoSpec-LICENSE.txt', PACKAGE / 'LICENSE'),
        ('Manifold-Rust-LICENSE.txt', PACKAGE / 'native/manifold-rust/source/LICENSE'),
        ('OCCT-LGPL-2.1.txt', PACKAGE / 'native/occt/LICENSE_LGPL_21.txt'),
        ('OCCT-LGPL-exception.txt', PACKAGE / 'native/occt/OCCT_LGPL_EXCEPTION.txt'),
        ('NOTICE.txt', PACKAGE / 'NOTICE'),
    ]
    if cohort == 'node':
        copies.extend([
            ('RapidJSON-LICENSE.txt', delivery_cache / 'sources/rapidjson/license.txt'),
            ('FreeType-FTL.txt', delivery_cache / 'sources/freetype/docs/FTL.TXT'),
        ])
    records = []
    for name, source in copies:
        require(source.exists(), f'Missing license input: {source}')
        shutil.copyfile(source, output / name)
        records.append({'path': name, 'sha256': digest(source), 'bytes': source.stat().st_size})
    return records


def external_components(cohort, mixed=None):
    occt = read_json(PACKAGE / 'native/occt/source-manifest.json')
    manifold = read_json(PACKAGE / 'native/manifold-rust/source-manifest.json')
    components = [
        {
            'name': 'Open CASCADE Technology',
            'version': occt['commit'],
            'cohorts': [cohort, 'current-mixed'] if mixed else [cohort],
            'declaredLicense': 'LGPL-2.1-only WITH OCCT-exception-1.0',
            'source': occt['archiveUrl'],
            'sourceSha256': occt['archiveSha256'],
            'licenseFiles': ['OCCT-LGPL-2.1.txt', 'OCCT-LGPL-exception.txt'],
        },
        {
            'name': 'manifold-rust',
            'version': manifold['commit'],
            'cohorts': [cohort, 'current-mixed'] if mixed else [cohort],
            'declaredLicense': manifold['license'],
            'source': manifold['upstream'],
            'sourceSha256': manifold['archiveSha256'],
            'licenseFiles': ['Manifold-Rust-LICENSE.txt'],
        },
        {
            'name': 'V8 FastMathHypot adaptation',
            'version': 'Node-v24.10.0-9b72b88f4c4565687e3a8c4d8e1232f63a501e15',
            'cohorts': [cohort, 'current-mixed'] if mixed else [cohort],
            'declaredLicense': 'BSD-3-Clause',
            'source': 'https://github.com/nodejs/node/blob/'
                      '9b72b88f4c4565687e3a8c4d8e1232f63a501e15/'
                      'deps/v8/src/builtins/math.tq',
            'licenseFiles': ['NOTICE.txt'],
        },
    ]
    if mixed is not None:
        selected = read_json(PACKAGE / 'scripts/selected-delivery.json')
        for name, license_name, key in [
            ('RapidJSON', 'RapidJSON-LICENSE.txt', 'rapidjson'),
            ('FreeType', 'FreeType-FTL.txt', 'freetype'),
        ]:
            item = selected['headers'][key]
            components.append({
                'name': name,
                'version': item['commit'],
                'cohorts': ['current-mixed'],
                'declaredLicense': 'MIT' if key == 'rapidjson' else 'FTL',
                'source': item['url'],
                'sourceSha256': item['sha256'],
                'licenseFiles': [license_name],
            })
    return components


def write_notices(output, components, external):
    lines = [
        'THIRD-PARTY COMPONENT ATTRIBUTIONS', '',
        'This inventory reports declared licenses and the exact license/notice bytes',
        'collected from the selected offline dependency closure. A fallback standard',
        'text is identified when a published Cargo package omitted its license file.',
        'This inventory is technical provenance and is not legal certification.', '',
    ]
    for component in sorted(components + external, key=lambda item: (item['name'], item['version'])):
        lines.append(f"{component['name']} {component['version']}")
        lines.append(f"  declared license: {component['declaredLicense']}")
        if component.get('authors'):
            lines.append(f"  authors: {'; '.join(component['authors'])}")
        if component.get('repository'):
            lines.append(f"  repository: {component['repository']}")
        if component.get('source'):
            lines.append(f"  source: {component['source']}")
        lines.append(f"  license files: {', '.join(component['licenseFiles'])}")
        lines.append(f"  cohort: {component.get('cohort') or ', '.join(component['cohorts'])}")
        if component.get('toolNoticesInAdjacentSourceKit'):
            lines.append('  build-tool notices: required adjacent source kit; exact paths/hashes in components.json')
        if component.get('usedFallbackLicenseText'):
            lines.append('  note: published Cargo package omitted a license file; fallback text is marked')
        lines.append('')
    (output / 'THIRD-PARTY-NOTICES.txt').write_text('\n'.join(lines) + '\n')


def source_files():
    roots = [
        'packages/geospec-engine-native/LICENSE',
        'packages/geospec-engine-native/NOTICE',
        'packages/geospec-engine-native/README.md',
        'packages/geospec-engine-native/package.json',
        'packages/geospec-engine-native/project.json',
        'packages/geospec-engine-native/rust',
        'packages/geospec-engine-native/native',
        'packages/geospec-engine-native/bindings/node',
        'packages/geospec-engine-native/bindings/python',
        'packages/geospec-engine-native/bindings/emscripten',
        'packages/geospec-engine-native/scripts',
        '.cargo', 'Cargo.lock', 'Cargo.toml', 'LICENSE', 'package.json',
        'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'rust-toolchain.toml',
    ]
    listed = run([
        str(selected_executable('git')),
        'ls-files', '--cached', '--others', '--exclude-standard', '--', *roots,
    ])
    result = []
    for value in listed.splitlines():
        path = Path(value)
        if any(part in SKIPPED_SOURCE_PARTS for part in path.parts):
            continue
        if path.suffix in {'.node', '.pyc', '.pyo', '.so', '.whl'}:
            continue
        result.append(path)
    return sorted(result)


def parse_cmake_cache(path):
    keys = {
        'BUILD_ADDITIONAL_TOOLKITS', 'BUILD_LIBRARY_TYPE', 'BUILD_OPT_PROFILE',
        'BUILD_RELEASE_DISABLE_EXCEPTIONS', 'BUILD_USE_PCH', 'CMAKE_BUILD_TYPE',
        'CMAKE_CXX_COMPILER', 'CMAKE_CXX_FLAGS', 'CMAKE_CXX_FLAGS_RELEASE',
        'CMAKE_C_COMPILER', 'CMAKE_C_FLAGS', 'CMAKE_C_FLAGS_RELEASE',
        'CMAKE_OSX_DEPLOYMENT_TARGET',
        'USE_FREETYPE', 'USE_GIT_HASH', 'USE_MMGR_TYPE', 'USE_TBB', 'USE_TCL', 'USE_XLIB',
    }
    selected = {}
    for line in Path(path).read_text().splitlines():
        match = re.match(r'^([^#/:]+):[^=]+=(.*)$', line)
        if match and match.group(1) in keys:
            selected[match.group(1)] = match.group(2)
    require(selected.get('CMAKE_BUILD_TYPE') == 'Release', 'OCCT prefix is not Release')
    require(selected.get('BUILD_LIBRARY_TYPE') == 'Static', 'OCCT prefix is not static')
    # GeoSpec semantics rely on these; the recipe pins them instead of trusting OCCT defaults.
    for key, value in [('USE_MMGR_TYPE', 'NATIVE'), ('BUILD_RELEASE_DISABLE_EXCEPTIONS', 'ON'),
                       ('BUILD_OPT_PROFILE', 'Default'), ('BUILD_USE_PCH', 'OFF'), ('USE_TBB', 'OFF')]:
        require(selected.get(key) == value, f'OCCT prefix needs {key}={value}')
    return selected


def napi_wrapper_inputs():
    """Project the selected registry-only NAPI closure into an isolated pnpm lock."""
    package = (PACKAGE / 'node_modules/@napi-rs/cli').resolve()
    manifest = read_json(package / 'package.json')
    require(manifest['bin']['napi'] == './dist/cli.js', 'NAPI entry point needs a reviewed route update')
    node = selected_executable('node')
    # Reuse the selected CLI's existing YAML dependency; do not import the CLI.
    parsed = json.loads(run([str(node), '--input-type=commonjs', '-e', '''
const fs = require('node:fs');
const { createRequire } = require('node:module');
const localRequire = createRequire(process.argv[1]);
const parser = localRequire.resolve('js-yaml');
process.stdout.write(JSON.stringify({
  lock: localRequire('js-yaml').load(fs.readFileSync(process.argv[2], 'utf8')),
  parser,
}));
''', str(package / 'package.json'), str(ROOT / 'pnpm-lock.yaml')]))
    lock = parsed['lock']
    require(str(lock['lockfileVersion']) == '9.0', 'Expected selected pnpm lock v9')
    selected = lock['importers']['packages/geospec-engine-native']['devDependencies']['@napi-rs/cli']
    version = selected['version'].split('(', 1)[0]
    require(manifest['version'] == version, 'Installed NAPI implementation differs from the lock')
    pending = [f'@napi-rs/cli@{selected["version"]}']
    snapshots, packages = {}, {}
    while pending:
        key = pending.pop()
        if key in snapshots:
            continue
        require('patch_hash=' not in key, 'NAPI closure now needs a separately reviewed patch input')
        snapshot = lock['snapshots'][key]
        package_key = key.split('(', 1)[0]
        package_record = lock['packages'][package_key]
        require(package_record['resolution'].get('integrity'), f'Unpinned registry input: {key}')
        snapshots[key] = snapshot
        packages[package_key] = package_record
        for name, resolved in {
            **snapshot.get('dependencies', {}), **snapshot.get('optionalDependencies', {}),
        }.items():
            pending.append(f'{name}@{resolved}')
    wrapper_manifest = {
        'name': 'geospec-native-reconstruction-wrapper', 'private': True,
        'packageManager': read_json(ROOT / 'package.json')['packageManager'],
        'dependencies': {'@napi-rs/cli': version},
    }
    wrapper_lock = {
        'lockfileVersion': lock['lockfileVersion'], 'settings': lock['settings'],
        'importers': {'.': {'dependencies': {'@napi-rs/cli': {
            'specifier': version, 'version': selected['version'],
        }}}},
        'packages': dict(sorted(packages.items())),
        'snapshots': dict(sorted(snapshots.items())),
    }
    return wrapper_manifest, wrapper_lock, {
        'selectedVersion': version,
        'resolvedPackage': str(package),
        'packageManifestSha256': digest(package / 'package.json'),
        'implementation': executable_identity(package / manifest['bin']['napi']),
        'sourceLockSha256': digest(ROOT / 'pnpm-lock.yaml'),
        'lockProjectionParser': executable_identity(parsed['parser']),
        'registryPackages': len(packages),
        'dependencySnapshots': len(snapshots),
        'isolatedManifest': 'wrapper/package.json',
        'isolatedLock': 'wrapper/pnpm-lock.yaml',
    }


def python_license_material(output, delivery_cache):
    """Build kit material from the locked Python closure, without a prior kit."""
    new_directory(output)
    external_files = copy_external_licenses('python', output, delivery_cache)
    components, cargo_root = cargo_components('python', output)
    external = external_components('python')
    write_notices(output, components, external)
    return {
        'cohort': 'python', 'cargoRoot': cargo_root, 'cargoComponents': components,
        'externalComponents': external, 'externalLicenseFiles': external_files,
        'files': [{'path': path.relative_to(output).as_posix(),
                   'sha256': digest(path), 'bytes': path.stat().st_size}
                  for path in walk_files(output)],
    }


def native_producer_recipe(napi_identity, cohort):
    require(cohort in ('node', 'python'), f'Unsupported native cohort: {cohort}')
    deployment_target = read_json(PACKAGE / 'scripts/selected-delivery.json')['macosDeploymentTarget']
    project = read_json(PACKAGE / 'project.json')
    workspace = (ROOT / 'pnpm-workspace.yaml').read_text()
    napi_match = re.search(r"^\s*'@napi-rs/cli':\s*([^\s#]+)\s*$", workspace, re.MULTILINE)
    require(napi_match is not None, 'Missing selected @napi-rs/cli catalog version')
    napi_version = napi_match.group(1)
    require(napi_identity['selectedVersion'] == napi_version, 'NAPI catalog and wrapper lock differ')
    require(
        f"'@napi-rs/cli@{napi_version}'" in (ROOT / 'pnpm-lock.yaml').read_text(),
        'Selected @napi-rs/cli version is absent from pnpm-lock.yaml',
    )
    python_project = tomllib.loads((PACKAGE / 'bindings/python/pyproject.toml').read_text())
    build_requirements = python_project['build-system']['requires']
    require(
        len(build_requirements) == 1 and build_requirements[0].startswith('maturin=='),
        'Python wrapper must select one exact maturin version',
    )
    maturin_version = build_requirements[0].split('==', 1)[1]

    rustup = selected_executable('rustup')
    rustc = Path(run([str(rustup), 'which', '--toolchain', RUST_TOOLCHAIN, 'rustc']).strip()).resolve()
    cargo = Path(run([str(rustup), 'which', '--toolchain', RUST_TOOLCHAIN, 'cargo']).strip()).resolve()
    xcrun = selected_executable('xcrun')
    clang = Path(run([str(xcrun), '--find', 'clang']).strip()).resolve()
    clangxx = Path(run([str(xcrun), '--find', 'clang++']).strip()).resolve()
    linker = Path(run([str(xcrun), '--find', 'ld']).strip()).resolve()
    sdk = run([str(xcrun), '--sdk', 'macosx', '--show-sdk-path']).strip()
    sdk_version = run([str(xcrun), '--sdk', 'macosx', '--show-sdk-version']).strip()
    node = selected_executable('node')
    pnpm = selected_executable('pnpm')
    python_observations = {}
    if cohort == 'python':
        for name, cache_name, version in [
            ('python313', 'python-venv', '3.13'),
            ('python314', 'python314-venv', '3.14'),
        ]:
            environment = ROOT / 'node_modules/.cache/geospec-engine-native' / cache_name / 'bin'
            interpreter = (environment / 'python').resolve()
            maturin = (environment / 'maturin').resolve()
            python_observations[name] = {
                'requiredPythonSeries': version,
                'interpreter': executable_identity(interpreter, ['--version']),
                'maturin': {
                    **executable_identity(maturin, ['--version']),
                    'selectedVersion': maturin_version,
                },
            }

    source_routes = {
        'node': project['targets']['build-node']['options']['commands'],
        'python313': project['targets']['build-python']['options']['command'],
        'python314': project['targets']['build-python314']['options']['command'],
    }
    standalone_routes = {
        'node': f'''(cd "$GEOSPEC_SOURCE_ROOT/packages/geospec-engine-native" && \\
  MACOSX_DEPLOYMENT_TARGET={shlex.quote(deployment_target)} \\
  GEOSPEC_OCCT_PREFIX="$GEOSPEC_OCCT_PREFIX" \\
  GEOSPEC_PRODUCER_ROUTE=nx-build-node-release-v1 \\
  GEOSPEC_PRODUCER_CARGO_CWD="$PWD" \\
  GEOSPEC_PRODUCER_MANIFEST="$PWD/bindings/node/Cargo.toml" \\
  RUSTFLAGS="--remap-path-prefix=$(cd "$GEOSPEC_SOURCE_ROOT" && pwd -P)=tau --remap-path-prefix=${{CARGO_HOME:-$HOME/.cargo}}=cargo" \\
  "$GEOSPEC_RUSTUP" run 1.88 "$GEOSPEC_NODE" \\
  "$GEOSPEC_WRAPPER_ROOT/node_modules/@napi-rs/cli/dist/cli.js" build \\
  --manifest-path bindings/node/Cargo.toml --target aarch64-apple-darwin \\
  --release --esm --platform --js index.js --dts index.d.ts \\
  --output-dir bindings/node/generated --target-dir "$GEOSPEC_BUILD_ROOT/node-target" \\
  -- --locked && \\
  test -s bindings/node/generated/index.js && \\
  test -s bindings/node/generated/index.d.ts && \\
  test -s bindings/node/generated/geospec-engine-native.darwin-arm64.node && \\
  strip -x bindings/node/generated/geospec-engine-native.darwin-arm64.node)''',
        'python313': f'''(cd "$GEOSPEC_SOURCE_ROOT" && \\
  MACOSX_DEPLOYMENT_TARGET={shlex.quote(deployment_target)} \\
  GEOSPEC_OCCT_PREFIX="$GEOSPEC_OCCT_PREFIX" \\
  GEOSPEC_PRODUCER_ROUTE=nx-build-python-release-v1 \\
  GEOSPEC_PRODUCER_CARGO_CWD="$PWD" \\
  GEOSPEC_PRODUCER_MANIFEST="$PWD/packages/geospec-engine-native/bindings/python/Cargo.toml" \\
  RUSTFLAGS="--remap-path-prefix=$(pwd -P)=tau --remap-path-prefix=${{CARGO_HOME:-$HOME/.cargo}}=cargo" \\
  "$GEOSPEC_RUSTUP" run 1.88 "$GEOSPEC_MATURIN313" build \\
  --manifest-path packages/geospec-engine-native/bindings/python/Cargo.toml \\
  --interpreter "$GEOSPEC_PYTHON313" --out "$GEOSPEC_BUILD_ROOT/python313-wheels" \\
  --target-dir "$GEOSPEC_BUILD_ROOT/python313-target" --release --locked --strip)''',
        'python314': f'''(cd "$GEOSPEC_SOURCE_ROOT" && \\
  MACOSX_DEPLOYMENT_TARGET={shlex.quote(deployment_target)} \\
  GEOSPEC_OCCT_PREFIX="$GEOSPEC_OCCT_PREFIX" \\
  GEOSPEC_PRODUCER_ROUTE=nx-build-python314-release-v1 \\
  GEOSPEC_PRODUCER_CARGO_CWD="$PWD" \\
  GEOSPEC_PRODUCER_MANIFEST="$PWD/packages/geospec-engine-native/bindings/python/Cargo.toml" \\
  RUSTFLAGS="--remap-path-prefix=$(pwd -P)=tau --remap-path-prefix=${{CARGO_HOME:-$HOME/.cargo}}=cargo" \\
  "$GEOSPEC_RUSTUP" run 1.88 "$GEOSPEC_MATURIN314" build \\
  --manifest-path packages/geospec-engine-native/bindings/python/Cargo.toml \\
  --interpreter "$GEOSPEC_PYTHON314" --out "$GEOSPEC_BUILD_ROOT/python314-wheels" \\
  --target-dir "$GEOSPEC_BUILD_ROOT/python314-target" --release --locked --strip)''',
    }
    archive_python = Path(sys.executable).resolve()
    git = selected_executable('git')
    return {
        'schema': 'geospec-native-producer-reconstruction-v2',
        'claim': (
            'content-addressed source and host-local selected reconstruction recipe; '
            'not a byte-identical cross-host or future-build observation'
        ),
        'target': TARGET,
        'environment': {'MACOSX_DEPLOYMENT_TARGET': deployment_target},
        'profile': {
            'cargo': 'release',
            'PROFILE': 'release',
            'OPT_LEVEL': '3',
            'DEBUG': 'false',
            'requiredCargoFlags': ['--release', '--locked'],
            'supportedCargoProfileOverrides': [],
        },
        'sourceSelectedRoutes': source_routes,
        'prepareBeforeBuilds': '''# Absolute paths; fresh wrapper/build roots outside the source workspace.
export PATH="$(dirname "$GEOSPEC_NODE"):$PATH"
mkdir "$GEOSPEC_WRAPPER_ROOT" "$GEOSPEC_BUILD_ROOT" &&
cp "$GEOSPEC_RELINK_ROOT/wrapper/package.json" "$GEOSPEC_WRAPPER_ROOT/" &&
cp "$GEOSPEC_RELINK_ROOT/wrapper/pnpm-lock.yaml" "$GEOSPEC_WRAPPER_ROOT/" &&
(cd "$GEOSPEC_WRAPPER_ROOT" && "$GEOSPEC_PNPM" install \\
  --ignore-workspace --frozen-lockfile --ignore-scripts && \\
  shasum -a 256 -c "$GEOSPEC_RELINK_ROOT/wrapper/implementation.sha256") &&
mkdir "$GEOSPEC_SOURCE_ROOT/packages/geospec-engine-native/bindings/python/licenses" &&
cp -R "$GEOSPEC_RELINK_ROOT/materials/python/." \\
  "$GEOSPEC_SOURCE_ROOT/packages/geospec-engine-native/bindings/python/licenses/"
''',
        'standaloneRoutes': standalone_routes,
        'standaloneRequiredVariables': [
            'GEOSPEC_SOURCE_ROOT',
            'GEOSPEC_RELINK_ROOT',
            'GEOSPEC_BUILD_ROOT',
            'GEOSPEC_WRAPPER_ROOT',
            'GEOSPEC_OCCT_PREFIX',
            'GEOSPEC_RUSTUP',
            'GEOSPEC_PNPM',
            'GEOSPEC_NODE',
            'GEOSPEC_MATURIN313',
            'GEOSPEC_MATURIN314',
            'GEOSPEC_PYTHON313',
            'GEOSPEC_PYTHON314',
        ],
        'producerEvidence': {
            'identityProof': 'receipts/producer-identity-source-proof.json',
            'prefixClosure': 'receipts/occt-static-closure.json',
            'rule': (
                'Reuse the selected producer proof for manifests, configs, profile and resolved '
                'graphs, and the matching prefix receipt for compiler/environment/command. '
                'These observations belong to their recorded run, not the reconstruction. '
                'Record a successor proof and actual compiler-driver command for the final build.'
            ),
        },
        'externalPrerequisites': [
            'Darwin arm64; selected Node executable and exact packageManager version in wrapper/package.json',
            'Registry access or a pnpm store containing every integrity-pinned wrapper package; no workspace install',
            'Rust 1.88 with the Darwin arm64 target and Cargo dependency access/cache matching binding locks',
            'Selected Xcode compiler drivers and SDK; preserve producer environment/config, never pass raw ld as a driver',
            'CPython 3.13 and 3.14 with the exact pinned maturin already provisioned in separate environments',
            'bash, cmake, ninja, tar, shasum and the tools required by included build-occt.sh',
            'Fresh extracted source, wrapper and build directories; run prepareBeforeBuilds once before either Python route',
        ],
        'pythonReconstructionRequirements': {
            'python313': {'requiredPythonSeries': '3.13', 'maturinVersion': maturin_version},
            'python314': {'requiredPythonSeries': '3.14', 'maturinVersion': maturin_version},
        },
        'reconstructionSelectionAtMaterialGeneration': {
            'rust': {
                'toolchain': '1.88.0',
                'rustup': executable_identity(rustup, ['--version']),
                'rustc': executable_identity(rustc, ['-vV']),
                'cargo': executable_identity(cargo, ['-vV']),
            },
            'apple': {
                'scope': 'host path/version-local selection; SDK payload equality is not claimed',
                'xcrun': executable_identity(xcrun, ['--version']),
                'clang': executable_identity(clang, ['--version']),
                'clang++': executable_identity(clangxx, ['--version']),
                'backendLd': executable_identity(linker),
                'cargoLinkerDriver': (
                    'No linker override is added to the owned route. Preserve the selected '
                    'producer environment/config and compiler-driver invocation; raw ld is '
                    'backend identity only. Record the actual driver and flags in the final receipt.'
                ),
                'sdkPath': sdk,
                'sdkVersion': sdk_version,
            },
            'node': {
                'runtime': executable_identity(node, ['--version']),
                'pnpm': executable_identity(pnpm, ['--version']),
                'napiCli': napi_identity,
            },
            **python_observations,
        },
        'materialGeneratorObservation': {
            'python': executable_identity(archive_python, ['--version']),
            'pythonImplementation': sys.version,
            'zlibBuildVersion': zlib.ZLIB_VERSION,
            'zlibRuntimeVersion': zlib.ZLIB_RUNTIME_VERSION,
            'git': executable_identity(git, ['--version']),
            'archiveFormat': 'deterministic GNU tar + gzip level 9, mtime 0',
        },
        'finalProducerObservation': {
            'status': 'required-not-observed-by-material-generator',
            'required': [
                'artifact digests and route',
                'exact Rust/Cargo, compiler, SDK and linker identities',
                'exact Node/pnpm/NAPI or CPython/maturin identities',
                'identity-bearing environment values or absence',
                'resolved Cargo graph/features and producer identity',
            ],
        },
        'q7Budgets': Q7_BUDGETS,
    }


def mixed_environment(closure, inputs_path=None, inputs_copy=None):
    """The ST recorded environment; no inputs path means a prospective unverified rebuild."""
    simd = closure.get('wasmSimd')
    require(simd is None or simd == {'rustFlags': ['-C', 'target-feature=+simd128'],
                                    'cxxFlag': '-msimd128', 'linkFlag': '-msimd128'},
            'Unsupported mixed SIMD selection')
    eh_flags = ['-fwasm-exceptions', '-sWASM_LEGACY_EXCEPTIONS=1', '-sSUPPORT_LONGJMP=wasm']
    require(closure.get('wasmEh') == {'compileFlags': eh_flags, 'linkFlags': eh_flags},
            'Unsupported mixed native WASM EH selection')
    environment = {
        **closure['environment'], 'RUSTC': closure['rustc'],
        'GEOSPEC_OCCT_PREFIX': closure['occtPrefix'], 'CARGO_INCREMENTAL': '0',
        'CC_wasm32_unknown_emscripten': closure['emcc'],
        'CXX_wasm32_unknown_emscripten': closure['emxx'],
        'AR_wasm32_unknown_emscripten': closure['emar'],
        'CXXFLAGS_wasm32_unknown_emscripten':
            ' '.join([*([simd['cxxFlag']] if simd else []), '-frtti', *eh_flags]),
        **({'CARGO_ENCODED_RUSTFLAGS': '\x1f'.join([
            *simd['rustFlags'],
            f'--remap-path-prefix={closure["sourceRoot"]}=tau',
            f'--remap-path-prefix={closure["environment"]["CARGO_HOME"]}=cargo',
            f'--remap-path-prefix={Path(closure["rustPrefix"]) / "lib/rustlib/src/rust"}=rust-src',
        ]),
            'GEOSPEC_WASM_SIMD_PROFILE': 'simd128-v1'} if simd else {}),
    }
    if inputs_path is not None:
        environment.update({
            'GEOSPEC_PRODUCER_ROUTE': 'nx-build-mixed-st-release-v1',
            'GEOSPEC_PRODUCER_CARGO_CWD': closure['sourceRoot'],
            'GEOSPEC_PRODUCER_MANIFEST': str(Path(closure['sourceRoot']) /
                                             'packages/geospec-engine-native/bindings/emscripten/Cargo.toml'),
            'GEOSPEC_MIXED_INPUTS': str(inputs_path),
            'GEOSPEC_PRODUCER_MIXED_INPUTS_SHA256': digest(inputs_copy or inputs_path),
        })
    else:
        environment['GEOSPEC_PRODUCER_ROUTE'] = 'mixed-relink-unverified'
    return environment


def file_record(path):
    path = Path(path)
    return {'path': str(path), 'sha256': digest(path), 'bytes': path.stat().st_size}


def current_mixed_source(closure, path):
    recorded = Path(path)
    require(recorded.is_absolute() and '..' not in recorded.parts and str(recorded) == str(path),
            'Noncanonical mixed input path')
    producer_package = (Path(closure['sourceRoot']) / 'packages/geospec-engine-native'
                        if 'sourceRoot' in closure else PACKAGE)
    return PACKAGE / recorded.relative_to(producer_package) if recorded.is_relative_to(producer_package) else recorded


def verify_mixed_source_inputs(closure):
    pins = {row['path']: row['sha256'] for row in closure['inputs']}
    require(len(pins) == len(closure['inputs']), 'Duplicate mixed input')
    for path, sha in pins.items():
        require(digest(current_mixed_source(closure, path)) == sha, f'Mixed input changed: {path}')
    actual_sources = set()
    for subtree in ['rust', 'native', 'bindings/emscripten']:
        for parent, directories, names in os.walk(PACKAGE / subtree):
            directories[:] = [d for d in directories if d not in
                              {'target', 'node_modules', '.git', '__pycache__', 'out-tsc'}
                              and not (Path(parent) == PACKAGE / 'bindings/emscripten' and d == 'generated')]
            actual_sources.update(str(Path(parent) / name) for name in names if name != '.DS_Store')
    producer_root = Path(closure['sourceRoot'])
    require({str(producer_root / Path(path).relative_to(ROOT)) for path in actual_sources} <= pins.keys(),
            'Mixed source files added after the recorded freeze')
    return pins


def select_mixed_build():
    paths = {}
    for key in ['RECEIPT', 'COMMANDS', 'INPUTS']:
        value = os.environ.get(f'GEOSPEC_MIXED_{key}')
        require(value, f'Set GEOSPEC_MIXED_{key} to actual mixed build evidence')
        paths[key.lower()] = Path(value).resolve()
    receipt, commands, closure = (read_json(paths[k]) for k in ['receipt', 'commands', 'inputs'])
    require(receipt['manifestSha256'] == digest(paths['inputs']), 'Mixed receipt/manifest differ')
    require(closure['schema'] == 'geospec-mixed-build-inputs-v3', 'Expected fixed-SIMD mixed inputs v3')
    require(receipt.get('schema') == 'geospec-mixed-build-receipt-v2', 'Expected fixed-SIMD build receipt v2')
    require(closure['sourceRoot'] == receipt['sourceRoot']
            and Path(closure['sourceRoot']).is_absolute()
            and '..' not in Path(closure['sourceRoot']).parts
            and str(Path(closure['sourceRoot'])) == closure['sourceRoot'], 'Wrong source root')
    producer_root = Path(closure['sourceRoot'])
    producer_package = producer_root / 'packages/geospec-engine-native'

    require(closure['sourceRevision'] == receipt['sourceRevision'], 'Mixed revision references differ')
    require(closure['linkOptimization'] == 'O3', 'Expected current ST O3 mixed profile')
    require(len(commands) == 4 and all(c['status'] == 0 for c in commands), 'Incomplete mixed commands')
    require(commands[2]['executable'] == closure['cargo'] and commands[2]['args'][0] == 'build'
            and commands[3]['executable'] == closure['emxx'] and commands[3]['args'][0] == '-O3',
            'Mixed commands do not select the recorded Cargo/linker profile')
    # This is content validation, not the preparation verifier's unrelated HEAD equality gate.
    pins = verify_mixed_source_inputs(closure)
    for parent in {ROOT, *ROOT.parents, PACKAGE, PACKAGE / 'bindings', PACKAGE / 'bindings/emscripten',
                   Path(closure['environment']['CARGO_HOME'])}:
        for name in ['config', 'config.toml']:
            path = parent / name if parent == Path(closure['environment']['CARGO_HOME']) else parent / '.cargo' / name
            require(not path.exists(), f'Unselected mixed Cargo configuration: {path}')
    require(receipt['bindingSha256'] == digest(PACKAGE / 'bindings/emscripten/src/lib.rs'),
            'Mixed binding source differs')
    recipe = PACKAGE / 'scripts/selected-delivery.json'
    require(digest(recipe) == closure['recipeSha256'] == pins[str(producer_package / 'scripts/selected-delivery.json')],
            'Mixed selected recipe differs')
    selected = read_json(recipe)
    require(selected['rust']['commit'] in receipt['rustVersion']
            and selected['emscripten']['commit'] in receipt['emVersion'], 'Mixed tool versions differ')
    if closure.get('wasmSimd'):
        recorded_inputs = Path(closure['preparationCache']) / 'mixed-inputs-simd128.json'
        expected = mixed_environment(closure, recorded_inputs, paths['inputs'])
        require(closure['wasmSimd'] == selected['wasmSimd'] == receipt.get('wasmSimd'),
                'Mixed SIMD recipe/receipt differ')
        require(closure['wasmEh'] == selected['wasmEh'] == receipt.get('wasmEh'),
                'Mixed native WASM EH recipe/receipt differ')
        require(all(flag in commands[3]['args'] for flag in closure['wasmEh']['linkFlags']),
                'Mixed link command omitted native WASM EH')
        require(receipt.get('buildEnvironment') == {
            key: expected[key] for key in ['CARGO_ENCODED_RUSTFLAGS',
                                           'CXXFLAGS_wasm32_unknown_emscripten',
                                           'GEOSPEC_WASM_SIMD_PROFILE',
                                           'GEOSPEC_PRODUCER_ROUTE',
                                           'GEOSPEC_PRODUCER_CARGO_CWD',
                                           'GEOSPEC_PRODUCER_MANIFEST',
                                           'GEOSPEC_MIXED_INPUTS',
                                           'GEOSPEC_PRODUCER_MIXED_INPUTS_SHA256']},
            'Mixed SIMD build environment differs from receipt')
        require(closure['wasmSimd']['linkFlag'] in commands[3]['args'],
                'Mixed link command omitted fixed SIMD')
    cargo_args = commands[2]['args']
    require(cargo_args == ['build', '--manifest-path', str(producer_package / 'bindings/emscripten/Cargo.toml'),
                          '--locked', '--offline', '--release', '--target', 'wasm32-unknown-emscripten',
                          '--target-dir', str(Path(closure['cache']) / 'target')], 'Mixed Cargo route differs')
    link_args = commands[3]['args']
    require(link_args[link_args.index('-Wl,--start-group') + 2:link_args.index('-Wl,--end-group')]
            == closure['libraries'], 'Mixed linked archive selection differs')
    artifacts = []
    require({Path(r['path']).name for r in receipt['artifacts']} ==
            {'geospec_engine_native.mjs', 'geospec_engine_native.wasm'}, 'Expected mixed JS/WASM pair')
    for row in receipt['artifacts']:
        generated = PACKAGE / 'bindings/emscripten/generated' / Path(row['path']).name
        staged = PACKAGE / 'dist/bindings/mixed-wasm' / generated.name
        require(Path(row['path']) == producer_package / 'bindings/emscripten/generated' / generated.name
                and receipt['output'] == str(producer_package / 'bindings/emscripten/generated'),
                'Mixed receipt selects a different artifact path')
        require(generated.stat().st_size == row['bytes'] and digest(generated) == row['sha256'],
                f'Current generated mixed artifact differs from receipt: {generated}')
        artifacts.append({**row, 'distPath': str(staged)})
    prefix = Path(closure['occtPrefix']).parent / 'prefix-receipt.json'
    prefix_receipt = read_json(prefix)
    require(prefix_receipt.get('recovery') == closure['prefixRecovery']['mixed'], 'Mixed recovery differs')
    return {
        'paths': paths, 'closure': closure, 'commands': commands, 'receipt': receipt,
        'prefixReceipt': prefix, 'prefix': prefix_receipt,
        'attribution': {
            'status': 'current-mixed', 'target': 'wasm32-unknown-emscripten',
            'profile': receipt['profile'], 'sourceRevision': receipt['sourceRevision'],
            'sourceRevisionIsReferenceOnly': True, 'artifacts': artifacts,
            'evidence': {k: file_record(v) for k, v in paths.items()},
            'inputCount': len(pins), 'qualification': receipt['qualification'],
            'prefixRecovery': closure['prefixRecovery']['mixed'],
            'environmentEvidence': 'Exact source-derived environment from the pinned build-mixed-wasm.mts; commands are recorded observations.',
        },
    }


def require_mixed_dist(mixed):
    for row in mixed['attribution']['artifacts']:
        staged = Path(row['distPath'])
        require(staged.is_file() and staged.stat().st_size == row['bytes']
                and digest(staged) == row['sha256'],
                f'Dist mixed artifact must match the selected producer before generation: {staged}')


def mixed_tool_licenses(mixed):
    closure = mixed['closure']
    records = []
    for row in closure['inputs']:
        path = Path(row['path'])
        if not (LICENSE_TEXT.match(path.name) or NOTICE.match(path.name)
                or path.name.lower().startswith(('copyright', 'authors'))):
            continue
        for key in ['rustPrefix', 'sdkPrefix']:
            root = Path(closure[key])
            if path.is_relative_to(root):
                records.append((path, f'mixed-tools/{key}/{path.relative_to(root).as_posix()}'))
                break
    require(records, 'No selected mixed toolchain license material')
    return records


def mixed_runtime_license(relative):
    # Compiler/npm build support stays in the adjacent kit; runtime notices ship with npm.
    return (relative.startswith('mixed-tools/rustPrefix/lib/rustlib/src/rust/library/')
            or relative == 'mixed-tools/rustPrefix/share/doc/rust/COPYRIGHT-library.html'
            or relative.startswith(('mixed-tools/sdkPrefix/emscripten/system/',
                                    'mixed-tools/sdkPrefix/emscripten/src/'))
            or relative in {'mixed-tools/sdkPrefix/emscripten/LICENSE',
                            'mixed-tools/sdkPrefix/emscripten/AUTHORS'})


def mixed_producer_recipe(mixed):
    """Rebase the observed argv into shell commands; never call the build helper."""
    c = mixed['closure']
    prefix_name = Path(c['occtPrefix']).parent.name
    require(prefix_name in {'occt-mixed', 'occt-mixed-simd128'}, 'Unsupported mixed prefix route')
    # Specific path roles from this producer contract, not an arbitrary command driver.
    replacements = {
        c['cache']: 'GEOSPEC_MIXED_BUILD', c['output']: 'GEOSPEC_MIXED_OUTPUT',
        c['occtPrefix']: 'GEOSPEC_MIXED_PREFIX', c['rustPrefix']: 'GEOSPEC_MIXED_RUST',
        c['sdkPrefix']: 'GEOSPEC_MIXED_SDK', c['sourceRoot']: 'GEOSPEC_SOURCE_ROOT',
        c['preparationCache']: 'GEOSPEC_MIXED_PREP',
        c['environment']['HOME']: 'GEOSPEC_MIXED_HOME',
    }
    for name in ['node', 'python3', 'cmake', 'ninja', 'git', 'rustup', 'xcrun', 'bash']:
        replacements[c['tools'][name]] = f'GEOSPEC_MIXED_{name.upper()}'
    # PATH contains tool directories, while argv/config contains executables.
    for name in ['node', 'python3', 'cmake', 'ninja', 'git', 'rustup']:
        replacements[str(Path(c['tools'][name]).parent)] = f'GEOSPEC_MIXED_{name.upper()}_BIN'
    pattern = re.compile('(' + '|'.join(re.escape(p) for p in sorted(replacements, key=len, reverse=True)) + ')')
    def word(value):
        return ''.join('"${' + replacements[p] + '}"' if p in replacements else shlex.quote(p)
                       for p in pattern.split(value) if p) or "''"
    recorded_inputs = Path(c['preparationCache']) / 'mixed-inputs-simd128.json'
    transported_inputs = mixed.get('paths', {}).get('inputs')
    recorded_environment = (mixed_environment(c, recorded_inputs, transported_inputs)
                            if transported_inputs else mixed_environment(c))
    # A relocated standalone recipe is not the observed verified producer run.
    environment = mixed_environment(c)
    # Successor invocation controls, not retroactive recorded producer evidence.
    job_keys = ['GEOSPEC_OCCT_JOBS', 'EMCC_CORES', 'CARGO_BUILD_JOBS', 'BINARYEN_CORES']
    control_keys = {*job_keys, 'GIT_CEILING_DIRECTORIES'}
    controls = ' '.join(f'{key}="${{GEOSPEC_OCCT_JOBS:-2}}"' for key in job_keys)
    controls += (' GIT_CEILING_DIRECTORIES="${GEOSPEC_RELINK_ROOT}:'
                 '${GEOSPEC_MIXED_PREP}:${GEOSPEC_MIXED_BUILD}"')
    env_command = 'env -i ' + ' '.join(word(f'{k}={v}') for k, v in environment.items()
                                      if k not in control_keys) + ' ' + controls
    commands = [' '.join(word(v) for v in [item['executable'], *item['args']]) for item in mixed['commands']]
    prefix_environment = {**c['environment'], **{k: v for k, v in mixed['prefix']['environment'].items()
                                               if k.startswith('GEOSPEC_OCCT_')}}
    prefix_environment['GEOSPEC_OCCT_CACHE'] = str(Path(c['occtPrefix']).parent)
    prefix_command = 'env -i ' + ' '.join(word(f'{k}={v}') for k, v in prefix_environment.items()
                                         if k not in control_keys) + ' ' + controls
    prefix_command += ' ' + ' '.join(word(v) for v in mixed['prefix']['command'])
    recorded_package = Path(c['sourceRoot']) / 'packages/geospec-engine-native'
    fetch_commands = [[c['cargo'], 'fetch', '--locked', '--manifest-path', str(recorded_package / relative)]
                      for relative in ['bindings/emscripten/Cargo.toml', 'native/runtime/Cargo.toml']]
    config = Path(c['environment']['EM_CONFIG']).read_text()
    # Config values are emitted by the selected Python to preserve Python quoting.
    config_command = ('"$GEOSPEC_MIXED_PYTHON3" -c ' + shlex.quote(
        'import os; from pathlib import Path; '
        's=os.environ["GEOSPEC_MIXED_SDK"]; '
        'v={"LLVM_ROOT":s+"/bin","BINARYEN_ROOT":s,"EMSCRIPTEN_ROOT":s+"/emscripten",'
        '"NODE_JS":os.environ["GEOSPEC_MIXED_NODE"],"PYTHON":os.environ["GEOSPEC_MIXED_PYTHON3"]}; '
        'Path(os.environ["GEOSPEC_MIXED_PREP"],"emscripten.config").write_text('
        '"".join(k+" = "+repr(v)+"\\n" for k,v in v.items()))'))
    prepare = ('# Export absolute paths for every variable below; use fresh writable build/prep/output roots.\n'
               f'# GEOSPEC_MIXED_PREFIX must be $GEOSPEC_MIXED_PREP/{prefix_name}/install.\n'
               '# Provision the exact SDK/Rust archives from receipts/selected-delivery.json first.\n'
               'mkdir -p "$GEOSPEC_MIXED_PREP"/sources "$GEOSPEC_MIXED_PREP"/downloads \\\n'
               '  "$GEOSPEC_MIXED_PREP"/tmp "$GEOSPEC_MIXED_BUILD" "$GEOSPEC_MIXED_OUTPUT"\n')
    for name in ['occt', 'rapidjson', 'freetype']:
        prepare += (f'mkdir "$GEOSPEC_MIXED_PREP/sources/{name}"\n'
                    f'cp "$GEOSPEC_RELINK_ROOT/archives/{name}.tar.gz" "$GEOSPEC_MIXED_PREP/downloads/{name}.tar.gz"\n'
                    f'tar -xzf "$GEOSPEC_MIXED_PREP/downloads/{name}.tar.gz" --strip-components=1 -C "$GEOSPEC_MIXED_PREP/sources/{name}"\n')
    prepare += config_command + '\n'
    sdk_dependencies = '''# After unpacking the pinned SDK, use its selected manifest/lock unchanged.
cp "$GEOSPEC_RELINK_ROOT/receipts/mixed-sdk-package.json" "$GEOSPEC_MIXED_SDK/emscripten/package.json"
cp "$GEOSPEC_RELINK_ROOT/receipts/mixed-sdk-package-lock.json" "$GEOSPEC_MIXED_SDK/emscripten/package-lock.json"
(cd "$GEOSPEC_MIXED_SDK/emscripten" && \
  "$GEOSPEC_MIXED_NODE" "$GEOSPEC_MIXED_NPM_CLI" ci --ignore-scripts --no-audit --no-fund)
'''
    return {
        'schema': 'geospec-current-mixed-reconstruction-v1',
        'claim': 'Standalone relocated reconstruction recipe, not an observed successor build or byte equality promise.',
        'producer': mixed['attribution'],
        'recordedEnvironment': recorded_environment, 'recordedCommands': mixed['commands'],
        'standaloneExecutionControls': {
            'jobs': 'GEOSPEC_OCCT_JOBS (default 2) selects outer OCCT, Emscripten, Cargo and Binaryen jobs.',
            'gitCeilings': 'Absolute GEOSPEC_RELINK_ROOT, GEOSPEC_MIXED_PREP and GEOSPEC_MIXED_BUILD; source must remain beneath the extracted kit root.',
            'scope': 'Prospective standalone controls only; original recorded environment is unchanged.',
        },
        'recordedEmscriptenConfig': config,
        'requiredExportedVariables': sorted(set(replacements.values()) | {'GEOSPEC_RELINK_ROOT', 'GEOSPEC_MIXED_NPM_CLI'}),
        'externalPrerequisites': [
            'Exact Rust nightly and Emscripten SDK archives/pins in selected-delivery.json; provision SDK npm dependencies using its frozen lock, scripts disabled.',
            'Darwin arm64 selected host tools; *_BIN variables are the respective executable parent directories.',
            'Cargo registry cache matching included locks, or network access for the explicit locked fetch step.',
            'Fresh source/prep/build/output trees; GEOSPEC_SOURCE_ROOT is the extracted kit source directory.',
        ],
        'provisionSdkDependencies': sdk_dependencies,
        'sdkProvisioningScope': 'Successor provisioning instruction only. Original npm invocation/version is not present in the mixed build receipt; record the selected successor npm CLI hash/version.',
        'prepare': prepare,
        'rebuildMixedPrefix': prefix_command,
        'fetchBeforeOfflineBuild': '(cd "$GEOSPEC_SOURCE_ROOT" && ' + ' && '.join(
            env_command + ' ' + ' '.join(word(v) for v in fetch) for fetch in fetch_commands) + ')',
        'buildAndLink': '(cd "$GEOSPEC_SOURCE_ROOT" &&\n  ' + ' &&\n  '.join(env_command + ' ' + cmd for cmd in commands) + ')',
        'prefixBuilderRole': 'Reconstruction invokes included current R1 helper with recorded mixed options; original producing bytes are separate evidence, including the original recovery/support gap.',
        'qualification': 'Native and mixed profiles remain separate. Successor outputs require fresh source/tool/command/hash and runtime qualification; native A4 linker gaps remain unchanged.',
    }


def copy_mixed_material(output, mixed):
    c = mixed['closure']
    receipts = output / 'receipts'
    # Older closures selected the then-current recipe implicitly. It is usable
    # only if its bytes still join both that closure and the original receipt.
    default_recipe = (Path(c['sourceRoot']) / 'packages/geospec-engine-native/scripts/selected-delivery.json'
                      if 'sourceRoot' in c else PACKAGE / 'scripts/selected-delivery.json')
    prefix_recipe_recorded = Path(c.get('prefixProducerRecipe', default_recipe))
    prefix_recipe = current_mixed_source(c, prefix_recipe_recorded)
    recipe_bytes = prefix_recipe.read_bytes()
    recipe_sha = hashlib.sha256(recipe_bytes).hexdigest()
    recipe_pin = next((row['sha256'] for row in c['inputs'] if row['path'] == str(prefix_recipe_recorded)), None)
    require(recipe_sha == recipe_pin, 'Mixed prefix recipe differs from its input pin')
    require(recipe_sha == read_json(mixed['prefixReceipt'])['recipeSha256'],
            'Mixed prefix recipe differs from its producer receipt')
    recipe_relative = 'receipts/mixed-prefix-selected-delivery.json'
    (output / recipe_relative).write_bytes(recipe_bytes)
    for name, path in mixed['paths'].items():
        shutil.copyfile(path, receipts / f'mixed-{name}.json')
    shutil.copyfile(mixed['prefixReceipt'], receipts / 'mixed-prefix-receipt.json')
    write_json(receipts / 'mixed-cargo-metadata.json', mixed['metadata'])
    write_json(receipts / 'mixed-producer-recipe.json', mixed_producer_recipe(mixed))
    for name in ['package.json', 'package-lock.json']:
        shutil.copyfile(Path(c['sdkPrefix']) / 'emscripten' / name, receipts / f'mixed-sdk-{name}')
    for source, relative in mixed_tool_licenses(mixed):
        destination = output / 'materials' / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    selected = read_json(PACKAGE / 'scripts/selected-delivery.json')
    for name, item in selected['headers'].items():
        archive = Path(c['preparationCache']) / f'downloads/{name}.tar.gz'
        require(digest(archive) == item['sha256'], f'Mixed source archive changed: {archive}')
        shutil.copyfile(archive, output / f'archives/{name}.tar.gz')
    return {'path': 'receipts/mixed-producer-recipe.json',
            'sha256': digest(receipts / 'mixed-producer-recipe.json'), **mixed['attribution'],
            'prefixProducerRecipe': {'path': recipe_relative, 'sha256': recipe_sha,
                                     'prefixReceiptSha256': digest(mixed['prefixReceipt'])}}


def copy_prefix_builder(output, prefix_receipt, builder, role):
    receipt = read_json(prefix_receipt)
    require(digest(builder) == receipt['builderSha256'], f'Wrong actual {role} prefix producing script')
    relative = f"receipts/build-occt-{receipt['builderSha256']}.sh"
    shutil.copyfile(builder, output / relative)
    return {'role': 'actual-prefix-producing-source', 'prefix': role, 'path': relative,
            'sha256': receipt['builderSha256'], 'prefixReceiptSha256': digest(prefix_receipt),
            'recovery': receipt.get('recovery'),
            'currentRebuildHelper': {'path': 'source/packages/geospec-engine-native/native/occt/build-occt.sh',
                                     'sha256': digest(PACKAGE / 'native/occt/build-occt.sh')}}


def make_relink_material(output, delivery_cache, cohort, mixed=None):
    selected_proof = os.environ.get('GEOSPEC_PRODUCER_RECEIPT')
    require(selected_proof, 'Set GEOSPEC_PRODUCER_RECEIPT to the selected producer identity proof')
    producer_proof = Path(selected_proof).resolve()
    require(producer_proof.is_file(), 'Missing selected producer identity-source-proof.json')
    wrapper_manifest, wrapper_lock, napi_identity = napi_wrapper_inputs()
    new_directory(output)
    source_manifest = read_json(PACKAGE / 'native/occt/source-manifest.json')
    archive = delivery_cache / 'downloads/occt.tar.gz'
    require(archive.exists(), f'Missing prepared OCCT archive: {archive}')
    require(
        digest(archive) == source_manifest['archiveSha256'],
        f'Prepared OCCT archive hash does not match source-manifest.json: {archive}',
    )
    archive_name = 'occt.tar.gz'
    (output / 'archives').mkdir()
    shutil.copyfile(archive, output / 'archives' / archive_name)

    source_records = []
    selected_sources = set(source_files())
    if mixed:
        selected_sources.update(Path(row['path']).relative_to(Path(mixed['closure']['sourceRoot']))
                                for row in mixed['closure']['inputs']
                                if Path(row['path']).is_relative_to(Path(mixed['closure']['sourceRoot']) / 'packages/geospec-engine-native'))
    for relative_path in sorted(selected_sources):
        source = ROOT / relative_path
        require(source.exists(), f'Missing source-relink input: {source}')
        destination = output / 'source' / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        source_records.append({
            'path': relative_path.as_posix(),
            'sha256': digest(source),
            'bytes': source.stat().st_size,
        })

    prefix = Path(os.environ.get('GEOSPEC_OCCT_PREFIX', DEFAULT_OCCT_PREFIX)).resolve()
    closure_source = prefix.parent / 'static-toolkit-closure.txt'
    cmake_cache = prefix.parent / 'build/CMakeCache.txt'
    require(closure_source.exists(), f'Missing actual OCCT closure: {closure_source}')
    require(cmake_cache.exists(), f'Missing actual OCCT CMake cache: {cmake_cache}')
    archive_paths = [value for value in closure_source.read_text().splitlines() if value]
    require(archive_paths, 'Actual OCCT closure is empty')
    archives = []
    for declared_path in archive_paths:
        path = prefix / 'lib' / Path(declared_path).name
        require(path.exists(), f'Missing actual OCCT archive: {path}')
        archives.append({
            'path': f'lib/{path.name}',
            'sha256': digest(path),
            'bytes': path.stat().st_size,
        })
    header_root = prefix / 'include/opencascade'
    require(header_root.exists(), f'Missing actual OCCT headers: {header_root}')
    headers = [{
        'path': path.relative_to(prefix).as_posix(),
        'sha256': digest(path),
        'bytes': path.stat().st_size,
    } for path in walk_files(header_root)]
    try:
        qualified_prefix = prefix.relative_to(ROOT).as_posix()
    except ValueError:
        qualified_prefix = str(prefix)
    closure = {
        'qualifiedPrefix': qualified_prefix,
        'qualification': 'selected prefix bytes; observations belong to this prefix, not a future build',
        'archives': archives,
        'headers': {
            'files': len(headers),
            'bytes': sum(item['bytes'] for item in headers),
            'sha256': identity(headers),
        },
        'cmakeCache': {
            'sha256': digest(cmake_cache),
            'selected': parse_cmake_cache(cmake_cache),
        },
    }
    (output / 'receipts').mkdir()
    prefix_receipt = prefix.parent / 'prefix-receipt.json'
    require(prefix_receipt.is_file(), 'Current native source kit requires the actual prefix receipt')
    shutil.copyfile(prefix_receipt, output / 'receipts/occt-prefix-receipt.json')
    closure['producerReceipt'] = {
        'path': 'receipts/occt-prefix-receipt.json', 'sha256': digest(prefix_receipt),
    }
    proof = read_json(producer_proof)
    actual_prefix = proof['actualPrefix']
    require(actual_prefix['receipt']['sha256'] == digest(prefix_receipt),
            'Selected native proof belongs to a different prefix')
    prefix_builders = [copy_prefix_builder(
        output, prefix_receipt, actual_prefix['retainedProducingBuilder']['path'], 'native',
    )]
    mixed_recipe = None
    if mixed:
        prefix_builders.append(copy_prefix_builder(
            output, mixed['prefixReceipt'], mixed['closure']['prefixProducerBuilder'], 'mixed',
        ))
        mixed_recipe = copy_mixed_material(output, mixed)
    write_json(output / 'receipts/occt-static-closure.json', closure)
    shutil.copyfile(producer_proof, output / 'receipts/producer-identity-source-proof.json')
    (output / 'wrapper').mkdir()
    write_json(output / 'wrapper/package.json', wrapper_manifest)
    # JSON is a YAML subset: pnpm reads this as its normal v9 lockfile.
    write_json(output / 'wrapper/pnpm-lock.yaml', wrapper_lock)
    (output / 'wrapper/implementation.sha256').write_text(
        f"{napi_identity['implementation']['sha256']}  node_modules/@napi-rs/cli/dist/cli.js\n"
        f"{napi_identity['packageManifestSha256']}  node_modules/@napi-rs/cli/package.json\n"
    )
    license_inventory = python_license_material(output / 'materials/python', delivery_cache)
    write_json(output / 'receipts/python-license-material.json', license_inventory)
    shutil.copyfile(
        PACKAGE / 'native/occt/source-manifest.json',
        output / 'receipts/occt-source-manifest.json',
    )
    shutil.copyfile(
        PACKAGE / 'scripts/selected-delivery.json',
        output / 'receipts/selected-delivery.json',
    )
    producer_recipe_path = output / 'receipts/native-producer-recipe.json'
    native_recipe = native_producer_recipe(napi_identity, cohort)
    write_json(producer_recipe_path, native_recipe)
    revision = run([str(selected_executable('git')), 'rev-parse', 'HEAD']).strip()
    manifest = {
        'schema': 'geospec-native-source-relink-v2',
        'sourceRevision': revision,
        'sourceRevisionIsReferenceOnly': True,
        'sourceTree': {
            'files': len(source_records),
            'sha256': identity(source_records),
            'entries': source_records,
        },
        'occtSourceArchive': {
            'path': f'archives/{archive_name}',
            'bytes': archive.stat().st_size,
            'sha256': source_manifest['archiveSha256'],
            'url': source_manifest['archiveUrl'],
        },
        'occtClosureReceipt': 'receipts/occt-static-closure.json',
        'mixedProducerRecipe': mixed_recipe,
        'prefixProducingSources': prefix_builders,
        'mixedWasmToolRecipe': {
            'path': 'receipts/selected-delivery.json',
            'sha256': digest(output / 'receipts/selected-delivery.json'),
        },
        'nativeProducerRecipe': {
            'path': 'receipts/native-producer-recipe.json',
            'sha256': digest(producer_recipe_path),
        },
        'reconstructionInputs': [{
            'path': relative, 'sha256': digest(output / relative),
        } for relative in [
            'wrapper/package.json', 'wrapper/pnpm-lock.yaml', 'wrapper/implementation.sha256',
            'receipts/python-license-material.json',
            'receipts/producer-identity-source-proof.json',
        ]],
        'q7Budgets': Q7_BUDGETS,
        'relinkMechanism': 'rebuild the static OCCT prefix and binding from the included source bytes',
        'scope': ('Darwin arm64 native and current ST mixed-WASM, separately attributed'
                  if mixed else 'Darwin arm64 Node/Python native producer only'),
    }
    write_json(output / 'manifest.json', manifest)
    (output / 'README.md').write_text(f'''# GeoSpec native source and relink material

This directory carries the exact OCCT source archive unchanged, the current
GeoSpec native source bytes, separate native and mixed-Wasm build recipes, and
the explicitly selected static-prefix closure. It is technical reconstruction
material, not legal certification. A distributor must bind this directory to
the rebuilt package bytes in its delivery receipt.

The recorded prefix is evidence only. Reconstruct into a fresh prefix:

```bash
export MACOSX_DEPLOYMENT_TARGET={shlex.quote(native_recipe['environment']['MACOSX_DEPLOYMENT_TARGET'])}
mkdir occt-source
tar -xzf archives/{archive_name} --strip-components=1 -C occt-source
GEOSPEC_OCCT_SOURCE="$PWD/occt-source" \\
GEOSPEC_OCCT_ARCHIVE="$PWD/archives/{archive_name}" \\
GEOSPEC_OCCT_CACHE="$PWD/occt-build" \\
  bash source/packages/geospec-engine-native/native/occt/build-occt.sh \\
    -DCMAKE_OSX_DEPLOYMENT_TARGET="$MACOSX_DEPLOYMENT_TARGET"

```

`receipts/native-producer-recipe.json` records the exact source-selected owned
Node and Python wrapper commands, standalone command templates, release profile,
and selected tools. Set GEOSPEC_RELINK_ROOT to this extracted directory and
GEOSPEC_SOURCE_ROOT to its source subdirectory (both absolute paths). Provide
the declared external prerequisites and absolute tool paths. Set
GEOSPEC_OCCT_PREFIX to the reconstructed occt-build/install directory. Use fresh
absolute GEOSPEC_WRAPPER_ROOT and GEOSPEC_BUILD_ROOT paths outside source.
Run prepareBeforeBuilds once, then the Node, Python 3.13 and Python 3.14 routes.
Use a shell with set -euo pipefail and stop if any preparation command fails.

The wrapper-only frozen pnpm lock preserves the selected NAPI implementation,
dependency snapshots and registry integrity hashes. Provision it with the exact
packageManager version in wrapper/package.json, using registry access or an
already-populated pnpm store. It does not install the incomplete source workspace.
Node invokes the real CLI entry point in that isolated environment while keeping
the source package cwd, package.json NAPI configuration and build flags.

materials/python is generated from the locked Python Cargo closure and current
source licenses, including NOTICE. Its dependency and byte inventory is recorded
in receipts/python-license-material.json. Preparation stages those exact files in
the Python source licenses directory before either wheel build. The original
COMPONENTS inventory, its nested source receipt and the adjacent source archive
are not recursively included in the wheel.

Reuse receipts/producer-identity-source-proof.json for its recorded manifests,
configs, profile and dependency graphs, and the selected prefix receipt referenced
by receipts/occt-static-closure.json for its tools/environment/command. Restore
the actual producer environment and compiler-driver selection from the selected
run. Native OCCT and all native binding recipes explicitly select the deployment
floor from selected-delivery.json. This build selection does not certify runtime
behavior on older macOS versions; only the recorded release test matrix is qualified.
The recipe adds no CXX/SDK/linker overrides; backend ld metadata
must never be used as a Cargo compiler-driver command. Record changed selections
and the final driver's actual command in the successor producer proof.

The material generator does not observe a future producer invocation. The final
delivery receipt must bind that invocation's exact tools, environment, resolved
Cargo graph/identity, command and artifact digest. No backend substitution or
historical A14 Wasm producer claim is made here. Native A4's missing actual
linker invocation and build-time wrapper pins remain missing; reconstruction
selection never fills those gaps. Compare the rebuilt native prefix
against `receipts/occt-static-closure.json`, then record package hashes and
runtime qualification independently.

For a selected current mixed cohort, receipts/mixed-producer-recipe.json provides
separate provisionSdkDependencies, prepare, rebuildMixedPrefix,
fetchBeforeOfflineBuild and buildAndLink shell steps. Export its declared
variables and run these steps in that order with
set -euo pipefail. It uses the included Emscripten binding/lock and current R1
helper, the exact selected tool archive pins, recorded mixed options and O3 argv.
Its raw input/build/command/prefix receipts retain their original paths/revision
and qualifications. They are evidence, not inputs to the HEAD-sensitive verifier.
No metadata-only invocation is represented as an observed original Cargo graph.

manifest.json prefixProducingSources points separately to the actual old OCCT
builder bytes and current R1 helper. The original mixed prefix's failed-wrapper
continuation and missing earlier support equality remain explicit. Rebuilding
with R1 does not retroactively strengthen those observations. Tool dependencies
and license/notice texts remain attributed to their own native or mixed cohort.
''')


def make_relink_archive(source, archive):
    require(not archive.exists(), f'Refusing to replace existing output: {archive}')
    archive.parent.mkdir(parents=True, exist_ok=True)
    with archive.open('wb') as raw_stream:
        with gzip.GzipFile(
            filename='', mode='wb', fileobj=raw_stream, compresslevel=9, mtime=0
        ) as compressed_stream:
            with tarfile.open(
                fileobj=compressed_stream, mode='w', format=tarfile.GNU_FORMAT
            ) as bundle:
                for path in walk_files(source):
                    relative = path.relative_to(source).as_posix()
                    information = tarfile.TarInfo(f'{SOURCE_RELINK_ROOT}/{relative}')
                    information.size = path.stat().st_size
                    information.mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
                    information.uid = 0
                    information.gid = 0
                    information.uname = ''
                    information.gname = ''
                    information.mtime = 0
                    with path.open('rb') as stream:
                        bundle.addfile(information, stream)


def verify_relink_archive(source, archive):
    expected = {
        f'{SOURCE_RELINK_ROOT}/{path.relative_to(source).as_posix()}': path
        for path in walk_files(source)
    }
    with tarfile.open(archive, mode='r:gz') as bundle:
        members = bundle.getmembers()
        require(
            [item.name for item in members] == list(expected),
            'Source-relink archive member set/order does not match its source directory',
        )
        for member in members:
            source_path = expected[member.name]
            require(member.isfile(), f'Unexpected non-file archive member: {member.name}')
            require(member.size == source_path.stat().st_size, f'Size mismatch: {member.name}')
            require(
                member.uid == 0 and member.gid == 0 and member.mtime == 0,
                f'Non-deterministic archive metadata: {member.name}',
            )
            stream = bundle.extractfile(member)
            require(stream is not None, f'Cannot read archive member: {member.name}')
            member_hash = hashlib.sha256()
            with stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    member_hash.update(chunk)
            require(
                member_hash.hexdigest() == digest(source_path),
                f'Content mismatch: {member.name}',
            )


def write_relink_receipt(output, source, archive):
    require(source.is_dir(), f'Missing source-relink directory: {source}')
    require(archive.is_file(), f'Missing source-relink archive: {archive}')
    require(
        archive.name == SOURCE_RELINK_ASSET,
        f'Source-relink archive must be named {SOURCE_RELINK_ASSET}: {archive}',
    )
    verify_relink_archive(source, archive)
    manifest = read_json(source / 'manifest.json')
    closure = read_json(source / 'receipts/occt-static-closure.json')
    receipt = {
        'schema': 'geospec-native-source-relink-asset-v2',
        'artifact': {
            'fileName': SOURCE_RELINK_ASSET,
            'bytes': archive.stat().st_size,
            'sha256': digest(archive),
            'format': 'deterministic tar+gzip',
        },
        'delivery': {
            'required': 'co-deliver adjacent to each root, platform and wheel artifact',
            'publicationStatus': 'outside this local charter',
        },
        'sourceRevision': manifest['sourceRevision'],
        'sourceRevisionIsReferenceOnly': manifest['sourceRevisionIsReferenceOnly'],
        'sourceTree': {
            'files': manifest['sourceTree']['files'],
            'sha256': manifest['sourceTree']['sha256'],
        },
        'occtSourceArchive': manifest['occtSourceArchive'],
        'nativeProducerRecipe': manifest['nativeProducerRecipe'],
        'mixedProducerRecipe': manifest.get('mixedProducerRecipe'),
        'prefixProducingSources': manifest['prefixProducingSources'],
        'q7Budgets': manifest['q7Budgets'],
        'occtStaticClosure': {
            'qualifiedPrefix': closure['qualifiedPrefix'],
            'archives': len(closure['archives']),
            'archiveBytes': sum(item['bytes'] for item in closure['archives']),
            'headers': closure['headers'],
            'cmakeCacheSha256': closure['cmakeCache']['sha256'],
        },
        'scope': manifest['scope'],
        'legalStatus': 'technical source/relink material; not legal certification',
    }
    write_json(output / 'SOURCE-RELINK.json', receipt)
    (output / 'SOURCE-RELINK.md').write_text(f'''# Source and relink asset

The complete corresponding source and relink kit is delivered as the separate
adjacent asset `{SOURCE_RELINK_ASSET}`. It is intentionally excluded from the
root npm package, platform npm package and Python wheel payloads.

- SHA-256: `{receipt['artifact']['sha256']}`
- Bytes: `{receipt['artifact']['bytes']}`
- Source files: `{receipt['sourceTree']['files']}`
- Source tree SHA-256: `{receipt['sourceTree']['sha256']}`

The distributor must co-deliver the exact asset adjacent to every root,
platform and wheel artifact. No public URL or publication claim is made here.
Verify the digest before following the reconstruction instructions inside the
asset. This is technical reconstruction material, not legal certification.

Final delivery must measure the root npm plus Darwin platform npm together at
no more than {Q7_BUDGETS['rootPlusDarwinPlatformMaxBytes']} bytes, each wheel at
no more than {Q7_BUDGETS['eachWheelMaxBytes']} bytes, and the installed closure
at no more than {Q7_BUDGETS['installedClosureMaxLogicalBytes']} logical bytes and
{Q7_BUDGETS['installedClosureMaxAllocatedBytes']} allocated bytes. These are
acceptance bars, not measurements of the source asset or future packages.
''')
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cohort', required=True, choices=('node', 'python'))
    parser.add_argument('--output', required=True, type=Path)
    relink_source = parser.add_mutually_exclusive_group(required=True)
    relink_source.add_argument('--relink-output', type=Path)
    relink_source.add_argument('--relink-reference', type=Path)
    parser.add_argument('--relink-archive', required=True, type=Path)
    arguments = parser.parse_args()
    output = arguments.output.resolve()
    delivery_cache = Path(
        os.environ.get('GEOSPEC_DELIVERY_CACHE', DEFAULT_DELIVERY_CACHE)
    ).resolve()
    mixed = select_mixed_build() if arguments.cohort == 'node' or os.environ.get('GEOSPEC_MIXED_RECEIPT') else None
    if mixed:
        require_mixed_dist(mixed)
        notice = (PACKAGE / 'NOTICE').read_text()
        require('historical A14 mixed Wasm artifact' not in notice
                and 'actual qualified A3' not in notice,
                'Update the source NOTICE artifact/prefix attribution before current mixed material generation')
        mixed['metadata'] = cargo_metadata('emscripten', mixed)
    new_directory(output)
    external_license_files = copy_external_licenses(
        arguments.cohort, output, delivery_cache
    )
    components, cargo_root = cargo_components(arguments.cohort, output)
    mixed_root = None
    if arguments.cohort == 'node':
        mixed_components, mixed_root = cargo_components('current-mixed', output, mixed['metadata'])
        components.extend(mixed_components)
        for source, relative in mixed_tool_licenses(mixed):
            if not mixed_runtime_license(relative):
                continue
            destination = output / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            external_license_files.append({'path': relative, 'sha256': digest(source),
                                           'bytes': source.stat().st_size})
    external = external_components(arguments.cohort, mixed if arguments.cohort == 'node' else None)
    if arguments.cohort == 'node':
        selected = read_json(PACKAGE / 'scripts/selected-delivery.json')
        for name, key, version, license_scope in [
            ('Rust mixed standard library and toolchain', 'rustPrefix', selected['rust']['commit'],
             'MIT OR Apache-2.0; bundled dependencies retain their own declarations'),
            ('Emscripten mixed SDK and runtime', 'sdkPrefix', selected['emscripten']['commit'],
             'MIT OR NCSA (Emscripten); bundled components retain their own declarations'),
        ]:
            external.append({'name': name, 'version': version, 'cohorts': ['current-mixed'],
                             'declaredLicense': license_scope,
                             'source': 'Selected tool archives and exact input closure in source-relink receipts',
                             'licenseFiles': [row['path'] for row in external_license_files
                                              if row['path'].startswith(f'mixed-tools/{key}/')],
                             'toolNoticesInAdjacentSourceKit': [
                                 {'path': f'materials/{relative}', 'sha256': digest(source)}
                                 for source, relative in mixed_tool_licenses(mixed)
                                 if relative.startswith(f'mixed-tools/{key}/')
                                 and not mixed_runtime_license(relative)],
                             'scope': 'Runtime/standard-library notices accompany npm; complete selected build-tool notices accompany the required adjacent source kit. No claim every support dependency is linked.'})
    write_notices(output, components, external)
    relink_archive = arguments.relink_archive.resolve()
    if arguments.relink_output:
        relink_directory = arguments.relink_output.resolve()
        make_relink_material(relink_directory, delivery_cache, arguments.cohort, mixed)
        make_relink_archive(relink_directory, relink_archive)
    else:
        relink_directory = arguments.relink_reference.resolve()
    if arguments.cohort == 'node':
        included = read_json(relink_directory / 'manifest.json')['mixedProducerRecipe']
        require(included['evidence'] == mixed['attribution']['evidence'],
                'Reused source kit belongs to a different mixed producer')
    source_relink = write_relink_receipt(output, relink_directory, relink_archive)
    material_files = [{
        'path': path.relative_to(output).as_posix(),
        'sha256': digest(path),
        'bytes': path.stat().st_size,
    } for path in walk_files(output)]
    write_json(output / 'components.json', {
        'schema': 'geospec-native-components-v1',
        'cohort': arguments.cohort,
        'target': TARGET,
        'rustToolchain': RUST_TOOLCHAIN,
        'cargoRoot': cargo_root,
        'cargoComponents': components,
        'externalComponents': external,
        'externalLicenseFiles': external_license_files,
        'materialFiles': material_files,
        'sourceRelink': source_relink,
        'currentMixedWasm': ({**mixed['attribution'], 'cargoRoot': mixed_root,
                              'dependencyGraphEvidence': 'Offline metadata with recorded tools/environment and content-verified source/lock inputs; reconstructed after build, not original metadata stdout.'}
                             if arguments.cohort == 'node' else None),
    })
    print(f'generated {arguments.cohort} delivery materials at {output}')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'delivery materials generation failed: {error}', file=sys.stderr)
        raise SystemExit(1) from error
