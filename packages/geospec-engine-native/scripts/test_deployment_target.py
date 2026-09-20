#!/usr/bin/env python3
"""Pure host checks for the selected native deployment floor; no build or product load.

Usage: python3 -B packages/geospec-engine-native/scripts/test_deployment_target.py
Exit: 0 success; 1 assertion failure. Tool discovery and execution are mocked.
"""

import ast
import importlib.util
from pathlib import Path
import re
import shlex
import subprocess
import unittest
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parent


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


prepare = load_script('prepare-delivery')
materials = load_script('generate-delivery-materials')


class DeploymentTargetTest(unittest.TestCase):
    def test_should_carry_job_limits_and_owned_git_ceilings_through_env_i(self):
        tools = {name: f'/recorded/{name}/bin/{name}'
                 for name in ['node', 'python3', 'cmake', 'ninja', 'git', 'rustup', 'xcrun', 'bash']}
        closure = {
            'cache': '/recorded/build', 'output': '/recorded/output',
            'occtPrefix': '/recorded/prep/occt-mixed/install',
            'rustPrefix': '/recorded/rust', 'sdkPrefix': '/recorded/sdk',
            'sourceRoot': str(materials.ROOT), 'preparationCache': '/recorded/prep',
            'environment': {'HOME': '/recorded/home', 'EM_CONFIG': '/recorded/config'},
            'tools': tools,
            **{name: f'/recorded/tools/{name}' for name in ['rustc', 'cargo', 'emcc', 'emxx', 'emar']},
        }
        mixed = {'closure': closure, 'attribution': {'mock': True},
                 'commands': [{'executable': '/usr/bin/env', 'args': []}],
                 'prefix': {'environment': {}, 'command': ['/usr/bin/env']}}
        with patch.object(Path, 'read_text', return_value='# mocked Emscripten config\n'):
            recipe = materials.mixed_producer_recipe(mixed)
        self.assertNotIn('EMCC_CORES', recipe['recordedEnvironment'])
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

    def recipe(self):
        workspace = (materials.ROOT / 'pnpm-workspace.yaml').read_text()
        version = re.search(r"^\s*'@napi-rs/cli':\s*([^\s#]+)", workspace, re.MULTILINE)[1]
        with patch.object(materials, 'selected_executable', side_effect=lambda name: Path('/tools') / name), \
                patch.object(materials, 'run', return_value='/tools/selected\n'), \
                patch.object(materials, 'executable_identity', return_value={'mock': True}):
            return materials.native_producer_recipe({'selectedVersion': version})

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


if __name__ == '__main__':
    unittest.main()
