#!/usr/bin/env python3
"""Pure host checks for the selected native deployment floor; no build or product load.

Usage: python3 -B packages/geospec-engine-native/scripts/test_deployment_target.py
Exit: 0 success; 1 assertion failure. Tool discovery and execution are mocked.
"""

import ast
from contextlib import ExitStack
from copy import deepcopy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import call, patch


SCRIPTS = Path(__file__).resolve().parent


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


prepare = load_script('prepare-delivery')
materials = load_script('generate-delivery-materials')


class DeploymentTargetTest(unittest.TestCase):
    def test_should_verify_relocated_mixed_sources_without_relabeling_external_inputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'consumer'
            package = root / 'packages/geospec-engine-native'
            source = package / 'rust/src/lib.rs'
            source.parent.mkdir(parents=True)
            source.write_bytes(b'original producer source')
            external = Path(temporary) / 'tool.bin'
            external.write_bytes(b'original tool')
            producer_root = Path(temporary) / 'producer'
            recorded_source = producer_root / 'packages/geospec-engine-native/rust/src/lib.rs'
            closure = {'sourceRoot': str(producer_root), 'inputs': [
                {'path': str(recorded_source), 'sha256': materials.digest(source)},
                {'path': str(external), 'sha256': materials.digest(external)},
            ]}
            with patch.object(materials, 'ROOT', root), patch.object(materials, 'PACKAGE', package):
                self.assertEqual(materials.current_mixed_source(closure, recorded_source), source)
                self.assertEqual(materials.current_mixed_source(closure, external), external)
                self.assertEqual(len(materials.verify_mixed_source_inputs(closure)), 2)
                source.write_bytes(b'changed source')
                with self.assertRaisesRegex(ValueError, 'Mixed input changed'):
                    materials.verify_mixed_source_inputs(closure)
                source.write_bytes(b'original producer source')
                (source.parent / 'new.rs').write_bytes(b'new source')
                with self.assertRaisesRegex(ValueError, 'Mixed source files added'):
                    materials.verify_mixed_source_inputs(closure)
                with self.assertRaisesRegex(ValueError, 'Noncanonical mixed input path'):
                    materials.current_mixed_source(closure, str(recorded_source.parent / '../src/lib.rs'))

    def test_should_carry_job_limits_and_owned_git_ceilings_through_env_i(self):
        tools = {name: f'/recorded/{name}/bin/{name}'
                 for name in ['node', 'python3', 'cmake', 'ninja', 'git', 'rustup', 'xcrun', 'bash']}
        closure = {
            'cache': '/recorded/build', 'output': '/recorded/output',
            'occtPrefix': '/recorded/prep/occt-mixed/install',
            'rustPrefix': '/recorded/rust', 'sdkPrefix': '/recorded/sdk',
            'sourceRoot': str(materials.ROOT), 'preparationCache': '/recorded/prep',
            'environment': {'HOME': '/recorded/home', 'EM_CONFIG': '/recorded/config',
                            'CARGO_HOME': '/recorded/cargo'},
            'wasmEh': prepare.RECIPE['wasmEh'],
            'tools': tools,
            **{name: f'/recorded/tools/{name}' for name in ['rustc', 'cargo', 'emcc', 'emxx', 'emar']},
        }
        mixed = {'closure': closure, 'attribution': {'mock': True},
                 'commands': [{'executable': '/usr/bin/env', 'args': []}],
                 'prefix': {'environment': {}, 'command': ['/usr/bin/env']}}
        with patch.object(Path, 'read_text', return_value='# mocked Emscripten config\n'):
            recipe = materials.mixed_producer_recipe(mixed)
        self.assertNotIn('EMCC_CORES', recipe['recordedEnvironment'])
        closure['wasmSimd'] = prepare.RECIPE['wasmSimd']
        closure['occtPrefix'] = '/recorded/prep/occt-mixed-simd128/install'
        with patch.object(Path, 'read_text', return_value='# mocked Emscripten config\n'):
            simd_recipe = materials.mixed_producer_recipe(mixed)
        self.assertEqual(simd_recipe['recordedEnvironment']['CARGO_ENCODED_RUSTFLAGS'],
                         '\x1f'.join([
                             '-C', 'target-feature=+simd128',
                             f'--remap-path-prefix={materials.ROOT}=tau',
                             '--remap-path-prefix=/recorded/cargo=cargo',
                             '--remap-path-prefix=/recorded/rust/lib/rustlib/src/rust=rust-src',
                         ]))
        self.assertTrue(simd_recipe['recordedEnvironment']['CXXFLAGS_wasm32_unknown_emscripten']
                        .startswith('-msimd128 '))
        self.assertIn('occt-mixed-simd128', simd_recipe['rebuildMixedPrefix'])
        self.assertIn('occt-mixed-simd128/install', simd_recipe['prepare'])
        with tempfile.TemporaryDirectory() as temporary:
            inputs = Path(temporary) / 'transport-mixed-inputs.json'
            inputs.write_text('{"schema":"geospec-mixed-build-inputs-v3"}')
            mixed['paths'] = {'inputs': inputs}
            with patch.object(Path, 'read_text', return_value='# mocked Emscripten config\n'):
                recipe = materials.mixed_producer_recipe(mixed)
            recorded = recipe['recordedEnvironment']
            self.assertEqual(recorded['GEOSPEC_PRODUCER_ROUTE'], 'nx-build-mixed-st-release-v1')
            self.assertEqual(recorded['GEOSPEC_MIXED_INPUTS'],
                             '/recorded/prep/mixed-inputs-simd128.json')
            self.assertNotEqual(recorded['GEOSPEC_MIXED_INPUTS'], str(inputs))
            self.assertEqual(recorded['GEOSPEC_PRODUCER_MIXED_INPUTS_SHA256'], materials.digest(inputs))
            self.assertEqual(recorded['GEOSPEC_PRODUCER_CARGO_CWD'], str(materials.ROOT))
            self.assertNotIn('nx-build-mixed-st-release-v1', recipe['buildAndLink'])
        exported = {name: '/owned path/' + name for name in recipe['requiredExportedVariables']}
        exported['GEOSPEC_SOURCE_ROOT'] = str(SCRIPTS)
        ceiling = ':'.join(exported[name] for name in
                           ['GEOSPEC_RELINK_ROOT', 'GEOSPEC_MIXED_PREP', 'GEOSPEC_MIXED_BUILD'])
        for jobs in [None, '1']:
            env = {'PATH': '/usr/bin:/bin', **exported}
            if jobs is not None:
                env['GEOSPEC_OCCT_JOBS'] = jobs
            for key in ['rebuildMixedPrefix', 'buildAndLink']:
                with self.subTest(jobs=jobs, route=key):
                    # The only inner executable is /usr/bin/env, never a compiler or Git.
                    output = subprocess.check_output(['/bin/bash', '-c', recipe[key]], env=env, text=True)
                    inner = dict(line.split('=', 1) for line in output.splitlines())
                    for name in ['GEOSPEC_OCCT_JOBS', 'EMCC_CORES', 'CARGO_BUILD_JOBS', 'BINARYEN_CORES']:
                        self.assertEqual(inner[name], jobs or '2')
                    self.assertEqual(inner['GIT_CEILING_DIRECTORIES'], ceiling)
                    if key == 'buildAndLink':
                        self.assertEqual(inner['GEOSPEC_PRODUCER_ROUTE'], 'mixed-relink-unverified')

    def contract(self, kind):
        context = {
            'compiler': {'clang': Path('/tools/clang'), 'clang++': Path('/tools/clang++')},
            'sdkPath': Path('/tools/sdk'),
            'supportPayloads': {'native': {}, 'mixed': {}},
            'toolMetadata': {},
        }
        paths = {key: Path('/tools') / key for key in ['bash', 'git', 'node']}
        with patch.object(prepare, 'digest', return_value='mock-source-pin'):
            return prepare.prefix_contract(kind, paths, {}, context)

    def recipe(self, cohort='node', executable_identity=None):
        workspace = (materials.ROOT / 'pnpm-workspace.yaml').read_text()
        version = re.search(r"^\s*'@napi-rs/cli':\s*([^\s#]+)", workspace, re.MULTILINE)[1]
        with patch.object(materials, 'selected_executable', side_effect=lambda name: Path('/tools') / name), \
                patch.object(materials, 'run', return_value='/tools/selected\n'), \
                patch.object(materials, 'executable_identity',
                             side_effect=executable_identity or (lambda *_: {'mock': True})):
            return materials.native_producer_recipe({'selectedVersion': version}, cohort)

    def test_should_not_observe_unselected_python_tools_for_node_material(self):
        python_project = materials.tomllib.loads(
            (materials.PACKAGE / 'bindings/python/pyproject.toml').read_text()
        )
        maturin_version = python_project['build-system']['requires'][0].split('==', 1)[1]

        def reject_python(path, *_):
            if 'python-venv' in str(path) or 'python314-venv' in str(path):
                raise ValueError(f'Missing selected executable: {path}')
            return {'mock': True}

        node = self.recipe('node', reject_python)
        observations = node['reconstructionSelectionAtMaterialGeneration']
        self.assertNotIn('python313', observations)
        self.assertNotIn('python314', observations)
        self.assertEqual(node['pythonReconstructionRequirements'], {
            'python313': {'requiredPythonSeries': '3.13', 'maturinVersion': maturin_version},
            'python314': {'requiredPythonSeries': '3.14', 'maturinVersion': maturin_version},
        })
        self.assertEqual(set(node['standaloneRoutes']), {'node', 'python313', 'python314'})
        self.assertEqual(set(node['sourceSelectedRoutes']), {'node', 'python313', 'python314'})
        with self.assertRaisesRegex(ValueError, 'Missing selected executable: .*python-venv'):
            self.recipe('python', reject_python)
        python = self.recipe('python')
        self.assertIn('python313', python['reconstructionSelectionAtMaterialGeneration'])
        self.assertIn('python314', python['reconstructionSelectionAtMaterialGeneration'])

    def test_should_select_the_ruled_floor(self):
        self.assertEqual(prepare.RECIPE['macosDeploymentTarget'], '11.0')

    def test_should_select_the_floor_in_all_workspace_producer_commands(self):
        recipe = self.recipe()
        for route in recipe['sourceSelectedRoutes'].values():
            command = next(c for c in route if 'napi build --manifest-path' in c) if isinstance(route, list) else route
            words = shlex.split(command)
            self.assertTrue(words[0].startswith('MACOSX_DEPLOYMENT_TARGET='))
            # Preserve the real reader; replace all producer execution with env printing.
            prefix = command.split(' GEOSPEC_PRODUCER_ROUTE=', 1)[0]
            output = subprocess.check_output(['/bin/bash', '-c', prefix + ' /usr/bin/env'],
                                             cwd=materials.ROOT, text=True)
            self.assertIn('MACOSX_DEPLOYMENT_TARGET=11.0', output.splitlines())

    def test_should_preserve_target_defaults_and_honor_absolute_cargo_target_dir(self):
        defaults = {
            'node': str(materials.ROOT / 'node_modules/.cache/geospec-engine-native/node-target'),
            'python313': 'node_modules/.cache/geospec-engine-native/python-target',
            'python314': 'node_modules/.cache/geospec-engine-native/python314-target',
        }
        for name, route in self.recipe()['sourceSelectedRoutes'].items():
            command = next(c for c in route if 'napi build --manifest-path' in c) if isinstance(route, list) else route
            argument = re.search(r'--target-dir ("[^"]*"|\S+)', command)[1]
            for override in [None, '', '/owned build/fresh-target']:
                with self.subTest(route=name, override=override):
                    env = {'PATH': '/usr/bin:/bin'}
                    if override is not None:
                        env['CARGO_TARGET_DIR'] = override
                    # Expand only the real target argument; no producer command runs.
                    output = subprocess.check_output(['/bin/bash', '-c', 'printf "%s\\n" ' + argument],
                                                     cwd=materials.ROOT, env=env, text=True)
                    self.assertEqual(output.splitlines(), [override or defaults[name]])

    def test_should_bind_native_environment_and_cmake_to_the_same_selection(self):
        native = self.contract('native')
        mixed = self.contract('mixed')
        for target in ['11.0', '12.0']:
            with self.subTest(target=target), patch.dict(prepare.RECIPE, macosDeploymentTarget=target):
                contract = self.contract('native')
                self.assertEqual(contract['environment']['MACOSX_DEPLOYMENT_TARGET'], target)
                self.assertIn(f'-DCMAKE_OSX_DEPLOYMENT_TARGET={target}', contract['command'])
                self.assertEqual(self.contract('mixed'), mixed)
                if target != '11.0':
                    self.assertNotEqual(contract, native)
        self.assertNotIn('MACOSX_DEPLOYMENT_TARGET', mixed['environment'])

    def test_should_emit_the_selected_floor_for_all_standalone_native_builds(self):
        read_json = materials.read_json
        selected = read_json(SCRIPTS / 'selected-delivery.json')
        for target in ['11.0', '12.0']:
            def read_selection(path):
                if Path(path) == SCRIPTS / 'selected-delivery.json':
                    return {**selected, 'macosDeploymentTarget': target}
                return read_json(path)

            with self.subTest(target=target), patch.object(materials, 'read_json', side_effect=read_selection):
                recipe = self.recipe()
                self.assertEqual(recipe['environment']['MACOSX_DEPLOYMENT_TARGET'], target)
                for command in recipe['standaloneRoutes'].values():
                    words = shlex.split(command.replace('\\\n', ''))
                    self.assertEqual([w for w in words if w.startswith('MACOSX_DEPLOYMENT_TARGET=')],
                                     [f'MACOSX_DEPLOYMENT_TARGET={target}'])

                # Render only the actual README template, without its filesystem/tool producer.
                tree = ast.parse((SCRIPTS / 'generate-delivery-materials.py').read_text())
                template = next(n for n in ast.walk(tree) if isinstance(n, ast.JoinedStr)
                                and isinstance(n.values[0], ast.Constant)
                                and n.values[0].value.startswith('# GeoSpec native source and relink material'))
                readme = eval(compile(ast.Expression(template), '<README template>', 'eval'),
                              {'archive_name': 'occt.tar.gz', 'native_recipe': recipe, 'shlex': shlex})
                self.assertIn(f'export MACOSX_DEPLOYMENT_TARGET={target}', readme)
                self.assertIn('-DCMAKE_OSX_DEPLOYMENT_TARGET="$MACOSX_DEPLOYMENT_TARGET"', readme)


