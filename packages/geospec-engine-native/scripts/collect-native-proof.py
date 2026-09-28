#!/usr/bin/env python3
"""Collect the existing CI Node build's contexts and ordinary producer identity.

Usage: python3 -B collect-native-proof.py ROOT INVOCATION_JSON OUTPUT_DIRECTORY NODE
Requires a successful owned build in a fresh Cargo target directory and its prefix.
Writes identity-source-proof.json; performs one Engine identity observation/close,
no geometry or persistence operations. Exit 1 on inconsistent or unverified inputs.
"""
import base64
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import sys


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def pin(path):
    return {'path': str(path), 'sha256': digest(path), 'bytes': path.stat().st_size}


def read(path):
    return json.loads(path.read_text())


def profile_frames(data):
    header = b'geospec-supported-cargo-profile-v2\0release-defaults\0'
    assert data.startswith(header), 'Unsupported profile context'
    marker = b'selected-manifest'
    offset = data.index(struct.pack('<Q', len(marker)) + marker)
    cargo_version = data[len(header):offset].decode()
    frames = []
    while data[offset:] != b'verified\0':
        length = struct.unpack_from('<Q', data, offset)[0]
        offset += 8
        label = data[offset:offset + length].decode()
        offset += length
        length = struct.unpack_from('<Q', data, offset)[0]
        offset += 8
        value = data[offset:offset + length]
        assert len(value) == length
        offset += length
        frames.append({'label': label, 'bytes': length, 'sha256': hashlib.sha256(value).hexdigest(),
                       'base64': base64.b64encode(value).decode()})
    return cargo_version, frames


