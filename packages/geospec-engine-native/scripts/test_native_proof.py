"""Positive, inert metadata check of the CI proof collector; never loads a product."""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-native-proof.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class NativeProofCheck(unittest.TestCase):
    def test_selected_build_contexts_are_embedded_and_observed_once(self):
        scratch = Path(__file__).resolve().parents[3] / 'out/tests/geospec-native-proof'
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as temporary:
            root = Path(temporary)
            package = root / 'packages/geospec-engine-native'

            def put(path, data):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data.encode() if isinstance(data, str) else data)
                return path

            source = put(package / 'rust/src/lib.rs', 'inert source')
            build = put(package / 'native/runtime/build.rs', '\n'.join(
                f'let {name} = digest(package, &context, &["rust/src"], &[]);' for name in ['core', 'csg', 'brep']))
            prefix = root / 'prefix/install'
            config = put(prefix / 'lib/cmake/opencascade/OpenCASCADEConfig.cmake', 'set (OpenCASCADE_LIBRARIES TKDESTEP)')
            archive = put(prefix / 'lib/libTKDESTEP.a', 'inert archive')
            header = put(prefix / 'include/opencascade/header.hxx', 'inert header')
            builder = put(root / 'builder.sh', 'inert actual builder')
            put(prefix.parent / 'prefix-receipt.json', json.dumps({
                'builderSha256': collector.digest(builder), 'outputs': [
                    {'path': str(path.relative_to(prefix)), 'sha256': collector.digest(path)} for path in [config, archive, header]],
                'command': ['inert builder command'],
            }))
            target = root / 'fresh-target'
            contexts = target / 'aarch64-apple-darwin/release/build/geospec-engine-native-runtime-fixture/out'
            manifest = b'inert consuming Cargo manifest'
            frame = struct.pack('<Q', len(b'selected-manifest')) + b'selected-manifest' + struct.pack('<Q', len(manifest)) + manifest
            put(contexts / 'producer_profile_context.bin', b'geospec-supported-cargo-profile-v2\0release-defaults\0cargo fixture' + frame + b'verified\0')
            put(contexts / 'producer_context.bin', b'PROFILE\0release\0OPT_LEVEL\0' + b'3\0DEBUG\0false\0')
            identities = {}
            for name in ['core', 'csg', 'brep']:
                context = (name + ' fixture context').encode()
                put(contexts / f'producer_{name}_context.bin', context)
                put(contexts / f'producer_{name}_graph.bin', b'geospec-resolved-common-graph-v1\0pkg\0version\0source\0checksum\0features\0')
                h = hashlib.sha256(b'geospec-producer-build-v2\0' + context)
                files = [('rust/src/lib.rs', source)]
                if name == 'brep':
                    files += [('linked-occt-archive/0000-libTKDESTEP.a', archive), ('installed-occt-header/header.hxx', header)]
                for label, path in files:
                    label, data = label.encode(), path.read_bytes()
                    h.update(struct.pack('<Q', len(label)) + label + struct.pack('<Q', len(data)) + data)
                identities[name] = 'sha256:' + h.hexdigest()
            put(contexts / 'producer_identity.rs', 'pub const VERIFIED: bool = true;\n' + '\n'.join(
                f'pub const {name.upper()}: &str = "{value}";' for name, value in identities.items()))
            addon = put(root / 'generated.node', 'inert addon; never import')
            node = put(root / 'node', 'inert executable; never run')
            invocation = {
                'exitCode': 0, 'argv': ['pnpm', 'nx', 'run', 'geospec-engine-native:build-node'], 'cwd': str(root),
                'source': {'revision': 'fixture', 'files': [{'path': str(path.relative_to(root)), 'sha256': collector.digest(path)} for path in [source, build]]},
                'environment': {'CARGO_TARGET_DIR': str(target), 'GEOSPEC_OCCT_PREFIX': str(prefix)},
                'prefixBuilder': str(builder), 'addon': {**collector.pin(addon), 'path': 'generated.node'}, 'ownedTarget': {'fixture': True},
            }
            job = put(root / 'invocation.json', json.dumps(invocation))
            observed = {'platform': 'darwin', 'arch': 'arm64', 'resolvedAddon': str(addon), 'producer': {'verified': True, **identities}}
            with patch.object(collector.subprocess, 'run', return_value=types.SimpleNamespace(
                    returncode=0, stdout=json.dumps(observed).encode(), stderr=b'')) as execute:
                proof = collector.collect(root, job, root / 'proof', node)
            self.assertEqual(execute.call_count, 1)
            self.assertEqual(execute.call_args.args[0][0:2], [str(node), '-e'])
            self.assertEqual(proof['routes']['node']['resolvedGraphs']['core'][0], ['pkg', 'version', 'source', 'checksum', 'features'])
            self.assertEqual(base64.b64decode(proof['supportedProfile']['frames'][0]['base64']), manifest)
            self.assertEqual(proof['actualPrefix']['receipt']['sha256'], collector.digest(prefix.parent / 'prefix-receipt.json'))
            self.assertTrue(proof['comparisons']['staticGeneratedObservedEqual'])
            self.assertIsNone(proof['actualLinkerInvocation']['observedFinalDriver'])


if __name__ == '__main__':
    unittest.main()
