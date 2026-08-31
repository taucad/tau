import { expectTypeOf, test } from 'vitest';
import {
  asBuffer,
  assertRootedPath,
  hashString,
  joinRelativePath,
  resolveImportPath,
  resolveRootedPath,
  sha256Bytes,
  sha256String,
} from '@taucad/runtime/kernel';
import { isSafeRelativePath } from '@taucad/runtime/node';
import { createExportFile, fileExtensionSet, logLevels } from '@taucad/runtime/types';

test('runtime owns the explicit veneer value contract', () => {
  void expectTypeOf(fileExtensionSet.has).toBeFunction;
  void expectTypeOf(logLevels).toBeObject;
  void expectTypeOf(createExportFile).toBeFunction;
  void expectTypeOf(asBuffer).toBeFunction;
  void expectTypeOf(hashString).toBeFunction;
  void expectTypeOf(assertRootedPath).toBeFunction;
  void expectTypeOf(joinRelativePath).toBeFunction;
  void expectTypeOf(resolveImportPath).toBeFunction;
  void expectTypeOf(resolveRootedPath).toBeFunction;
  void expectTypeOf(sha256Bytes).toBeFunction;
  void expectTypeOf(sha256String).toBeFunction;
  void expectTypeOf(isSafeRelativePath).toBeFunction;
});