def collect(root, invocation_path, output, node):
    package = root / 'packages/geospec-engine-native'
    invocation = read(invocation_path)
    assert invocation['exitCode'] == 0, 'Native build did not succeed'
    assert invocation['argv'] == ['pnpm', 'nx', 'run', 'geospec-engine-native:build-node']
    assert invocation['cwd'] == str(root)
    sources = {row['path']: row['sha256'] for row in invocation['source']['files']}
    for relative, expected in sources.items():
        assert digest(root / relative) == expected, f'Source changed: {relative}'
    target = Path(invocation['environment']['CARGO_TARGET_DIR'])
    candidates = list(target.glob('aarch64-apple-darwin/release/build/geospec-engine-native-runtime-*/out/producer_identity.rs'))
    assert len(candidates) == 1, 'Expected one runtime context from the fresh native build'
    directory = candidates[0].parent
    names = ['producer_identity.rs', 'producer_profile_context.bin', 'producer_context.bin']
    names += [f'producer_{component}_{kind}.bin' for component in ['core', 'csg', 'brep'] for kind in ['context', 'graph']]
    contexts = {name: directory / name for name in names}
    constants = contexts['producer_identity.rs'].read_text()
    assert 'VERIFIED: bool = true' in constants, 'Native producer identity is unverified'
    generated = {name.lower(): value for name, value in re.findall(r'pub const (CORE|CSG|BREP): &str = "([^"]+)";', constants)}
    assert len(generated) == 3
    prefix = Path(invocation['environment']['GEOSPEC_OCCT_PREFIX'])
    receipt_path = prefix.parent / 'prefix-receipt.json'
    receipt = read(receipt_path)
    builder = Path(invocation['prefixBuilder'])
    assert digest(builder) == receipt['builderSha256'], 'Actual prefix builder differs'
    for row in receipt['outputs']:
        assert digest(prefix / row['path']) == row['sha256'], row['path']
    config = prefix / 'lib/cmake/opencascade/OpenCASCADEConfig.cmake'
    toolkits = re.split(r'[;\s]+', config.read_text().split('set (OpenCASCADE_LIBRARIES ', 1)[1].split(')', 1)[0].strip())
    assert 'TKDESTEP' in toolkits
    external = [(f'linked-occt-archive/{index:04}-lib{toolkit}.a', prefix / 'lib' / f'lib{toolkit}.a')
                for index, toolkit in enumerate(toolkits)]
    headers = sorted(path for path in (prefix / 'include/opencascade').rglob('*') if path.is_file())
    assert headers
    external += [('installed-occt-header/' + path.relative_to(prefix / 'include/opencascade').as_posix(), path) for path in headers]
    build_source = package / 'native/runtime/build.rs'
    code = build_source.read_text()
    computed, graphs = {}, {}
    for component in ['core', 'csg', 'brep']:
        selection = re.search(r'let ' + component + r' = digest\(\s*package,\s*&\w+,\s*&\[(.*?)\]', code, re.S)
        assert selection, 'Runtime identity source layout changed; review collector'
        files = []
        for relative in re.findall(r'"([^"]+)"', selection[1]):
            path = package / relative
            assert path.exists(), relative
            files.extend([item for item in path.rglob('*') if item.is_file()] if path.is_dir() else [path])
        ordered = [(path.relative_to(package).as_posix(), path) for path in sorted(files)]
        ordered += external if component == 'brep' else []
        hasher = hashlib.sha256(b'geospec-producer-build-v2\0' + contexts[f'producer_{component}_context.bin'].read_bytes())
        for label, path in ordered:
            data, encoded = path.read_bytes(), label.encode()
            hasher.update(struct.pack('<Q', len(encoded)) + encoded + struct.pack('<Q', len(data)) + data)
        identity = 'sha256:' + hasher.hexdigest()
        assert identity == generated[component], f'{component} identity differs'
        computed[component] = {'identity': identity, 'files': len(ordered), 'matchesGenerated': True}
        graph = contexts[f'producer_{component}_graph.bin'].read_bytes()
        header = b'geospec-resolved-common-graph-v1\0'
        assert graph.startswith(header)
        fields = graph[len(header):].split(b'\0')
        assert fields.pop() == b'' and len(fields) % 5 == 0
        graphs[component] = [[field.decode() for field in fields[index:index + 5]] for index in range(0, len(fields), 5)]
    cargo_version, frames = profile_frames(contexts['producer_profile_context.bin'].read_bytes())
    common = contexts['producer_context.bin'].read_bytes()
    assert all(key + b'\0' + value + b'\0' in common for key, value in
               [(b'PROFILE', b'release'), (b'OPT_LEVEL', b'3'), (b'DEBUG', b'false')])
    addon = root / invocation['addon']['path']
    assert pin(addon)['sha256'] == invocation['addon']['sha256']
    observer = """const addon = process.argv[1];
const binding = require(addon);
const engine = new binding.Engine();
try { process.stdout.write(JSON.stringify({node:process.version, platform:process.platform, arch:process.arch,
resolvedAddon:require.resolve(addon), producer:JSON.parse(engine.cacheProducerIdentity().toString('utf8'))}) + '\\n'); }
finally { engine.close(); }
"""
    command = [str(node), '-e', observer, str(addon)]
    observation = subprocess.run(command, cwd=root, capture_output=True, timeout=30, check=False)
    output.mkdir(parents=True, exist_ok=False)
    (output / 'identity.stdout').write_bytes(observation.stdout)
    (output / 'identity.stderr').write_bytes(observation.stderr)
    assert observation.returncode == 0, observation.stderr
    observed = json.loads(observation.stdout)
    assert observed['platform'] == 'darwin' and observed['arch'] == 'arm64'
    assert observed['resolvedAddon'] == str(addon) and observed['producer']['verified']
    assert all(observed['producer'][key] == value for key, value in generated.items())
    assert digest(addon) == invocation['addon']['sha256']
    proof = {
        'head': invocation['source']['revision'], 'cargoVersion': cargo_version,
        'supportedProfile': {'PROFILE': 'release', 'OPT_LEVEL': '3', 'DEBUG': 'false', 'verified': True, 'frames': frames},
        'routes': {'node': {'argv': invocation['argv'], 'cwd': invocation['cwd'],
                            'environment': invocation['environment'], 'ownedTarget': invocation['ownedTarget'],
                            'resolvedGraphs': graphs}},
        'actualBuild': {'invocation': invocation, 'addon': pin(addon)},
        'generatedContext': {'files': [{**pin(path), 'base64': base64.b64encode(path.read_bytes()).decode()} for path in contexts.values()]},
        'actualPrefix': {'path': str(prefix), 'receipt': pin(receipt_path), 'retainedProducingBuilder': pin(builder),
                         'recordedBuilderSha256': receipt['builderSha256'], 'recordedPrefixCommand': receipt['command'],
                         'configuration': pin(config), 'toolkits': toolkits, 'installedHeadersHashed': len(headers)},
        'staticIdentityRecomputation': computed,
        'observedProducer': {'value': observed, 'argv': command, 'exitCode': observation.returncode, 'node': pin(node)},
        'comparisons': {'staticGeneratedObservedEqual': True, 'addonMatchesSelectedBuild': True},
        'actualLinkerInvocation': {'observedFinalDriver': None, 'reason': 'Collector retains build logs but does not parse compiler-driver invocations.'},
        'staticRecomputationMethod': {'collector': pin(Path(__file__).resolve()), 'runtimeBuildSource': pin(build_source),
                                    'protocol': 'build-v2 context and LE-u64 label/payload frames; source-declared roots and installed OCCT order'},
        'limitations': ['Ordinary identity observation only; no geometry, persistence, old-OS or security qualification.',
                        'Raw cargo-metadata stdout and final compiler-driver command are unobserved; actual serialized common graphs and contexts are embedded.',
                        'Invocation environment records the explicit producer overrides, not a complete process environment or secret-bearing CI environment.'],
    }
    (output / 'identity-source-proof.json').write_text(json.dumps(proof, indent=2) + '\n')
    return proof


if __name__ == '__main__':
    collect(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), Path(sys.argv[3]).resolve(), Path(sys.argv[4]).resolve())