class PreparationContractTest(unittest.TestCase):
    """Real receipt functions over inert bytes; no compiler, tool or product runs."""

    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory())).resolve()
        self.cache = self.root / 'cache'
        self.package = self.root / 'package'
        self.prefix = self.cache / 'occt-mixed-simd128'
        for directory in [self.prefix / 'install/lib', self.prefix / 'build',
                          self.package / 'native/occt', self.cache / 'downloads']:
            directory.mkdir(parents=True)
        self.builder = self.package / 'native/occt/build-occt.sh'
        self.builder.write_text('inert builder bytes')
        archive = self.cache / 'downloads/occt.tar.gz'
        archive.write_text('inert source archive bytes')
        self.recipe = deepcopy(prepare.RECIPE)
        self.recipe['occt']['sha256'] = prepare.digest(archive)
        self.recipe_path = self.root / 'selected-delivery.json'
        self.recipe_path.write_text(json.dumps(self.recipe))
        self.original_recipe = self.prefix / 'selected-delivery.json'
        self.original_recipe.write_bytes(self.recipe_path.read_bytes())
        self.library = self.prefix / 'install/lib/libTKMock.a'
        self.library.write_text('inert library bytes')
        self.header = self.prefix / 'install/mock.hxx'
        self.header.write_text('inert header bytes')
        (self.prefix / 'build/CMakeCache.txt').write_text('inert CMake cache')
        (self.prefix / 'static-toolkit-closure.txt').write_text('lib/libTKMock.a\n')
        self.paths = {}
        for name in ['bash', 'git', 'node', 'python3', 'rustc', 'cargo', 'emcc', 'emxx', 'emar']:
            self.paths[name] = self.root / name
            self.paths[name].write_text('inert tool: ' + name)
        self.context = {
            'compiler': {'clang': self.root / 'clang', 'clang++': self.root / 'clang++'},
            'sdkPath': self.root / 'sdk',
            'supportPayloads': {'native': {'sha256': 'native-support'}, 'mixed': {'sha256': 'mixed-support'}},
            'toolMetadata': {'executables': {'emcc': {'sha256': prepare.digest(self.paths['emcc'])}}},
        }
        config = self.cache / 'emscripten.config'
        config.write_text('inert config')
        (self.cache / 'tool-metadata.json').write_text('{}')
        self.env = {'EM_CONFIG': str(config), 'PATH': '/inert/tools'}
        self.stack.enter_context(patch.dict(os.environ, {}, clear=True))
        for name, value in {'CACHE': self.cache, 'PACKAGE': self.package, 'RECIPE': self.recipe,
                            'RECIPE_PATH': self.recipe_path, 'SOURCE': self.cache / 'sources/occt',
                            'MIXED': self.prefix / 'install',
                            'MIXED_INPUTS': self.cache / 'mixed-inputs-simd128.json',
                            'RUST': self.root / 'rust'}.items():
            self.stack.enter_context(patch.object(prepare, name, value))
        self.receipt_path = self.prefix / 'prefix-receipt.json'
        self.receipt = prepare.create_prefix_receipt(self.prefix, self.contract())
        self.receipt['schema'] = prepare.PREFIX_RECEIPT_SCHEMA  # retained legacy fixture
        prepare.write_json(self.receipt_path, self.receipt)

    def contract(self, kind='mixed'):
        return prepare.prefix_contract(kind, self.paths, self.env, self.context)

    def verify(self):
        return prepare.verify_prefix(self.prefix, self.contract())

    def test_should_freeze_owned_sdk_without_changing_bytes_or_external_tools(self):
        sdk = self.cache / 'sdk/install'
        tool = sdk / 'emscripten/tool.py'
        tool.parent.mkdir(parents=True)
        tool.write_text('print("inert SDK tool")\n')
        tool.chmod(0o755)
        outside = self.root / 'external-tool'
        outside.write_text('outside the owned SDK')
        outside_mode = outside.stat().st_mode
        (sdk / 'external-link').symlink_to(outside)
        prepare.RUST.mkdir()
        before = prepare.support_payload({'sdk': sdk})
        with patch.object(prepare, 'SDK', sdk), \
                patch.object(prepare, 'room'), \
                patch.object(prepare, 'tool_paths', return_value=self.paths), \
                patch.object(prepare, 'validate_tools', return_value='inert rust'):
            with patch.dict(os.environ, GEOSPEC_DELIVERY_EMSDK_PREFIX=str(sdk)):
                prepare.prepare_tools()
                self.assertEqual(tool.stat().st_mode & 0o777, 0o755)
                self.assertNotEqual(tool.parent.stat().st_mode & 0o222, 0)
            prepare.prepare_tools()
            prepare.prepare_tools()
        self.assertEqual(prepare.support_payload({'sdk': sdk}), before)
        for path in [sdk, tool.parent, tool]:
            self.assertEqual(path.stat().st_mode & 0o222, 0)
        self.assertEqual(tool.stat().st_mode & 0o111, 0o111)
        self.assertEqual(outside.stat().st_mode, outside_mode)

    def test_should_prepare_only_selected_prefix_after_common_gates(self):
        for selection, expected in [(None, ['native', 'mixed']), ('mixed', ['mixed']), ('native', ['native'])]:
            with self.subTest(selection=selection), \
                    patch.object(prepare, 'room') as room, \
                    patch.object(prepare, 'prepare_sources') as sources, \
                    patch.object(prepare, 'prefix_context', return_value=self.context) as context, \
                    patch.object(prepare, 'prepare_prefix') as build:
                prepare.prepare_prefixes(self.paths, self.env, build_prefix=selection)
                room.assert_called_once_with('prefixes')
                sources.assert_called_once_with()
                context.assert_called_once_with(self.paths, self.env, tuple(expected))
                self.assertEqual(build.call_args_list,
                                 [call(kind, self.paths, self.env, self.context) for kind in expected])

        with patch.object(prepare, 'room', side_effect=ValueError('disk gate')), \
                patch.object(prepare, 'prepare_sources') as sources, \
                patch.object(prepare, 'prepare_prefix') as build:
            with self.assertRaisesRegex(ValueError, 'disk gate'):
                prepare.prepare_prefixes(self.paths, self.env, build_prefix='mixed')
            sources.assert_not_called()
            build.assert_not_called()

    def test_prefix_context_hashes_only_selected_support_kind(self):
        for name in ['rustup', 'xcrun', 'cmake', 'ninja']:
            self.paths[name] = self.root / name
            self.paths[name].write_text('inert tool: ' + name)
        self.builder.write_text('rustc 1.88.0 fixture')
        def selected(command, *_args, **_kwargs):
            if '-print-resource-dir' in command:
                return str(self.root)
            if '--show-sdk-path' in command:
                return str(self.root)
            if '--show-sdk-version' in command:
                return '15.0'
            if '--version' in command or '-vV' in command:
                return 'rustc 1.88.0'
            return str(self.builder)

        with patch.object(prepare, 'run', side_effect=selected), \
                patch.object(prepare, 'support_payload', return_value={'sha256': 'selected'}) as payload:
            native = prepare.prefix_context(self.paths, self.env, ('native',))
            self.assertEqual(set(native['supportPayloads']), {'native'})
            payload.assert_called_once()
            payload.reset_mock()
            self.env['EM_CACHE'] = str(self.cache / 'em-cache')
            mixed = prepare.prefix_context(self.paths, self.env, ('mixed',))
            self.assertEqual(set(mixed['supportPayloads']), {'mixed'})
            payload.assert_called_once()

    def test_should_reject_combining_build_and_reuse_prefix_selectors(self):
        with patch.object(prepare.sys, 'argv', ['prepare-delivery.py', 'prefixes',
                                               '--build-prefix', 'mixed', '--reuse-prefix', 'native']), \
                patch.object(prepare.sys, 'stderr', new_callable=io.StringIO) as stderr:
            with self.assertRaises(SystemExit) as error:
                prepare.main()
            self.assertEqual(error.exception.code, 2)
            self.assertIn('not allowed with argument', stderr.getvalue())

    def test_should_reserve_build_space_only_for_build_routes_and_missing_sources(self):
        for name in ['occt', *prepare.RECIPE['headers']]:
            (self.cache / 'sources' / name).mkdir(parents=True)
            (self.cache / 'downloads' / f'{name}.tar.gz').touch()
        required = 14 * 1024 ** 3
        with patch.object(prepare.shutil, 'disk_usage', return_value=SimpleNamespace(free=required)):
            prepare.room('prefixes')
        with patch.object(prepare.shutil, 'disk_usage', return_value=SimpleNamespace(free=required - 1)):
            with self.assertRaisesRegex(ValueError, f'requires {required} free bytes'):
                prepare.room('prefixes')
        for stage in ['sources', 'reuse-prefix']:
            with self.subTest(stage=stage), \
                    patch.object(prepare.shutil, 'disk_usage', return_value=SimpleNamespace(free=0)):
                prepare.room(stage)
        with patch.object(prepare, 'SOURCE', self.cache / 'missing-source'):
            for stage in ['sources', 'reuse-prefix']:
                with self.subTest(stage=stage):
                    required = 1024 ** 3
                    with patch.object(prepare.shutil, 'disk_usage', return_value=SimpleNamespace(free=required - 1)):
                        with self.assertRaisesRegex(ValueError, f'requires {required} free bytes'):
                            prepare.room(stage)
                    with patch.object(prepare.shutil, 'disk_usage', return_value=SimpleNamespace(free=required)):
                        prepare.room(stage)

        sdk = self.cache / 'sdk/install'
        sdk.mkdir(parents=True)
        prepare.RUST.mkdir()
        with patch.object(prepare, 'SDK', sdk), \
                patch.object(prepare.shutil, 'disk_usage', return_value=SimpleNamespace(free=0)), \
                patch.object(prepare, 'tool_paths', return_value=self.paths), \
                patch.object(prepare, 'validate_tools', return_value='inert rust') as validate, \
                patch.object(prepare, 'download', side_effect=AssertionError('unexpected install')):
            prepare.prepare_tools()
            validate.assert_called_once_with(self.paths)
            self.assertEqual(json.loads((self.cache / 'tool-metadata.json').read_text())['selectedToolHashes'],
                             'verified')
        sdk.rmdir()
        with patch.object(prepare, 'SDK', sdk), \
                patch.object(prepare.shutil, 'disk_usage', return_value=SimpleNamespace(free=4 * 1024 ** 3 - 1)):
            with self.assertRaisesRegex(ValueError, f'requires {4 * 1024 ** 3} free bytes'):
                prepare.room('tools')
            with patch.dict(os.environ, GEOSPEC_DELIVERY_EMSDK_PREFIX=str(sdk)):
                prepare.room('tools')  # External missing tools fail validation, never install.

        with patch.object(prepare, 'room') as room, \
                patch.object(prepare, 'prepare_sources') as sources, \
                patch.object(prepare, 'prefix_context', return_value=self.context), \
                patch.object(prepare, 'producer_builder', return_value=self.builder), \
                patch.object(prepare, 'prepare_prefix') as build:
            # Exercise real receipt verification over the existing inert prefix.
            prepare.prepare_prefixes(self.paths, self.env, reuse_prefix='mixed')
            room.assert_called_once_with('reuse-prefix')
            sources.assert_called_once_with()
            build.assert_not_called()

    def test_should_verify_existing_sources_and_receipt_on_low_free_reuse(self):
        for name, item in [('occt', self.recipe['occt']), *self.recipe['headers'].items()]:
            archive = self.cache / 'downloads' / f'{name}.tar.gz'
            payload = f'selected {name} bytes'.encode()
            with tarfile.open(archive, 'w:gz') as output:
                member = tarfile.TarInfo(f'{name}/selected.txt')
                member.size = len(payload)
                output.addfile(member, io.BytesIO(payload))
            item['sha256'] = prepare.digest(archive)
        (self.package / 'native/occt/source-manifest.json').write_text(json.dumps({
            'archiveSha256': self.recipe['occt']['sha256'],
            'commit': self.recipe['occt']['commit'],
        }))
        self.recipe_path.write_text(json.dumps(self.recipe))
        self.original_recipe.write_bytes(self.recipe_path.read_bytes())
        self.receipt = prepare.create_prefix_receipt(self.prefix, self.contract())
        prepare.write_json(self.receipt_path, self.receipt)
        with patch.object(prepare.shutil, 'disk_usage', return_value=SimpleNamespace(free=1024 ** 3)):
            prepare.prepare_sources()

        low_free = patch.object(prepare.shutil, 'disk_usage', return_value=SimpleNamespace(free=512 * 1024 ** 2))
        with low_free, patch.object(prepare, 'prefix_context', return_value=self.context), \
                patch.object(prepare, 'producer_builder', return_value=self.builder), \
                patch.object(prepare, 'prepare_prefix') as build:
            prepare.prepare_prefixes(self.paths, self.env, reuse_prefix='mixed')
            build.assert_not_called()
            archive = self.cache / 'downloads/occt.tar.gz'
            original_archive = archive.read_bytes()
            archive.unlink()
            with self.assertRaisesRegex(ValueError, f'requires {1024 ** 3} free bytes'):
                prepare.prepare_prefixes(self.paths, self.env, reuse_prefix='mixed')
            archive.write_bytes(original_archive)
            archive.write_bytes(b'changed archive')
            with self.assertRaisesRegex(ValueError, 'Archive hash mismatch'):
                prepare.prepare_prefixes(self.paths, self.env, reuse_prefix='mixed')
            archive.write_bytes(original_archive)
            source_file = prepare.SOURCE / 'selected.txt'
            source_file.write_text('changed source')
            with self.assertRaisesRegex(ValueError, 'Changed archive member'):
                prepare.prepare_prefixes(self.paths, self.env, reuse_prefix='mixed')
            source_file.write_text('selected occt bytes')
            self.library.write_text('changed prefix')
            with self.assertRaisesRegex(ValueError, 'Installed prefix outputs changed'):
                prepare.prepare_prefixes(self.paths, self.env, reuse_prefix='mixed')

    def sdk_support_fixture(self):
        sdk = self.root / 'sdk'
        self.stack.enter_context(patch.object(prepare, 'SDK', sdk))
        self.env['EM_CACHE'] = str(self.cache / 'em-cache')
        contents = {
            sdk / 'bin/clang': 'compiler', sdk / 'lib/library': 'support',
            sdk / 'emscripten/tools/cache/required.py': 'genuine support named cache',
            sdk / 'emscripten/cache/unused.js': 'unused derived output',
            Path(self.env['EM_CACHE']) / 'sysroot/include/header.h': 'selected header',
        }
        for path, value in contents.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value)
        roots = {f'sdk/{name}': sdk / name for name in ['bin', 'lib', 'emscripten']}
        self.context['supportPayloads']['mixed'] = prepare.support_payload(roots)
        receipt = prepare.create_prefix_receipt(self.prefix, self.contract())
        receipt['schema'] = prepare.PREFIX_RECEIPT_SCHEMA
        prepare.write_json(self.receipt_path, receipt)
        self.evidence_path = self.root / 'retained-mixed-inputs.json'
        rows = {path for root in roots.values() for path in prepare.files(root)}
        rows.update([self.receipt_path, Path(self.env['EM_CONFIG'])])
        prepare.write_json(self.evidence_path, {
            'schema': 'geospec-mixed-build-inputs-v2', 'sdkPrefix': str(sdk),
            'environment': dict(self.env),
            'inputs': [{'path': str(path), 'sha256': prepare.digest(path)} for path in sorted(rows)],
        })
        self.context['supportPayloads']['mixed'] = prepare.support_payload(roots, prepare.unused_sdk_cache(self.env))
        self.stack.enter_context(patch.dict(os.environ, GEOSPEC_OCCT_SUPPORT_INPUTS=str(self.evidence_path)))
        return contents, receipt

    def test_should_reconstruct_support_in_historical_path_component_order(self):
        root = self.root / 'support'
        recorded = {root / 'a.py': 'a' * 64, root / 'a/child.py': 'b' * 64}
        # Path sorting puts the directory component "a" before "a.py";
        # lexicographic full-string sorting reverses these historical rows.
        rows = [{'path': 'sdk/a/child.py', 'sha256': 'b' * 64},
                {'path': 'sdk/a.py', 'sha256': 'a' * 64}]
        expected = hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.assertEqual(prepare.support_payload({'sdk': root}, recorded=recorded),
                         {'roots': {'sdk': str(root)}, 'files': 2, 'sha256': expected})

    def test_should_migrate_unused_default_cache_without_rewriting_historical_receipt(self):
        contents, receipt = self.sdk_support_fixture()
        original = self.receipt_path.read_bytes()
        unused = prepare.SDK / 'emscripten/cache/unused.js'
        unused.unlink()
        result = self.verify()
        migration = result['supportMigration']
        self.assertFalse(migration['prefixRebuilt'])
        self.assertEqual(migration['schema'], 'geospec-sdk-support-migration-v2')
        self.assertEqual(migration['originalReceipt']['sha256'], prepare.digest(self.receipt_path))
        self.assertEqual(migration['originalSupport'], receipt['supportPayload'])
        self.assertEqual(migration['excludedFiles'], 1)
        self.assertEqual(migration['effectiveSupport']['files'], 3)
        self.assertEqual(self.receipt_path.read_bytes(), original)
        # Recheck current support from actual inert bytes, including another directory named cache.
        self.assertIn(prepare.SDK / 'emscripten/tools/cache/required.py', contents)
        self.assertEqual(prepare.support_payload(migration['originalSupport']['roots'],
                                                prepare.unused_sdk_cache(self.env)),
                         migration['effectiveSupport'])

    def test_should_carry_migration_and_selected_cache_through_actual_manifest_functions(self):
        self.sdk_support_fixture()
        roots = [prepare.SDK / name for name in ['bin', 'lib', 'emscripten']]
        roots.append(Path(self.env['EM_CACHE']))
        with ExitStack() as mocked:
            replacements = {
                'prepare_sources': None, 'validate_tools': None, 'prefix_context': self.context,
                'tool_paths': self.paths, 'environment': self.env, 'input_roots': roots,
                'source_files': {self.recipe_path, self.builder}, 'libraries': [self.library],
            }
            for name, value in replacements.items():
                mocked.enter_context(patch.object(prepare, name, return_value=value))
            mocked.enter_context(patch.object(prepare, 'run', side_effect=lambda command, *args, **kwargs:
                                              '{"packages": []}' if 'metadata' in command else 'inert-head'))
            prepare.prepare_inputs(self.paths, self.env)
            manifest_path = self.cache / 'mixed-inputs-simd128.json'
            manifest = json.loads(manifest_path.read_text())
            selected = {row['path']: row['sha256'] for row in manifest['inputs']}
            self.assertIn(str(Path(self.env['EM_CACHE']) / 'sysroot/include/header.h'), selected)
            self.assertIn(str(prepare.SDK / 'emscripten/tools/cache/required.py'), selected)
            self.assertNotIn(str(prepare.SDK / 'emscripten/cache/unused.js'), selected)
            self.assertNotIn(str(self.evidence_path), selected)
            self.assertEqual(manifest['prefixSupportMigration']['evidence']['sha256'],
                             prepare.digest(self.evidence_path))
            # Original external evidence is genuinely unavailable. Reconstruct the
            # receipt aggregate from carried rows, not from a migration summary.
            transported = self.root / 'transport-mixed-inputs.json'
            transported.write_bytes(manifest_path.read_bytes())
            self.evidence_path.unlink()
            migration = json.loads(transported.read_text())['prefixSupportMigration']
            carried = {Path(row['path']): row['sha256'] for row in migration['supportEvidence']['inputs']}
            original = json.loads(self.receipt_path.read_text())
            self.assertEqual(prepare.support_payload(original['supportPayload']['roots'], recorded=carried),
                             original['supportPayload'])
            with patch.dict(os.environ, {}, clear=True):
                prepare.verify_manifest(transported)
                self.assertEqual(prepare.digest(transported), prepare.digest(manifest_path))
                changed = json.loads(transported.read_text())
                changed['wasmSimd']['rustFlags'] = []
                prepare.write_json(transported, changed)
                with self.assertRaisesRegex(ValueError, 'Wrong fixed SIMD flags'):
                    prepare.verify_manifest(transported)

    def test_should_require_explicit_external_cache_for_support_projection(self):
        self.sdk_support_fixture()
        for value in ['', 'relative', str(prepare.SDK / 'emscripten/cache'),
                      str(prepare.SDK / 'emscripten'), str(prepare.SDK / 'emscripten/cache/nested')]:
            with self.subTest(cache=value), self.assertRaisesRegex(ValueError, 'EM_CACHE'):
                prepare.unused_sdk_cache({**self.env, 'EM_CACHE': value})
        alias = self.root / 'cache-alias'
        alias.symlink_to(prepare.SDK / 'emscripten/cache', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'EM_CACHE'):
            prepare.unused_sdk_cache({**self.env, 'EM_CACHE': str(alias)})

    def test_should_bind_historical_rows_receipt_and_projected_membership(self):
        self.sdk_support_fixture()
        evidence_bytes = self.evidence_path.read_bytes()
        evidence = json.loads(evidence_bytes)
        for change, message in [
            ({'inputs': evidence['inputs'] + [evidence['inputs'][0]]}, 'duplicate'),
            ({'inputs': [r for r in evidence['inputs'] if r['path'] != str(self.receipt_path)]}, 'receipt hash'),
            ({'inputs': [r for r in evidence['inputs'] if not r['path'].endswith('unused.js')]}, 'aggregate'),
            ({'environment': {**self.env, 'EM_CACHE': '/other-cache'}}, 'EM_CACHE differs'),
        ]:
            with self.subTest(message=message):
                prepare.write_json(self.evidence_path, {**evidence, **change})
                with self.assertRaisesRegex(ValueError, message):
                    self.verify()
                self.evidence_path.write_bytes(evidence_bytes)
        self.context['supportPayloads']['mixed']['sha256'] = 'different-current-support'
        with self.assertRaisesRegex(ValueError, 'Projected SDK support'):
            self.verify()

    def test_should_preserve_original_recipe_and_receipt_after_native_only_selection_change(self):
        receipt_bytes = self.receipt_path.read_bytes()
        recipe_bytes = self.original_recipe.read_bytes()
        self.recipe['macosDeploymentTarget'] = '12.0'
        self.recipe_path.write_text(json.dumps(self.recipe))
        self.assertNotEqual(self.contract()['recipeSha256'], self.receipt['recipeSha256'])
        self.assertEqual(self.verify(), self.receipt)
        self.assertEqual(self.receipt_path.read_bytes(), receipt_bytes)
        self.assertEqual(self.original_recipe.read_bytes(), recipe_bytes)

    def test_should_require_original_recipe_bytes_for_older_prefix(self):
        self.original_recipe.unlink()
        self.recipe['macosDeploymentTarget'] = '12.0'
        self.recipe_path.write_text(json.dumps(self.recipe))
        with self.assertRaisesRegex(ValueError, 'Original prefix recipe bytes required'):
            self.verify()

    def test_should_accept_explicit_hash_matching_original_recipe(self):
        retained = self.root / 'retained-producer-selection.json'
        self.original_recipe.rename(retained)
        self.recipe['macosDeploymentTarget'] = '12.0'
        self.recipe_path.write_text(json.dumps(self.recipe))
        with patch.dict(os.environ, GEOSPEC_OCCT_PRODUCER_RECIPE=str(retained)):
            self.assertEqual(self.verify(), self.receipt)

    def test_should_refuse_changed_mixed_option(self):
        self.recipe['mixedOcctOptions'] = [*self.recipe['mixedOcctOptions'], '-DUSE_FREETYPE=OFF']
        with self.assertRaisesRegex(ValueError, 'Prefix receipt command changed'):
            self.verify()

    def test_should_bind_simd_to_occt_compilation_and_separate_prefix(self):
        command = self.contract()['command']
        self.assertIn('-DUSE_TBB=OFF', command)
        for flag in ['-DCMAKE_C_FLAGS=', '-DCMAKE_CXX_FLAGS=']:
            self.assertTrue(any(option.startswith(flag) and all(selected in option for selected in
                                ['-msimd128', *self.recipe['wasmEh']['compileFlags'],
                                 '-UOCC_CONVERT_SIGNALS']) for option in command))
        self.assertEqual(prepare.MIXED_PREFIX, 'occt-mixed-simd128')
        self.assertEqual(self.verify(), self.receipt)

    def test_should_reject_mixed_signal_conversion_with_wasm_longjmp(self):
        self.recipe['mixedOcctOptions'] = [option.replace(' -UOCC_CONVERT_SIGNALS', '')
                                           for option in self.recipe['mixedOcctOptions']]
        with self.assertRaisesRegex(ValueError, 'no POSIX signal conversion'):
            self.contract()

    def test_should_reject_js_eh_or_longjmp_in_native_eh_prefix(self):
        original = list(self.recipe['mixedOcctOptions'])
        for incompatible in ['-fexceptions', '-sDISABLE_EXCEPTION_CATCHING=0',
                             '-sSUPPORT_LONGJMP=emscripten']:
            with self.subTest(incompatible=incompatible):
                self.recipe['mixedOcctOptions'] = [*original[:-1], original[-1] + ' ' + incompatible]
                with self.assertRaisesRegex(ValueError, 'cannot mix with JavaScript EH or longjmp'):
                    self.contract()
        self.recipe['mixedOcctOptions'] = original

    def test_should_refuse_changed_selected_source_archives(self):
        selections = [self.recipe['occt'], *self.recipe['headers'].values()]
        for selection in selections:
            original = selection['sha256']
            with self.subTest(source=original):
                selection['sha256'] = 'different-source'
                with self.assertRaisesRegex(ValueError, 'Prefix source selection changed'):
                    self.verify()
                selection['sha256'] = original

    def test_should_refuse_changed_tools_support_builder_and_semantic_environment(self):
        mutations = {
            'toolMetadata': {'executables': {'emcc': {'sha256': 'different-tool'}}},
            'supportPayload': {'sha256': 'different-support'},
            'builderSha256': 'different-builder',
            'sourceArchiveSha256': 'different-archive',
            'environment': {**self.receipt['environment'], 'CXXFLAGS': '-different'},
        }
        for field, value in mutations.items():
            with self.subTest(field=field):
                contract = self.contract()
                contract[field] = value
                with self.assertRaisesRegex(ValueError, f'Prefix receipt {field} changed'):
                    prepare.verify_prefix(self.prefix, contract)

    def test_should_reuse_relocated_prefix_only_with_original_receipt_and_matching_occt_source(self):
        original = self.root / 'original/packages/geospec-engine-native/native/occt/build-occt.sh'
        original.parent.mkdir(parents=True)
        original.write_bytes(self.builder.read_bytes())
        patch_file = self.builder.parent / 'selected.patch'
        original_patch = original.parent / patch_file.name
        patch_file.write_text('inert patch bytes')
        original_patch.write_bytes(patch_file.read_bytes())
        self.receipt['command'][1] = str(original)
        prepare.write_json(self.receipt_path, self.receipt)
        receipt_bytes = self.receipt_path.read_bytes()
        with patch.dict(os.environ, GEOSPEC_OCCT_PRODUCER_BUILDER=str(original)):
            reused = self.verify()
            self.assertEqual(self.receipt_path.read_bytes(), receipt_bytes, 'reuse never relabels the producer receipt')
            self.assertEqual(reused['recovery']['originalReceiptSha256'], prepare.digest(self.receipt_path))
            self.assertEqual(reused['recovery']['sourceFiles'], 2)
            bridge = self.builder.parent / 'bridge/geospec_occt_bridge.cpp'
            bridge.parent.mkdir(parents=True)
            bridge.write_text('changed downstream bridge')
            self.assertEqual(self.verify()['recovery']['sourceFiles'], 2,
                             'bridge code is not consumed by the OCCT static prefix')
            manifest = self.builder.parent / 'source-manifest.json'
            original_manifest = original.parent / manifest.name
            manifest.write_text('{"source":"pinned"}')
            original_manifest.write_bytes(manifest.read_bytes())
            self.assertEqual(self.verify()['recovery']['sourceFiles'], 3)
            manifest.write_text('{"source":"changed"}')
            with self.assertRaisesRegex(ValueError, 'OCCT source closure changed'):
                self.verify()
            manifest.write_bytes(original_manifest.read_bytes())
            patch_file.write_text('changed patch')
            with self.assertRaisesRegex(ValueError, 'OCCT source closure changed'):
                self.verify()
            patch_file.write_bytes(original_patch.read_bytes())
            self.builder.write_text('changed builder')
            with self.assertRaisesRegex(ValueError, 'builderSha256 changed'):
                self.verify()
            self.builder.write_bytes(original.read_bytes())
            changed = self.contract()
            changed['command'][2] = '-DCMAKE_C_COMPILER=/changed/compiler'
            with self.assertRaisesRegex(ValueError, 'Prefix receipt command changed'):
                prepare.verify_prefix(self.prefix, changed)
            changed = self.contract()
            changed['toolMetadata'] = {'changedTool': True}
            with self.assertRaisesRegex(ValueError, 'Prefix receipt toolMetadata changed'):
                prepare.verify_prefix(self.prefix, changed)
            selected = self.recipe['occt']['sha256']
            self.recipe['occt']['sha256'] = 'changed-source'
            with self.assertRaisesRegex(ValueError, 'Prefix source selection changed'):
                self.verify()
            self.recipe['occt']['sha256'] = selected
            self.assertEqual(self.receipt_path.read_bytes(), receipt_bytes)

    def test_should_authenticate_effective_mixed_recovery_without_rewriting_original_receipt(self):
        producer_root = self.root / 'producer'
        producer_package = producer_root / 'packages/geospec-engine-native'
        builder = producer_package / 'native/occt/build-occt.sh'
        builder.parent.mkdir(parents=True)
        builder.write_bytes(self.builder.read_bytes())
        self.builder = builder
        self.stack.enter_context(patch.object(prepare, 'PACKAGE', producer_package))
        self.stack.enter_context(patch.object(materials, 'ROOT', producer_root))
        self.stack.enter_context(patch.object(materials, 'PACKAGE', producer_package))
        self.receipt['command'][1] = str(builder)
        prepare.write_json(self.receipt_path, self.receipt)
        unchanged = {
            'sourceRoot': str(producer_root),
            'occtPrefix': str(self.prefix / 'install'),
            'tools': {name: str(path) for name, path in self.paths.items()},
            'environment': self.env,
            'prefixProducerBuilder': str(self.builder),
            'prefixProducerRecipe': str(self.original_recipe),
            'prefixRecovery': {'mixed': None},
        }
        with patch.object(materials, 'prepare', prepare), \
                patch.object(prepare, 'prefix_context', return_value=self.context):
            self.assertEqual(materials.verify_mixed_prefix(unchanged), self.receipt)
            consumer_root = self.root / 'consumer'
            consumer_package = consumer_root / 'packages/geospec-engine-native'
            consumer_builder = consumer_package / 'native/occt/build-occt.sh'
            consumer_builder.parent.mkdir(parents=True)
            consumer_builder.write_bytes(builder.read_bytes())
            with patch.object(prepare, 'PACKAGE', consumer_package), \
                    patch.object(materials, 'ROOT', consumer_root), \
                    patch.object(materials, 'PACKAGE', consumer_package):
                self.assertEqual(materials.verify_mixed_prefix(unchanged), self.receipt,
                                 'historical None remains valid when the assembler moves')
                portable_same = deepcopy(self.receipt)
                portable_same['schema'] = prepare.PORTABLE_PREFIX_RECEIPT_SCHEMA
                portable_same['producerSources'] = prepare.builder_sources(builder)
                prepare.write_json(self.receipt_path, portable_same)
                builder.unlink()
                try:
                    self.assertEqual(materials.verify_mixed_prefix(unchanged), portable_same,
                                     'package-owned producer selector maps after its checkout retires')
                finally:
                    builder.write_bytes(consumer_builder.read_bytes())
                    prepare.write_json(self.receipt_path, self.receipt)
        original = self.root / 'original/packages/geospec-engine-native/native/occt/build-occt.sh'
        original.parent.mkdir(parents=True)
        original.write_bytes(self.builder.read_bytes())
        self.receipt['command'][1] = str(original)
        prepare.write_json(self.receipt_path, self.receipt)
        receipt_bytes = self.receipt_path.read_bytes()
        with patch.dict(os.environ, GEOSPEC_OCCT_PRODUCER_BUILDER=str(original)):
            effective = self.verify()
            closure = {
                'sourceRoot': str(producer_root),
                'occtPrefix': str(self.prefix / 'install'),
                'tools': {name: str(path) for name, path in self.paths.items()},
                'environment': self.env,
                'prefixProducerBuilder': str(original),
                'prefixProducerRecipe': str(self.original_recipe),
                'prefixRecovery': {'mixed': effective['recovery']},
            }
            with patch.dict(os.environ, {}, clear=True), \
                    patch.object(materials, 'prepare', prepare), \
                    patch.object(prepare, 'prefix_context', return_value=self.context):
                self.assertEqual(materials.verify_mixed_prefix(closure), self.receipt)
                self.assertEqual(self.receipt_path.read_bytes(), receipt_bytes)
                with patch.object(prepare, 'PACKAGE', consumer_package), \
                        patch.object(materials, 'ROOT', consumer_root), \
                        patch.object(materials, 'PACKAGE', consumer_package):
                    self.assertEqual(materials.verify_mixed_prefix(closure), self.receipt,
                                     'historical relocation remains attributed to the producing checkout')
                with patch.object(prepare, 'PACKAGE', original.parents[2]), \
                        patch.object(materials, 'ROOT', original.parents[4]), \
                        patch.object(materials, 'PACKAGE', original.parents[2]):
                    self.assertEqual(materials.verify_mixed_prefix(closure), self.receipt,
                                     'historical relocation remains valid when current admission needs none')
                portable = deepcopy(self.receipt)
                portable['schema'] = prepare.PORTABLE_PREFIX_RECEIPT_SCHEMA
                portable['producerSources'] = prepare.builder_sources(builder)
                prepare.write_json(self.receipt_path, portable)
                portable_closure = deepcopy(closure)
                portable_closure['prefixProducerBuilder'] = str(builder)
                portable_closure['prefixRecovery']['mixed']['originalReceiptSha256'] = prepare.digest(self.receipt_path)
                original.unlink()
                try:
                    with patch.object(prepare, 'PACKAGE', consumer_package), \
                            patch.object(materials, 'ROOT', consumer_root), \
                            patch.object(materials, 'PACKAGE', consumer_package):
                        self.assertEqual(materials.verify_mixed_prefix(portable_closure), portable,
                                         'portable historical evidence survives a retired original checkout')
                        missing_external = deepcopy(portable_closure)
                        missing_external['prefixProducerBuilder'] = str(original)
                        with self.assertRaisesRegex(FileNotFoundError, 'build-occt.sh'):
                            materials.verify_mixed_prefix(missing_external)
                finally:
                    original.write_bytes(builder.read_bytes())
                    self.receipt_path.write_bytes(receipt_bytes)
                annotated = deepcopy(self.receipt)
                annotated['recovery'] = closure['prefixRecovery']['mixed']
                prepare.write_json(self.receipt_path, annotated)
                with self.assertRaisesRegex(ValueError, 'Raw mixed recovery is not admission evidence'):
                    materials.verify_mixed_prefix(closure)
                self.receipt_path.write_bytes(receipt_bytes)
                wrong_builder = self.root / 'wrong-builder.sh'
                wrong_builder.write_bytes(original.read_bytes())
                wrong_selector = deepcopy(closure)
                wrong_selector['prefixProducerBuilder'] = str(wrong_builder)
                with self.assertRaisesRegex(ValueError, 'Prefix producer selector changed'):
                    materials.verify_mixed_prefix(wrong_selector)
                for field in ['originalReceiptSha256', 'originalBuilder', 'currentBuilder', 'sourceFiles']:
                    forged = deepcopy(closure)
                    forged['prefixRecovery']['mixed'][field] = 'forged'
                    with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'Mixed recovery differs'):
                        materials.verify_mixed_prefix(forged)
                changed = deepcopy(closure)
                changed['environment']['CXXFLAGS'] = '-changed'
                with self.assertRaisesRegex(ValueError, 'Prefix receipt environment changed'):
                    materials.verify_mixed_prefix(changed)
                self.library.write_text('changed archive bytes')
                with self.assertRaisesRegex(ValueError, 'Installed prefix outputs changed'):
                    materials.verify_mixed_prefix(closure)
                self.assertEqual(self.receipt_path.read_bytes(), receipt_bytes)

    def test_portable_receipt_survives_retired_checkout_and_binds_source_manifest(self):
        source = self.builder.parent
        (source / 'selected.patch').write_text('selected patch')
        (source / 'source-manifest.json').write_text('{"archive":"selected"}')
        original = self.root / 'retired/packages/geospec-engine-native/native/occt/build-occt.sh'
        original.parent.mkdir(parents=True)
        for path in [self.builder, source / 'selected.patch', source / 'source-manifest.json']:
            (original.parent / path.name).write_bytes(path.read_bytes())
        receipt = prepare.create_prefix_receipt(self.prefix, self.contract())
        receipt['command'][1] = str(original)
        prepare.write_json(self.receipt_path, receipt)
        original.parent.rename(self.root / 'retired-source-hidden')
        original_bytes = self.receipt_path.read_bytes()
        self.assertEqual(self.verify()['schema'], prepare.PORTABLE_PREFIX_RECEIPT_SCHEMA)
        self.assertEqual(self.receipt_path.read_bytes(), original_bytes)
        for path in [self.builder, source / 'selected.patch', source / 'source-manifest.json']:
            saved = path.read_bytes()
            with self.subTest(path=path.name):
                path.write_text('mutated')
                with self.assertRaisesRegex(ValueError, 'builderSha256 changed|OCCT source closure changed'):
                    self.verify()
                path.write_bytes(saved)
        extra = source / 'extra.patch'
        extra.write_text('new patch')
        with self.assertRaisesRegex(ValueError, 'OCCT source closure changed'):
            self.verify()
        extra.unlink()
        selected_patch = source / 'selected.patch'
        selected_patch.rename(source / 'withheld.patch.disabled')
        with self.assertRaisesRegex(ValueError, 'OCCT source closure changed'):
            self.verify()
        (source / 'withheld.patch.disabled').rename(selected_patch)
        receipt['schema'] = prepare.PREFIX_RECEIPT_SCHEMA
        prepare.write_json(self.receipt_path, receipt)
        with self.assertRaisesRegex(ValueError, 'Prefix receipt command changed'):
            self.verify()

    def test_generation_changes_for_selected_source_sdk_and_recipe(self):
        def selected(command, *_args, **_kwargs):
            self.assertTrue(_args and isinstance(_args[0], dict))
            self.assertNotIn('/unselected/shell', _args[0]['PATH'])
            if '--show-sdk-version' in command:
                return '15.0'
            if '--show-sdk-path' in command:
                return str(self.root)
            if '-print-resource-dir' in command:
                return str(self.root)
            if '-vV' in command:
                return 'rustc 1.88.0'
            return str(self.builder)

        sources = {'build-occt.sh': 'a' * 64, 'selected.patch': 'b' * 64}
        support = {'sha256': 'c' * 64}
        with patch.dict(os.environ, PATH='/unselected/shell'), \
                patch.object(prepare.shutil, 'which', return_value=str(self.builder)), \
                patch.object(prepare, 'run', side_effect=selected), \
                patch.object(prepare, 'builder_sources', side_effect=lambda _builder: sources.copy()), \
                patch.object(prepare, 'support_payload', side_effect=lambda _roots: support.copy()):
            base = prepare.delivery_generation()
            self.assertEqual(prepare.delivery_generation(), base)
            sources['selected.patch'] = 'd' * 64
            self.assertNotEqual(prepare.delivery_generation(), base)
            sources['selected.patch'] = 'b' * 64
            support['sha256'] = 'e' * 64
            self.assertNotEqual(prepare.delivery_generation(), base)
            support['sha256'] = 'c' * 64
            self.recipe['mixedOcctOptions'].append('-DUSE_TBB=ON')
            self.assertNotEqual(prepare.delivery_generation(), base)
            self.recipe['mixedOcctOptions'].pop()
            selected_sha = self.recipe['rust']['archives'][0]['sha256']
            self.recipe['rust']['archives'][0]['sha256'] = 'different-owned-rust-archive'
            self.assertNotEqual(prepare.delivery_generation(), base)
            self.recipe['rust']['archives'][0]['sha256'] = selected_sha
            with patch.dict(os.environ, GIT_CEILING_DIRECTORIES='/strict-ceiling'):
                self.assertNotEqual(prepare.delivery_generation(), base)

    def test_generation_changes_for_external_sdk_and_rust_prefix_mutation(self):
        sdk = self.root / 'external-sdk'
        rust = self.root / 'external-rust'
        selected_files = [sdk / 'bin/clang', sdk / 'emscripten/emcc',
                          sdk / 'lib/libc.a', rust / 'bin/rustc']
        for path in selected_files:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('selected bytes')

        def selected(command, *_args, **_kwargs):
            if '--show-sdk-version' in command:
                return '15.0'
            if '--show-sdk-path' in command or '-print-resource-dir' in command:
                return str(self.root)
            if '-vV' in command:
                return 'rustc 1.88.0'
            return str(self.builder)

        original_support = prepare.support_payload
        def support(roots, excluded=None):
            return {'sha256': 'native-support'} if 'apple-sdk' in roots else original_support(roots, excluded)

        with patch.dict(os.environ, GEOSPEC_DELIVERY_EMSDK_PREFIX=str(sdk),
                        GEOSPEC_DELIVERY_RUST_PREFIX=str(rust)), \
                patch.object(prepare, 'SDK', sdk), patch.object(prepare, 'RUST', rust), \
                patch.object(prepare.shutil, 'which', return_value=str(self.builder)), \
                patch.object(prepare, 'run', side_effect=selected), \
                patch.object(prepare, 'support_payload', side_effect=support):
            base = prepare.delivery_generation()
            for path in [sdk / 'emscripten/emcc', rust / 'bin/rustc']:
                saved = path.read_bytes()
                with self.subTest(path=path):
                    path.write_text('mutated bytes')
                    self.assertNotEqual(prepare.delivery_generation(), base)
                    path.write_bytes(saved)
            self.assertEqual(prepare.delivery_generation(), base)

    def test_generation_keeps_external_prefixes_and_strict_ceiling_under_legacy_cache(self):
        legacy = self.root / 'legacy-cache'
        selected = self.root / 'generation-cache'
        sdk = legacy / 'external-sdk'
        rust = legacy / 'external-rust'
        (sdk / 'bin').mkdir(parents=True)
        (sdk / 'bin/wasm-ld').write_text('selected linker')

        def probe(command, *_args, **_kwargs):
            if '--show-sdk-version' in command:
                return '15.0'
            if '--show-sdk-path' in command or '-print-resource-dir' in command:
                return str(self.root)
            if '-vV' in command:
                return 'rustc 1.88.0'
            return str(self.builder)

        with patch.dict(os.environ, GEOSPEC_DELIVERY_EMSDK_PREFIX=str(sdk),
                        GEOSPEC_DELIVERY_RUST_PREFIX=str(rust),
                        GIT_CEILING_DIRECTORIES=str(legacy / 'strict')), \
                patch.object(prepare, 'SDK', sdk), patch.object(prepare, 'RUST', rust), \
                patch.object(prepare.shutil, 'which', return_value=str(self.builder)), \
                patch.object(prepare, 'run', side_effect=probe), \
                patch.object(prepare, 'support_payload', return_value={'sha256': 'same-support'}):
            with patch.object(prepare, 'CACHE', legacy):
                projected = prepare.delivery_generation()
                projected_env = prepare.environment(prepare.tool_paths(), write_config=None)
                identity_env = prepare.generation_environment(projected_env)
                self.assertIn(str(sdk / 'emscripten'), identity_env['PATH'])
                self.assertEqual(identity_env['RUSTC'], str(rust / 'bin/rustc'))
                self.assertEqual(identity_env['GIT_CEILING_DIRECTORIES'], str(legacy / 'strict'))
            with patch.object(prepare, 'CACHE', selected):
                paths = prepare.tool_paths()
                installed = prepare.delivery_generation(paths, prepare.environment(paths, write_config=None))
                self.assertEqual(installed, projected)
                with patch.dict(os.environ, GIT_CEILING_DIRECTORIES=str(legacy / 'changed')):
                    self.assertNotEqual(prepare.delivery_generation(paths, prepare.environment(paths, write_config=None)),
                                        projected)

    def test_generation_ignores_stale_legacy_helper_and_checks_installed_selection(self):
        host_bin = self.root / 'host-bin'
        host_bin.mkdir()
        selected_host = host_bin / 'host-tool'
        selected_host.write_text('host executable')
        selected_host.chmod(0o755)
        for name in ['diff', 'find', 'patch', 'shasum', 'tar']:
            helper = host_bin / name
            helper.write_text('host ' + name)
            helper.chmod(0o755)
        host_paths = {name: selected_host for name in
                      ['node', 'python3', 'cmake', 'ninja', 'xcrun', 'bash', 'git', 'rustup']}
        legacy_sdk = self.cache / 'sdk/install'

        def selected(command, *_args, **_kwargs):
            if '--show-sdk-version' in command:
                return '15.0'
            if '--show-sdk-path' in command or '-print-resource-dir' in command:
                return str(self.root)
            if '-vV' in command:
                return 'rustc 1.88.0'
            return str(self.builder)

        with patch.object(prepare, 'SDK', legacy_sdk), \
                patch.object(prepare, 'host_tool_paths', return_value=host_paths), \
                patch.object(prepare, 'run', side_effect=selected), \
                patch.object(prepare, 'support_payload', return_value={'sha256': 'apple-support'}):
            base = prepare.delivery_generation()
            (legacy_sdk / 'bin').mkdir(parents=True)
            wasm_linker = legacy_sdk / 'bin/wasm-ld'
            wasm_linker.write_text('pinned SDK tool')
            wasm_linker.chmod(0o755)
            self.assertEqual(prepare.delivery_generation(), base)
            paths = prepare.tool_paths()
            self.assertEqual(prepare.delivery_generation(paths, prepare.environment(paths, write_config=None)), base)
            stale = legacy_sdk / 'emscripten/diff'
            stale.parent.mkdir(parents=True)
            stale.write_text('stale legacy shadow')
            stale.chmod(0o755)
            self.assertEqual(prepare.delivery_generation(), base)
            paths = prepare.tool_paths()
            self.assertNotEqual(prepare.delivery_generation(paths, prepare.environment(paths, write_config=None)), base)

    def test_prefix_preparation_refuses_generation_mismatch_before_sources(self):
        with patch.dict(os.environ, GEOSPEC_DELIVERY_GENERATION='a' * 64), \
                patch.object(prepare, 'room'), \
                patch.object(prepare, 'delivery_generation', return_value='b' * 64), \
                patch.object(prepare, 'prepare_sources') as sources:
            with self.assertRaisesRegex(ValueError, 'Installed OCCT tools differ'):
                prepare.prepare_prefixes(self.paths, self.env)
            sources.assert_not_called()

    def test_should_refuse_changed_installed_outputs_and_cache(self):
        for path in [self.library, self.header, self.prefix / 'build/CMakeCache.txt']:
            original = path.read_bytes()
            with self.subTest(path=path.name):
                path.write_text('different bytes')
                with self.assertRaisesRegex(ValueError, 'Installed prefix outputs changed|Changed prefix cache output'):
                    self.verify()
                path.write_bytes(original)
        (self.prefix / 'install/lib/libTKExtra.a').write_text('extra library')
        with self.assertRaisesRegex(ValueError, 'Prefix toolkit inventory changed'):
            self.verify()

    def test_should_refuse_native_floor_change_even_when_recipe_is_historical(self):
        native = prepare.create_prefix_receipt(self.prefix, self.contract('native'))
        prepare.write_json(self.receipt_path, native)
        self.recipe['macosDeploymentTarget'] = '12.0'
        self.recipe_path.write_text(json.dumps(self.recipe))
        with self.assertRaisesRegex(ValueError, 'Prefix receipt command changed'):
            prepare.verify_prefix(self.prefix, self.contract('native'))

    def test_should_treat_job_controls_as_scheduling_without_rewriting_receipt(self):
        self.env.update(prepare.scheduling_environment())
        self.assertEqual(self.verify(), self.receipt)
        for variable in prepare.SCHEDULING_VARIABLES:
            self.env[variable] = '1'
        self.assertEqual(self.verify(), self.receipt)
        self.assertNotIn('EMCC_CORES', self.receipt['environment'])

    def test_should_put_validated_default_and_explicit_caps_in_actual_prepared_environment(self):
        env = prepare.environment(self.paths)
        for variable in prepare.SCHEDULING_VARIABLES:
            self.assertEqual(env[variable], '2')
        with patch.dict(os.environ, GEOSPEC_OCCT_JOBS='1', BINARYEN_CORES='2'):
            env = prepare.environment(self.paths)
            self.assertEqual(env['CARGO_BUILD_JOBS'], '1')
            self.assertEqual(env['EMCC_CORES'], '1')
            self.assertEqual(env['BINARYEN_CORES'], '2')
        for variable in prepare.SCHEDULING_VARIABLES:
            for value in ['0', '-1', '1.5', '', 'two']:
                with self.subTest(variable=variable, value=value), patch.dict(os.environ, {variable: value}):
                    with self.assertRaisesRegex(ValueError, variable + ' must be a positive integer'):
                        prepare.environment(self.paths)

    def test_should_prepare_and_verify_mixed_inputs_without_any_native_prefix(self):
        self.env.update(prepare.scheduling_environment())
        with ExitStack() as mocked:
            replacements = {
                'prepare_sources': None, 'validate_tools': None,
                'prefix_context': self.context, 'tool_paths': self.paths, 'environment': self.env,
                'input_roots': [], 'source_files': {self.recipe_path, self.builder},
                'libraries': [self.library],
            }
            for name, value in replacements.items():
                mocked.enter_context(patch.object(prepare, name, return_value=value))
            mocked.enter_context(patch.object(prepare, 'run', side_effect=lambda command, *args, **kwargs:
                                              '{"packages": []}' if 'metadata' in command else 'inert-head'))
            prepare.prepare_inputs(self.paths, self.env)
        manifest = json.loads((self.cache / 'mixed-inputs-simd128.json').read_text())
        self.assertFalse((self.cache / 'occt-native').exists())
        self.assertEqual(manifest['prefixRecovery'], {'mixed': None})
        self.assertEqual(manifest['recipeSha256'], prepare.digest(self.recipe_path))
        self.assertEqual(manifest['prefixProducerRecipe'], str(self.original_recipe))
        self.assertEqual(manifest['wasmSimd'], self.recipe['wasmSimd'])
        self.assertEqual(manifest['wasmEh'], self.recipe['wasmEh'])
        self.assertEqual(manifest['cache'], str(self.cache / 'mixed-build-simd128'))
        self.assertEqual(manifest['occtPrefix'], str(self.prefix / 'install'))
        inputs = {row['path']: row['sha256'] for row in manifest['inputs']}
        self.assertEqual(inputs[str(self.original_recipe)], prepare.digest(self.original_recipe))
        self.assertNotIn(str(self.cache / 'occt-native/prefix-receipt.json'), inputs)
        for variable in prepare.SCHEDULING_VARIABLES:
            self.assertEqual(manifest['environment'][variable], '2')

    def test_should_fetch_pinned_rust_src_registry_before_the_input_closure(self):
        library = prepare.RUST / 'lib/rustlib/src/rust/library'
        library.mkdir(parents=True)
        (library / 'Cargo.toml').write_text('inert rust-src workspace')
        lock = library / 'Cargo.lock'
        events = []

        def run(command, *args, **kwargs):
            events.append(tuple(map(str, command[1:])))
            # MT -Zbuild-std resolves the library members from the Rust prefix itself.
            return json.dumps({'packages': [{'manifest_path': str(library / 'std/Cargo.toml')}]}) \
                if 'metadata' in command else 'inert-head'

        def prepare_with(pin):
            with ExitStack() as mocked:
                replacements = {
                    'prepare_sources': None, 'validate_tools': None, 'prefix_context': self.context,
                    'tool_paths': self.paths, 'environment': self.env, 'input_roots': [],
                    'source_files': {self.recipe_path, self.builder}, 'libraries': [self.library],
                }
                for name, value in replacements.items():
                    mocked.enter_context(patch.object(prepare, name, return_value=value))
                mocked.enter_context(patch.object(prepare, 'RUST_SRC_LOCK_SHA256', pin))
                mocked.enter_context(patch.object(prepare, 'run', side_effect=run))
                closure = prepare.required_inputs
                mocked.enter_context(patch.object(prepare, 'required_inputs', side_effect=lambda manifest:
                                                  events.append(('closure',)) or closure(manifest)))
                prepare.prepare_inputs(self.paths, self.env)

        fetch = ('fetch', '--locked', '--manifest-path', str(library / 'Cargo.toml'))
        lock.write_text('selected rust-src lock')
        prepare_with(prepare.digest(lock))
        self.assertLess(events.index(fetch), events.index(('closure',)))
        self.assertTrue(prepare.MIXED_INPUTS.is_file())

        prepare.MIXED_INPUTS.unlink()
        events.clear()
        with self.assertRaisesRegex(ValueError, 'Unselected rust-src library lock'):
            prepare_with('0' * 64)
        self.assertNotIn(fetch, events)
        self.assertFalse(prepare.MIXED_INPUTS.exists())

        # ST needs no rust-src; the MT builder refuses its absence before compiling.
        lock.unlink()
        prepare_with('0' * 64)
        self.assertNotIn(fetch, events)


