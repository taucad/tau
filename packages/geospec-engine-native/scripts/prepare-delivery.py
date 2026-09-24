#!/usr/bin/env python3
"""Prepare the selected Darwin ARM64 delivery inputs; never build the engine.

Python 3.12+ standard library, curl, tar, Node 24+, CMake, Ninja and Xcode tools
are prerequisites. Native Rust 1.88.0 is selected through rustup.
Usage: python3 -B packages/geospec-engine-native/scripts/prepare-delivery.py STAGE
Stages: check (default, read-only), sources, tools, prefixes, inputs, verify.
Only explicit prefixes builds OCCT; tools may install the pinned SDK/Rust.
Optional env: GEOSPEC_DELIVERY_CACHE, GEOSPEC_DELIVERY_RUST_PREFIX,
GEOSPEC_DELIVERY_EMSDK_PREFIX (existing tools are read-only), GEOSPEC_OCCT_JOBS.
prefixes --reuse-prefix native|mixed verifies only that existing prefix; never builds it.
prefixes --build-prefix native|mixed prepares only that prefix; default prepares both.
Explicit reuse reserves mixedBuildReserve plus the source allowance if inputs are missing.
Optional GIT_CEILING_DIRECTORIES is preserved in the selected environment and checked exactly.
GEOSPEC_OCCT_PRODUCER_BUILDER selects preserved builder source for existing
prefix verification only; new prefixes always execute the current builder.
GEOSPEC_OCCT_PRODUCER_RECIPE selects original recipe bytes for a retained prefix;
new prefixes retain their recipe beside the receipt. Neither receipt is rewritten.
GEOSPEC_OCCT_SUPPORT_INPUTS selects a retained mixed-inputs.json for validating
legacy SDK support rows before excluding the unused default Emscripten cache.
GEOSPEC_OCCT_JOBS defaults to 2; CARGO_BUILD_JOBS, EMCC_CORES and BINARYEN_CORES
default to that bound. All four scheduling controls must be positive integers.
GEOSPEC_GIT selects the exact Git executable, including verifier subprocesses.
All default paths derive from this checkout, with no Brain/spike dependency.
Exit: 0 success; 1 unavailable/not-ready/invalid; 2 argument error.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PACKAGE = ROOT / 'packages/geospec-engine-native'
RECIPE_PATH = PACKAGE / 'scripts/selected-delivery.json'
RECIPE = json.loads(RECIPE_PATH.read_text())
CACHE = Path(os.environ.get('GEOSPEC_DELIVERY_CACHE', ROOT / 'node_modules/.cache/geospec-engine-native/delivery-wasm-eh')).resolve()
RUST = Path(os.environ.get('GEOSPEC_DELIVERY_RUST_PREFIX', CACHE / 'rust')).resolve()
SDK = Path(os.environ.get('GEOSPEC_DELIVERY_EMSDK_PREFIX', CACHE / 'sdk/install')).resolve()
SOURCE = CACHE / 'sources/occt'
MIXED_PREFIX = 'occt-mixed-simd128'
MIXED = CACHE / MIXED_PREFIX / 'install'
MIXED_INPUTS = CACHE / 'mixed-inputs-simd128.json'
PACKAGE_SKIP = {'target', 'node_modules', '.git', '__pycache__', 'out-tsc'}
PREFIX_RECEIPT_SCHEMA = 'geospec-occt-prefix-receipt-v2'
PREFIX_CACHE_OUTPUTS = ('build/CMakeCache.txt', 'static-toolkit-closure.txt')
SCHEDULING_VARIABLES = ('GEOSPEC_OCCT_JOBS', 'CARGO_BUILD_JOBS', 'EMCC_CORES', 'BINARYEN_CORES')


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def run(command, environment=None, timeout=None):
    print('+ ' + ' '.join(map(str, command)), file=sys.stderr, flush=True)
    return subprocess.check_output(list(map(str, command)), cwd=ROOT, env=environment, text=True, timeout=timeout)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def files(directory, skipped=(), excluded=None):
    require(directory.is_dir(), f'Missing input directory: {directory}')
    result = set()
    seen = set()
    for parent, directories, names in os.walk(directory, followlinks=True):
        if Path(parent) == excluded:
            directories[:] = []
            continue
        physical = Path(parent).resolve()
        if physical in seen:
            directories[:] = []
            continue
        seen.add(physical)
        directories[:] = sorted(d for d in directories if d not in skipped)
        if Path(parent) == PACKAGE / 'bindings/emscripten':
            directories[:] = [d for d in directories if d != 'generated']
        for name in names:
            if name != '.DS_Store':
                path = Path(parent) / name
                if path.is_file():
                    result.add(path.absolute())
    return result


def unused_sdk_cache(env):
    """Only the explicit external cache route can exclude the SDK default cache."""
    unused = SDK / 'emscripten/cache'
    for key in ['EM_CACHE', 'EM_CONFIG']:
        value = env.get(key, '')
        require(value and Path(value).is_absolute(), f'Explicit absolute {key} required')
        selected = Path(value).resolve()
        require(not selected.is_relative_to(unused.resolve()) and
                not unused.resolve().is_relative_to(selected), f'{key} overlaps default SDK cache')
    return unused


def support_payload(roots, excluded=None, recorded=None):
    records = []
    selected_roots = {}
    for name, directory in sorted(roots.items()):
        root = Path(directory).resolve()
        selected_roots[name] = str(root)
        paths = files(root, excluded=excluded) if recorded is None else {
            path for path in recorded if path.is_relative_to(root) and
            (excluded is None or not path.is_relative_to(excluded))
        }
        records.extend({
            'path': f'{name}/{path.relative_to(root).as_posix()}',
            'sha256': digest(path) if recorded is None else recorded[path],
        } for path in sorted(paths))
    encoded = json.dumps(records, sort_keys=True, separators=(',', ':')).encode()
    return {
        'roots': selected_roots,
        'files': len(records),
        'sha256': hashlib.sha256(encoded).hexdigest(),
        **({'schema': 'geospec-sdk-support-v2', 'excludedDefaultCache': str(excluded)}
           if excluded is not None else {}),
    }


def download(name, item):
    archive = CACHE / 'downloads' / name
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        temporary = archive.with_suffix(archive.suffix + '.partial')
        run(['curl', '--fail', '--location', '--retry', '2', '--output', temporary, item['url']])
        require(digest(temporary) == item['sha256'], f'Archive hash mismatch: {name}')
        temporary.replace(archive)
    require(digest(archive) == item['sha256'], f'Archive hash mismatch: {archive}')
    return archive


def unpack(archive, destination):
    if destination.exists():
        verify_tree(archive, destination)
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='extract-', dir=destination.parent) as temporary:
        staging = Path(temporary)
        with tarfile.open(archive) as source:
            source.extractall(staging, filter='data')
        children = list(staging.iterdir())
        require(len(children) == 1 and children[0].is_dir(), f'Expected one archive root: {archive}')
        children[0].rename(destination)


def verify_tree(archive, destination):
    expected = set()
    with tarfile.open(archive) as source:
        for member in source:
            relative = Path(*Path(member.name).parts[1:])
            path = destination / relative
            if member.isfile():
                expected.add(path.absolute())
                require(path.is_file(), f'Missing archive member: {path}')
                with source.extractfile(member) as stream:
                    require(digest(path) == hashlib.file_digest(stream, 'sha256').hexdigest(), f'Changed archive member: {path}')
            elif member.issym():
                expected.add(path.absolute())
                require(path.is_symlink() and os.readlink(path) == member.linkname, f'Changed symlink: {path}')
    require(files(destination) == expected, f'Unexpected files in extracted source: {destination}')


def room(stage):
    available = shutil.disk_usage(ROOT).free
    if stage == 'reuse-prefix':
        # Verification does not allocate a new OCCT build tree. Missing source
        # archives/trees still need their selected allowance before preparation.
        sources = {'occt': SOURCE, **{name: CACHE / 'sources' / name for name in RECIPE['headers']}}
        missing = any(not directory.is_dir() or not (CACHE / 'downloads' / f'{name}.tar.gz').is_file()
                      for name, directory in sources.items())
        required_gib = RECIPE['diskGiB']['mixedBuildReserve'] + (RECIPE['diskGiB']['sources'] if missing else 0)
    else:
        reserve = RECIPE['diskGiB']['mixedBuildReserve'] if stage == 'prefixes' else 0
        required_gib = RECIPE['diskGiB'][stage] + reserve
    required = required_gib * 1024 ** 3
    require(available >= required, f'{stage} requires {required} free bytes; available {available}')


def prepare_sources():
    room('sources')
    occt = RECIPE['occt']
    tracked = json.loads((PACKAGE / 'native/occt/source-manifest.json').read_text())
    require(occt['sha256'] == tracked['archiveSha256'] and occt['commit'] == tracked['commit'], 'OCCT recipe differs from tracked source pin')
    archive = CACHE / 'downloads/occt.tar.gz'
    # Reuse only exact archive bytes; do not modify the historical extracted tree.
    seed = ROOT / f"node_modules/.cache/geospec-engine-native/sources/occt-{occt['commit']}.tar.gz"
    if not archive.exists() and seed.is_file() and digest(seed) == occt['sha256']:
        archive.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(seed, archive)
    unpack(download('occt.tar.gz', occt), SOURCE)
    for name, item in RECIPE['headers'].items():
        unpack(download(name + '.tar.gz', item), CACHE / 'sources' / name)
    print(json.dumps({'sourceRoot': str(SOURCE), 'occtArchiveSha256': digest(archive),
                      'sources': {name: len(files(CACHE / 'sources' / name)) for name in ['occt', *RECIPE['headers']]}}))


def tool_paths():
    paths = {'rustc': RUST / 'bin/rustc', 'cargo': RUST / 'bin/cargo',
             'emcc': SDK / 'emscripten/emcc', 'emxx': SDK / 'emscripten/em++', 'emar': SDK / 'emscripten/emar'}
    for name in ['node', 'python3', 'cmake', 'ninja', 'xcrun', 'bash', 'git', 'rustup']:
        found = shutil.which(os.environ.get('GEOSPEC_GIT', 'git') if name == 'git' else name)
        require(found is not None, f'Missing prerequisite: {name}')
        paths[name] = Path(found).resolve()
    for name in ['llvm-readobj', 'llvm-objdump', 'wasm-ld', 'wasm-opt']:
        candidate = SDK / 'bin' / name
        if candidate.is_file():
            paths[name] = candidate
    return paths


def validate_tools(paths):
    for directory, selected in [(RUST, RECIPE['rust']), (SDK, RECIPE['emscripten'])]:
        for name, sha in selected['executables'].items():
            require((directory / name).is_file() and digest(directory / name) == sha, f'Unselected or missing tool: {directory / name}')
    version = run([paths['rustc'], '-vV'])
    require(RECIPE['rust']['commit'] in version, 'Wrong Rust commit')
    return version


def prepare_tools():
    room('tools')
    if 'GEOSPEC_DELIVERY_EMSDK_PREFIX' not in os.environ and not SDK.exists():
        archive = download('emscripten.tar.xz', RECIPE['emscripten'])
        unpack(archive, SDK)
    if 'GEOSPEC_DELIVERY_RUST_PREFIX' not in os.environ and not RUST.exists():
        # Official pinned component installers, not a moving rustup channel.
        staging = CACHE / 'rust-install'
        require(not staging.exists(), f'Incomplete install exists; inspect before removing: {staging}')
        staging.mkdir(parents=True)
        # Keep failed installer bytes inspectable; never bless a partial toolchain.
        for item in RECIPE['rust']['archives']:
            archive = download(item['url'].rsplit('/', 1)[1], item)
            with tempfile.TemporaryDirectory(dir=CACHE) as temporary:
                extracted = Path(temporary) / 'component'
                unpack(archive, extracted)
                run(['sh', extracted / 'install.sh', f'--prefix={staging}', '--disable-ldconfig'])
        staging.rename(RUST)
    paths = tool_paths()
    metadata = {'rustVersion': validate_tools(paths), 'rustPrefix': str(RUST), 'sdkPrefix': str(SDK),
                'sdkArchiveSha256': RECIPE['emscripten']['sha256'],
                'selectedToolHashes': 'verified', 'qualification': 'tools only',
                'tools': {name: {'path': str(path), 'sha256': digest(path)} for name, path in paths.items()},
                'inspectionTools': [name for name in ['llvm-readobj', 'llvm-objdump'] if name in paths]}
    write_json(CACHE / 'tool-metadata.json', metadata)
    print(json.dumps(metadata, indent=2))


def scheduling_environment():
    jobs = os.environ.get('GEOSPEC_OCCT_JOBS', '2')
    selected = {name: os.environ.get(name, jobs) for name in SCHEDULING_VARIABLES}
    for name, value in selected.items():
        require(re.fullmatch(r'[1-9][0-9]*', value) is not None, f'{name} must be a positive integer')
    return selected


def environment(paths, write_config=True):
    scheduling = scheduling_environment()
    config = CACHE / 'emscripten.config'
    text = '\n'.join(f'{key} = {str(value)!r}' for key, value in {
        'LLVM_ROOT': SDK / 'bin', 'BINARYEN_ROOT': SDK, 'EMSCRIPTEN_ROOT': SDK / 'emscripten',
        'NODE_JS': paths['node'], 'PYTHON': paths['python3'],
    }.items()) + '\n'
    if write_config:
        config.write_text(text)
    else:
        require(config.read_text() == text, 'Emscripten configuration changed')
    return {
        'PATH': os.pathsep.join(dict.fromkeys([str(p.parent) for p in paths.values()] + ['/usr/bin', '/bin', '/usr/sbin', '/sbin'])),
        'HOME': str(Path.home()), 'TMPDIR': str(CACHE / 'tmp'), 'LC_ALL': 'C',
        'CARGO_HOME': str(CACHE / 'cargo'), 'RUSTC': str(paths['rustc']),
        'EM_CONFIG': str(config), 'EM_CACHE': str(CACHE / 'em-cache'),
        'PYTHONDONTWRITEBYTECODE': '1',
        'GEOSPEC_GIT': str(paths['git']),
        **({'GIT_CEILING_DIRECTORIES': os.environ['GIT_CEILING_DIRECTORIES']}
           if 'GIT_CEILING_DIRECTORIES' in os.environ else {}),
        **scheduling,
    }


def libraries(prefix):
    config = prefix / 'lib/cmake/opencascade/OpenCASCADEConfig.cmake'
    match = re.search(r'set\s*\(OpenCASCADE_LIBRARIES\s+([^)]*)\)', config.read_text())
    require(match is not None, f'Missing OCCT library list: {config}')
    names = re.split(r'[;\s]+', match[1].strip())
    require('TKDESTEP' in names and len(set(names)) == len(names), 'Invalid OCCT toolkit closure')
    result = [prefix / 'lib' / f'lib{name}.a' for name in names]
    require(all(p.is_file() for p in result), 'Missing installed OCCT archive')
    return result


def prefix_context(paths, env):
    native_rust = Path(run([paths['rustup'], 'which', '--toolchain', RECIPE['nativeRust'], 'rustc'], env).strip()).resolve()
    require('rustc 1.88.0' in run([native_rust, '--version'], env), 'Native Rust 1.88.0 prerequisite is missing')
    compiler = {
        name: Path(run([paths['xcrun'], '--find', name], env).strip()).resolve()
        for name in ['clang', 'clang++']
    }
    sdk_path = Path(run([paths['xcrun'], '--sdk', 'macosx', '--show-sdk-path'], env).strip()).resolve()
    compiler_resource = Path(run([compiler['clang++'], '-print-resource-dir'], env).strip()).resolve()
    executables = {**paths, 'clang': compiler['clang'], 'clang++': compiler['clang++'], 'native-rustc': native_rust}
    tool_metadata = {
        'cmake': run([paths['cmake'], '--version'], env), 'ninja': run([paths['ninja'], '--version'], env),
        'nativeCompiler': run([compiler['clang++'], '--version'], env),
        'nativeRust': run([native_rust, '-vV'], env), 'appleSdk': str(sdk_path),
        'appleSdkVersion': run([paths['xcrun'], '--sdk', 'macosx', '--show-sdk-version'], env).strip(),
        'executables': {
            name: {'path': str(path), 'sha256': digest(path)}
            for name, path in sorted(executables.items())
        },
    }
    support_payloads = {
        'mixed': support_payload({
            'sdk/bin': SDK / 'bin',
            'sdk/emscripten': SDK / 'emscripten',
            'sdk/lib': SDK / 'lib',
        }, excluded=unused_sdk_cache(env)),
        'native': support_payload({
            'apple-sdk': sdk_path,
            'clang-resource': compiler_resource,
        }),
    }
    return {
        'compiler': compiler,
        'sdkPath': sdk_path,
        'supportPayloads': support_payloads,
        'toolMetadata': tool_metadata,
    }


def producer_builder():
    return Path(os.environ.get('GEOSPEC_OCCT_PRODUCER_BUILDER', PACKAGE / 'native/occt/build-occt.sh')).resolve()


def producer_recipe(prefix):
    retained = prefix / 'selected-delivery.json'
    return Path(os.environ.get('GEOSPEC_OCCT_PRODUCER_RECIPE',
                               retained if retained.is_file() else RECIPE_PATH)).resolve()


def prefix_sources(recipe, kind):
    # Header archives affect the mixed prefix through its explicit CMake paths.
    # Other effective recipe selections are already materialized in the contract.
    return {'occt': recipe['occt']['sha256'],
            'headers': {name: item['sha256'] for name, item in recipe['headers'].items()}
            if kind == 'mixed' else {}}


def prefix_contract(kind, paths, env, context, producing_builder=None):
    options = [f'-DCMAKE_C_COMPILER={context["compiler"]["clang"]}',
               f'-DCMAKE_CXX_COMPILER={context["compiler"]["clang++"]}',
               f'-DCMAKE_OSX_SYSROOT={context["sdkPath"]}',
               f'-DCMAKE_OSX_DEPLOYMENT_TARGET={RECIPE["macosDeploymentTarget"]}']
    if kind == 'mixed':
        require(RECIPE['wasmSimd'] == {'rustFlags': ['-C', 'target-feature=+simd128'],
                                      'cxxFlag': '-msimd128', 'linkFlag': '-msimd128'},
                'Unsupported fixed SIMD recipe')
        eh = ['-fwasm-exceptions', '-sWASM_LEGACY_EXCEPTIONS=1', '-sSUPPORT_LONGJMP=wasm']
        require(RECIPE['wasmEh'] == {'compileFlags': eh, 'linkFlags': eh},
                'Unsupported native WASM EH recipe')
        require(all(any(option.startswith(flag) and all(selected in option.split('=', 1)[1].split()
                                                      for selected in ['-msimd128', *eh])
                        for option in RECIPE['mixedOcctOptions'])
                    for flag in ('-DCMAKE_C_FLAGS=', '-DCMAKE_CXX_FLAGS=')),
                'OCCT C and C++ must compile with fixed SIMD and native WASM EH')
        require(not any(incompatible in option.split('=', 1)[1].split()
                        for option in RECIPE['mixedOcctOptions'] if option.startswith('-DCMAKE_C')
                        for incompatible in ('-fexceptions', '-sDISABLE_EXCEPTION_CATCHING=0',
                                             '-sSUPPORT_LONGJMP=emscripten')),
                'OCCT native WASM EH cannot mix with JavaScript EH or longjmp')
        options = RECIPE['mixedOcctOptions'] + [
            f'-DCMAKE_TOOLCHAIN_FILE={SDK}/emscripten/cmake/Modules/Platform/Emscripten.cmake',
            f'-DCMAKE_CROSSCOMPILING_EMULATOR={paths["node"]}',
            f'-D3RDPARTY_RAPIDJSON_DIR={CACHE}/sources/rapidjson',
            f'-D3RDPARTY_RAPIDJSON_INCLUDE_DIR={CACHE}/sources/rapidjson/include',
            f'-D3RDPARTY_FREETYPE_DIR={CACHE}/sources/freetype',
            f'-D3RDPARTY_FREETYPE_INCLUDE_DIR_freetype2={CACHE}/sources/freetype/include',
            f'-D3RDPARTY_FREETYPE_INCLUDE_DIR_ft2build={CACHE}/sources/freetype/include',
        ]
    builder = PACKAGE / 'native/occt/build-occt.sh'
    selected_environment = {
        **env,
        'GEOSPEC_GIT': str(paths['git']),
        'GEOSPEC_OCCT_SOURCE': str(SOURCE),
        'GEOSPEC_OCCT_ARCHIVE': str(CACHE / 'downloads/occt.tar.gz'),
    }
    if kind == 'native':
        selected_environment['MACOSX_DEPLOYMENT_TARGET'] = RECIPE['macosDeploymentTarget']
    return {
        'schema': PREFIX_RECEIPT_SCHEMA,
        'kind': kind,
        'recipeSha256': digest(RECIPE_PATH),
        # Evidence can retain old bytes from the recorded command path. It does
        # not replace that command or exempt any other producer/output field.
        'builderSha256': digest(producing_builder or builder),
        'command': list(map(str, [paths['bash'], builder, *options])),
        'environment': selected_environment,
        'supportPayload': context['supportPayloads'][kind],
        'toolMetadata': context['toolMetadata'],
        'sourceArchiveSha256': digest(CACHE / 'downloads/occt.tar.gz'),
    }


def create_prefix_receipt(prefix, contract):
    install = prefix / 'install'
    outputs = sorted(files(install))
    return {
        **contract,
        'cacheOutputs': {relative: digest(prefix / relative) for relative in PREFIX_CACHE_OUTPUTS},
        'outputs': [
            {'path': path.relative_to(install).as_posix(), 'sha256': digest(path)}
            for path in outputs
        ],
    }


def migrate_sdk_support(prefix, receipt, contract, evidence_input):
    """Validate a historical aggregate, never replace its receipt or claim a rebuild."""
    require(evidence_input is not None, 'Legacy SDK support requires GEOSPEC_OCCT_SUPPORT_INPUTS')
    if isinstance(evidence_input, dict):
        require(evidence_input.get('schema') == 'geospec-sdk-support-migration-v2',
                'Unsupported carried SDK support migration')
        evidence = evidence_input['supportEvidence']
        require(evidence.get('schema') == 'geospec-sdk-support-evidence-v1', 'Unsupported carried SDK support evidence')
        reference = evidence_input['evidence']
        require(Path(reference['path']).is_absolute() and
                re.fullmatch(r'[0-9a-f]{64}', reference['sha256']) is not None,
                'Invalid original SDK evidence reference')
    else:
        evidence_path = Path(evidence_input)
        require(evidence_path.is_absolute(), 'SDK support evidence must be absolute')
        require(evidence_path.resolve() != MIXED_INPUTS.resolve(),
                'Retain support evidence outside the current manifest')
        evidence = json.loads(evidence_path.read_text())
        require(evidence.get('schema') == 'geospec-mixed-build-inputs-v2', 'Unsupported SDK support evidence')
        reference = {'path': str(evidence_path), 'sha256': digest(evidence_path)}
    for key in ['EM_CACHE', 'EM_CONFIG']:
        require(receipt['environment'].get(key) == contract['environment'].get(key) ==
                evidence['environment'].get(key), f'SDK support evidence {key} differs')
    excluded = unused_sdk_cache(receipt['environment'])
    require(excluded == unused_sdk_cache(contract['environment']), 'SDK default cache differs')
    expected = contract['supportPayload']
    require(receipt['supportPayload'].get('roots') == expected['roots'] and
            evidence.get('sdkPrefix') == str(SDK), 'Historical SDK support roots differ')
    recorded = {}
    for row in evidence['inputs']:
        path = Path(row['path'])
        require(path.is_absolute() and '..' not in path.parts and str(path) == row['path'] and
                path not in recorded, 'Invalid or duplicate SDK evidence input')
        require(re.fullmatch(r'[0-9a-f]{64}', row['sha256']) is not None, 'Invalid SDK evidence digest')
        recorded[path] = row['sha256']
    receipt_path = prefix / 'prefix-receipt.json'
    require(recorded.get(receipt_path) == digest(receipt_path), 'SDK evidence prefix receipt hash differs')
    config = Path(contract['environment']['EM_CONFIG'])
    require(recorded.get(config) == digest(config), 'SDK evidence configuration bytes differ')
    original = support_payload(expected['roots'], recorded=recorded)
    require(original == receipt['supportPayload'], 'Historical SDK support aggregate differs')
    projected = support_payload(expected['roots'], excluded, recorded)
    require(projected == expected, 'Projected SDK support membership or bytes differ')
    # Carry only the authenticated support rows and the two required context pins,
    # not the unrelated historical source/tool inputs. The full original manifest
    # digest remains provenance; the immutable prefix aggregate authenticates rows.
    carried_paths = {path for path in recorded if any(path.is_relative_to(root) for root in expected['roots'].values())}
    carried_paths.update([receipt_path, config])
    carried = {
        'schema': 'geospec-sdk-support-evidence-v1', 'sdkPrefix': evidence['sdkPrefix'],
        'environment': {key: evidence['environment'][key] for key in ['EM_CACHE', 'EM_CONFIG']},
        'inputs': [{'path': str(path), 'sha256': recorded[path]} for path in sorted(carried_paths)],
    }
    return {
        'schema': 'geospec-sdk-support-migration-v2', 'prefixRebuilt': False,
        'originalReceipt': {'path': str(receipt_path), 'sha256': digest(receipt_path)},
        'evidence': reference, 'supportEvidence': carried,
        'originalSupport': original, 'effectiveSupport': projected,
        'excludedFiles': original['files'] - projected['files'],
        'selectedCache': contract['environment']['EM_CACHE'],
    }


def verify_prefix(prefix, contract, recipe_path=None, support_inputs=None):
    receipt_path = prefix / 'prefix-receipt.json'
    require(receipt_path.is_file(), f'Missing prefix receipt: {receipt_path}')
    receipt = json.loads(receipt_path.read_text())
    recipe_path = recipe_path or producer_recipe(prefix)
    require(recipe_path.is_file() and digest(recipe_path) == receipt.get('recipeSha256'),
            f'Original prefix recipe bytes required: {recipe_path}')
    recorded_recipe = json.loads(recipe_path.read_text())
    require(prefix_sources(recorded_recipe, contract['kind']) == prefix_sources(RECIPE, contract['kind']),
            f'Prefix source selection changed: {prefix}')
    migration = None
    for name, expected in contract.items():
        if name == 'recipeSha256':
            # Historical provenance is checked above. Compatibility uses every
            # effective field, including source selections absent from old receipts.
            continue
        actual = receipt.get(name)
        if (name == 'supportPayload' and contract['kind'] == 'mixed' and
                receipt.get('schema') == PREFIX_RECEIPT_SCHEMA and
                isinstance(actual, dict) and 'schema' not in actual and
                expected.get('schema') == 'geospec-sdk-support-v2'):
            migration = migrate_sdk_support(prefix, receipt, contract,
                                            support_inputs or os.environ.get('GEOSPEC_OCCT_SUPPORT_INPUTS'))
            continue
        if name == 'environment':
            # Scheduling changes physical work only. Keep recorded values intact;
            # every non-scheduling environment value still requires exact equality.
            for environment_values in [actual, expected]:
                require(isinstance(environment_values, dict), f'Missing prefix environment: {prefix}')
                for variable in SCHEDULING_VARIABLES:
                    if variable in environment_values:
                        require(re.fullmatch(r'[1-9][0-9]*', environment_values[variable]) is not None,
                                f'{variable} must be a positive integer')
            actual = {key: value for key, value in actual.items() if key not in SCHEDULING_VARIABLES}
            expected = {key: value for key, value in expected.items() if key not in SCHEDULING_VARIABLES}
        require(actual == expected, f'Prefix receipt {name} changed: {prefix}')
    cache_outputs = receipt.get('cacheOutputs')
    require(isinstance(cache_outputs, dict) and set(cache_outputs) == set(PREFIX_CACHE_OUTPUTS),
            f'Prefix receipt cache outputs changed: {prefix}')
    for relative in PREFIX_CACHE_OUTPUTS:
        sha = cache_outputs[relative]
        path = prefix / relative
        require(path.is_file() and digest(path) == sha, f'Changed prefix cache output: {path}')
    install = prefix / 'install'
    toolkit_inventory = (prefix / 'static-toolkit-closure.txt').read_text().splitlines()
    toolkit_paths = [Path(relative) for relative in toolkit_inventory]
    require(all(not path.is_absolute() and '..' not in path.parts for path in toolkit_paths),
            f'Invalid prefix toolkit inventory path: {prefix}')
    expected_toolkits = sorted(
        path.relative_to(install).as_posix()
        for path in (install / 'lib').glob('libTK*.a')
        if path.is_file()
    )
    require(toolkit_inventory == expected_toolkits, f'Prefix toolkit inventory changed: {prefix}')
    recorded = {}
    for item in receipt['outputs']:
        relative = Path(item['path'])
        require(not relative.is_absolute() and '..' not in relative.parts, f'Invalid prefix output path: {relative}')
        require(relative not in recorded, f'Duplicate prefix output path: {relative}')
        recorded[relative] = item['sha256']
    actual = {path.relative_to(install): digest(path) for path in files(install)}
    require(actual == recorded, f'Installed prefix outputs changed: {prefix}')
    return {**receipt, 'supportMigration': migration} if migration else receipt


def prepare_prefix(kind, paths, env, context):
    destination = CACHE / (MIXED_PREFIX if kind == 'mixed' else 'occt-native')
    contract = prefix_contract(kind, paths, env, context)
    if destination.exists():
        verify_prefix(destination, prefix_contract(kind, paths, env, context, producer_builder()))
        print(f'✓ Reused verified OCCT {kind} prefix: {destination}')
        return
    attempt = CACHE / ('.occt-mixed-simd128-attempt' if kind == 'mixed' else '.occt-native-attempt')
    require(not attempt.exists(), f'Incomplete prefix attempt exists; inspect before removing: {attempt}')
    attempt.mkdir()
    build_env = {
        **contract['environment'],
        'GEOSPEC_OCCT_CACHE': str(attempt),
        **scheduling_environment(),
    }
    print('+ ' + ' '.join(contract['command']), file=sys.stderr, flush=True)
    subprocess.run(contract['command'], cwd=ROOT, env=build_env, check=True)
    shutil.copyfile(RECIPE_PATH, attempt / 'selected-delivery.json')
    write_json(attempt / 'prefix-receipt.json', create_prefix_receipt(attempt, contract))
    verify_prefix(attempt, contract, attempt / 'selected-delivery.json')
    require(not destination.exists(), f'Prefix destination appeared during build: {destination}')
    attempt.rename(destination)
    verify_prefix(destination, contract, destination / 'selected-delivery.json')
    print(f'✓ Promoted verified OCCT {kind} prefix: {destination}')


def prepare_prefixes(paths, env, reuse_prefix=None, build_prefix=None):
    room('reuse-prefix' if reuse_prefix is not None else 'prefixes')
    prepare_sources()
    context = prefix_context(paths, env)
    if reuse_prefix is not None:
        prefix = CACHE / (MIXED_PREFIX if reuse_prefix == 'mixed' else 'occt-native')
        verify_prefix(prefix, prefix_contract(reuse_prefix, paths, env, context, producer_builder()))
        print(f'✓ Reused verified OCCT {reuse_prefix} prefix: {prefix}')
        return
    for kind in [build_prefix] if build_prefix is not None else ['native', 'mixed']:
        prepare_prefix(kind, paths, env, context)


def source_files():
    result = {RECIPE_PATH, Path(__file__).resolve(), PACKAGE / 'scripts/build-mixed-wasm.mts'}
    for name in ['rust', 'native', 'bindings/emscripten']:
        result.update(files(PACKAGE / name, PACKAGE_SKIP))
    # Cargo can read ancestor config even with an isolated CARGO_HOME.
    for parent in [ROOT, *ROOT.parents, PACKAGE, PACKAGE / 'bindings', PACKAGE / 'bindings/emscripten']:
        for name in ['config', 'config.toml']:
            path = parent / '.cargo' / name
            require(not path.exists(), f'Unselected Cargo configuration: {path}; selected build uses explicit tools/flags')
    return result


def required_inputs(manifest):
    required = source_files()
    for directory in manifest['inputRoots']:
        excluded = unused_sdk_cache(manifest['environment']) if Path(directory) == SDK / 'emscripten' else None
        required.update(files(Path(directory), excluded=excluded))
    required.update(Path(p) for p in manifest['tools'].values())
    required.update(Path(p) for p in manifest['libraries'])
    required.add(Path(manifest['environment']['EM_CONFIG']))
    required.add(Path(manifest['prefixProducerBuilder']))
    required.add(CACHE / MIXED_PREFIX / 'prefix-receipt.json')
    required.add(Path(manifest['prefixProducerRecipe']))
    required.add(CACHE / 'tool-metadata.json')
    for name in ['config', 'config.toml']:
        configuration = CACHE / 'cargo' / name
        require(not configuration.exists(), f'Unselected Cargo configuration: {configuration}')
    return required


def input_roots():
    return [RUST, SDK / 'bin', SDK / 'lib', SDK / 'emscripten', MIXED,
            CACHE / 'cargo/registry/src', CACHE / 'em-cache',
            *[CACHE / 'sources' / name for name in ['occt', *RECIPE['headers']]]]


def prepare_inputs(paths, env):
    prepare_sources()
    context = prefix_context(paths, env)
    producing_builder = producer_builder()
    recipe_path = producer_recipe(CACHE / MIXED_PREFIX)
    receipt = verify_prefix(CACHE / MIXED_PREFIX,
                            prefix_contract('mixed', paths, env, context, producing_builder), recipe_path)
    prefix_recovery = {'mixed': receipt.get('recovery')}
    # The standalone runtime build script also reads its own locked graph for
    # producer identity, independently of the consuming Emscripten binding.
    for relative in ['bindings/emscripten/Cargo.toml', 'native/runtime/Cargo.toml']:
        cargo_manifest = PACKAGE / relative
        run([paths['cargo'], 'fetch', '--locked', '--manifest-path', cargo_manifest], env)
        metadata = json.loads(run([paths['cargo'], 'metadata', '--locked', '--offline', '--format-version', '1', '--manifest-path', cargo_manifest], env))
        for dependency in metadata['packages']:
            path = Path(dependency['manifest_path']).resolve()
            require(path.is_relative_to(PACKAGE) or path.is_relative_to(CACHE / 'cargo/registry/src'),
                    f'Cargo dependency outside the recorded source roots: {path}')
    # Registry source and archive checksums are verified by Cargo's locked fetch.
    manifest = {
        'schema': 'geospec-mixed-build-inputs-v3', 'sourceRoot': str(ROOT),
        'output': str(PACKAGE / 'bindings/emscripten/generated'), 'cache': str(CACHE / 'mixed-build-simd128'),
        'preparationCache': str(CACHE), 'rustPrefix': str(RUST), 'sdkPrefix': str(SDK),
        'tools': {name: str(path) for name, path in paths.items()},
        **{name: str(paths[name]) for name in ['rustc', 'cargo', 'emcc', 'emxx', 'emar']},
        'environment': env, 'occtPrefix': str(MIXED), 'libraries': list(map(str, libraries(MIXED))),
        'prefixProducerBuilder': str(producing_builder), 'prefixRecovery': prefix_recovery,
        'sdkSupport': context['supportPayloads']['mixed'],
        'prefixSupportMigration': receipt.get('supportMigration'),
        'prefixProducerRecipe': str(recipe_path),
        'inputRoots': list(map(str, input_roots())), 'linkOptimization': RECIPE['linkOptimization'],
        'wasmSimd': RECIPE['wasmSimd'], 'wasmEh': RECIPE['wasmEh'],
        'recipeSha256': digest(RECIPE_PATH),
        'sourceRevision': run([paths['git'], '-C', ROOT, 'rev-parse', 'HEAD'], env, timeout=30).strip(),
        'qualification': 'Prepared build inputs only; bound prefix recovery qualifications remain applicable. Not built or runtime qualified.',
    }
    manifest['inputs'] = [{'path': str(p), 'sha256': digest(p)} for p in sorted(required_inputs(manifest))]
    path = MIXED_INPUTS
    write_json(path, manifest)
    verify_manifest(path)
    print(f'GEOSPEC_MIXED_INPUTS={path}')
    print(f'GEOSPEC_OCCT_PREFIX={MIXED}')


def verify_manifest(path):
    manifest = json.loads(path.read_text())
    paths = tool_paths()
    selected_environment = environment(paths, write_config=False)
    require(manifest['schema'] == 'geospec-mixed-build-inputs-v3', 'Prepare v3 SIMD inputs with this checkout')
    require(manifest['sourceRoot'] == str(ROOT), 'Closure sourceRoot must be this checkout')
    require(manifest['tools'] == {name: str(p) for name, p in paths.items()}, 'Selected tools differ')
    rows = manifest['inputs']
    selected = {Path(row['path']): row['sha256'] for row in rows}
    require(len(rows) == len(selected), 'Duplicate closure input')
    require(paths['git'] in selected and digest(paths['git']) == selected[paths['git']], 'Recorded Git bytes changed')
    revision = run([paths['git'], '-C', ROOT, 'rev-parse', 'HEAD'], selected_environment, timeout=30).strip()
    require(manifest['sourceRevision'] == revision, 'Source revision changed; regenerate inputs after freeze')
    require(manifest['recipeSha256'] == digest(RECIPE_PATH), 'Selected recipe changed')
    require(manifest['preparationCache'] == str(CACHE), 'Preparation cache differs; use GEOSPEC_DELIVERY_CACHE')
    require(manifest['rustPrefix'] == str(RUST) and manifest['sdkPrefix'] == str(SDK), 'Tool prefixes differ from preparation')
    require(manifest['output'] == str(PACKAGE / 'bindings/emscripten/generated'), 'Wrong current-source output')
    require(manifest['cache'] == str(CACHE / 'mixed-build-simd128'), 'Wrong isolated build cache')
    require(manifest['linkOptimization'] == RECIPE['linkOptimization'], 'Wrong selected link profile')
    require(manifest['wasmSimd'] == RECIPE['wasmSimd'], 'Wrong fixed SIMD flags')
    require(manifest['wasmEh'] == RECIPE['wasmEh'], 'Wrong native WASM EH flags')
    require(manifest['occtPrefix'] == str(MIXED), 'Wrong mixed prefix')
    require(manifest['libraries'] == list(map(str, libraries(MIXED))), 'Selected libraries differ from installed CMake closure')
    require(manifest['inputRoots'] == list(map(str, input_roots())), 'Input roots were reduced')
    require(manifest['environment'] == selected_environment, 'Build environment differs from selected preparation')
    validate_tools(paths)
    for name in ['rustc', 'cargo', 'emcc', 'emxx', 'emar']:
        require(manifest[name] == str(paths[name]), f'Uncovered tool: {name}')
    require(set(selected) == required_inputs(manifest), 'Closure omits or adds source/tool/library inputs; regenerate after source freeze')
    for file, sha in selected.items():
        require(digest(file) == sha, f'Build input changed: {file}')
    producing_builder = Path(manifest['prefixProducerBuilder'])
    require(producing_builder.is_absolute(), 'Prefix producer evidence path must be absolute')
    context = prefix_context(paths, selected_environment)
    recipe_path = Path(manifest['prefixProducerRecipe'])
    require(recipe_path.is_absolute(), 'Prefix recipe evidence path must be absolute')
    receipt = verify_prefix(CACHE / MIXED_PREFIX,
                            prefix_contract('mixed', paths, selected_environment, context, producing_builder), recipe_path,
                            manifest.get('prefixSupportMigration'))
    require(manifest.get('sdkSupport') == context['supportPayloads']['mixed'], 'SDK support policy or bytes changed')
    require(manifest.get('prefixSupportMigration') == receipt.get('supportMigration'), 'SDK support migration changed')
    prefix_recovery = {'mixed': receipt.get('recovery')}
    require(manifest['prefixRecovery'] == prefix_recovery, 'Prefix recovery qualifications changed')
    print(json.dumps({'verifiedInputs': len(selected), 'sourceRoot': str(ROOT), 'output': manifest['output']}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', nargs='?', default='check', choices=['check', 'sources', 'tools', 'prefixes', 'inputs', 'verify'])
    parser.add_argument('--manifest', type=Path)
    prefix_selection = parser.add_mutually_exclusive_group()
    prefix_selection.add_argument('--reuse-prefix', choices=['native', 'mixed'])
    prefix_selection.add_argument('--build-prefix', choices=['native', 'mixed'])
    args = parser.parse_args()
    require(args.reuse_prefix is None or args.stage == 'prefixes', '--reuse-prefix requires the prefixes stage')
    require(args.build_prefix is None or args.stage == 'prefixes', '--build-prefix requires the prefixes stage')
    require(sys.version_info >= (3, 12), 'Python 3.12+ required for safe archive extraction')
    require(platform.system() == 'Darwin' and platform.machine() == 'arm64', 'Selected recipe is Darwin ARM64 only')
    if args.stage == 'check':
        required = [SOURCE / 'CMakeLists.txt', RUST / 'bin/rustc', SDK / 'emscripten/emcc',
                    MIXED / 'lib/libTKDESTEP.a', MIXED_INPUTS]
        missing = [str(p) for p in required if not p.is_file()]
        if not missing:
            verify_manifest(MIXED_INPUTS)
        tools_missing = not (RUST / 'bin/rustc').is_file() or not (SDK / 'emscripten/emcc').is_file()
        prefixes_missing = not (MIXED / 'lib/libTKDESTEP.a').is_file()
        remaining = RECIPE['diskGiB']['mixedBuildReserve'] + (RECIPE['diskGiB']['sources'] if not SOURCE.is_dir() else 0)
        remaining += RECIPE['diskGiB']['tools'] if tools_missing else 0
        remaining += RECIPE['diskGiB']['prefixes'] if prefixes_missing else 0
        print(json.dumps({'recipe': str(RECIPE_PATH), 'sourceRoot': str(ROOT), 'output': str(PACKAGE / 'bindings/emscripten/generated'),
                          'freeBytes': shutil.disk_usage(ROOT).free, 'stageFreeGiB': RECIPE['diskGiB'], 'missing': missing,
                          'remainingConservativeGiB': remaining, 'diskReady': shutil.disk_usage(ROOT).free >= remaining * 1024 ** 3,
                          'ready': not missing and shutil.disk_usage(ROOT).free >= remaining * 1024 ** 3,
                          'note': 'Missing inputs are not ready; when present, verify enforces hashes. prefixes is an explicit heavy stage.'}, indent=2))
        return 1 if missing or shutil.disk_usage(ROOT).free < remaining * 1024 ** 3 else 0
    if args.stage == 'verify':
        verify_manifest(args.manifest or MIXED_INPUTS)
        return 0
    CACHE.mkdir(parents=True, exist_ok=True)
    if args.stage == 'sources':
        prepare_sources()
    elif args.stage == 'tools':
        prepare_tools()
    else:
        paths = tool_paths()
        validate_tools(paths)
        (CACHE / 'tmp').mkdir(exist_ok=True)
        env = environment(paths)
        if args.stage == 'prefixes':
            prepare_prefixes(paths, env, args.reuse_prefix, args.build_prefix)
        else:
            prepare_inputs(paths, env)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(f'Delivery preparation failed: {error}', file=sys.stderr)
        sys.exit(1)