class MixedRecipeMaterialTest(unittest.TestCase):
    """Copy and archive inert provenance bytes; do not run a material producer."""

    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory())).resolve()
        self.output = self.root / 'kit'
        self.package = self.root / 'package'
        sdk = self.root / 'sdk'
        for path in [self.output / 'receipts', self.output / 'archives', self.package / 'scripts', sdk / 'emscripten']:
            path.mkdir(parents=True)
        for name in ['package.json', 'package-lock.json']:
            (sdk / 'emscripten' / name).write_text('{}')
        self.current = self.package / 'scripts/selected-delivery.json'
        self.current.write_text('{"headers": {}, "macosDeploymentTarget": "12.0"}\n')
        self.original = self.root / 'original-selection.json'
        self.original.write_text('{"headers": {}, "macosDeploymentTarget": "11.0"}\n')
        self.receipt = self.root / 'prefix-receipt.json'
        materials.write_json(self.receipt, {'recipeSha256': materials.digest(self.original)})
        self.closure = {
            'prefixProducerRecipe': str(self.original), 'sdkPrefix': str(sdk),
            'preparationCache': str(self.root / 'cache'),
            'inputs': [{'path': str(p), 'sha256': materials.digest(p)} for p in [self.current, self.original]],
        }
        self.mixed = {'closure': self.closure, 'paths': {}, 'prefixReceipt': self.receipt,
                      'metadata': {}, 'attribution': {'status': 'current-mixed'}}
        self.stack.enter_context(patch.object(materials, 'PACKAGE', self.package))
        self.stack.enter_context(patch.object(materials, 'mixed_producer_recipe', return_value={'mock': True}))
        self.stack.enter_context(patch.object(materials, 'mixed_tool_licenses', return_value=[]))

    def test_should_retain_selected_original_recipe_and_hash_reference_in_archive(self):
        # Exercise the unchanged material copier with a carried historical rowset,
        # not just a path/hash reference to an unavailable external manifest.
        roots = {'sdk/bin': str(self.root / 'sdk/bin')}
        rows = [{'path': str(self.root / 'sdk/bin/clang'), 'sha256': 'a' * 64}]
        support = prepare.support_payload(roots, recorded={Path(r['path']): r['sha256'] for r in rows})
        materials.write_json(self.receipt, {'recipeSha256': materials.digest(self.original), 'supportPayload': support})
        self.closure['prefixSupportMigration'] = {
            'schema': 'geospec-sdk-support-migration-v2',
            'originalReceipt': {'path': str(self.receipt), 'sha256': materials.digest(self.receipt)},
            'supportEvidence': {'schema': 'geospec-sdk-support-evidence-v1', 'inputs': rows},
        }
        inputs_path = self.root / 'current-mixed-inputs.json'
        materials.write_json(inputs_path, self.closure)
        self.mixed['paths']['inputs'] = inputs_path
        original = self.original.read_bytes()
        receipt = self.receipt.read_bytes()
        result = materials.copy_mixed_material(self.output, self.mixed)
        selected = result['prefixProducerRecipe']
        self.assertEqual((self.output / selected['path']).read_bytes(), original)
        self.assertEqual(selected['sha256'], materials.digest(self.original))
        self.assertEqual(selected['prefixReceiptSha256'], materials.digest(self.receipt))
        archive = self.root / 'kit.tar.gz'
        materials.make_relink_archive(self.output, archive)
        materials.verify_relink_archive(self.output, archive)
        with tarfile.open(archive) as bundle:
            with bundle.extractfile(materials.SOURCE_RELINK_ROOT + '/' + selected['path']) as member:
                self.assertEqual(member.read(), original)
            with bundle.extractfile(materials.SOURCE_RELINK_ROOT + '/receipts/mixed-inputs.json') as member:
                carried = json.load(member)['prefixSupportMigration']
            with bundle.extractfile(materials.SOURCE_RELINK_ROOT + '/receipts/mixed-prefix-receipt.json') as member:
                prefix_bytes = member.read()
            self.assertEqual(hashlib.sha256(prefix_bytes).hexdigest(), carried['originalReceipt']['sha256'])
            prefix_support = json.loads(prefix_bytes)['supportPayload']
            recorded = {Path(r['path']): r['sha256'] for r in carried['supportEvidence']['inputs']}
            self.assertEqual(prepare.support_payload(prefix_support['roots'], recorded=recorded), prefix_support)
        self.assertEqual(self.original.read_bytes(), original)
        self.assertEqual(self.receipt.read_bytes(), receipt)

    def test_should_accept_implicit_historical_current_recipe_only_when_both_pins_match(self):
        del self.closure['prefixProducerRecipe']
        materials.write_json(self.receipt, {'recipeSha256': materials.digest(self.current)})
        result = materials.copy_mixed_material(self.output, self.mixed)
        self.assertEqual((self.output / result['prefixProducerRecipe']['path']).read_bytes(), self.current.read_bytes())

    def test_should_not_substitute_new_current_recipe_for_missing_historical_selection(self):
        del self.closure['prefixProducerRecipe']
        with self.assertRaisesRegex(ValueError, 'Mixed prefix recipe differs from its producer receipt'):
            materials.copy_mixed_material(self.output, self.mixed)

    def test_should_refuse_selected_recipe_outside_recorded_input_pin(self):
        self.closure['inputs'] = []
        with self.assertRaisesRegex(ValueError, 'Mixed prefix recipe differs from its input pin'):
            materials.copy_mixed_material(self.output, self.mixed)

    def test_should_refuse_selected_recipe_from_different_prefix_receipt(self):
        materials.write_json(self.receipt, {'recipeSha256': materials.digest(self.current)})
        with self.assertRaisesRegex(ValueError, 'Mixed prefix recipe differs from its producer receipt'):
            materials.copy_mixed_material(self.output, self.mixed)


if __name__ == '__main__':
    unittest.main()
