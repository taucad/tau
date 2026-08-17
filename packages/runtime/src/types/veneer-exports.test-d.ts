import { expectTypeOf, test } from 'vitest';
import type {
  // @ts-expect-error application API contracts are not runtime contracts
  ChatError,
  // @ts-expect-error project records are not runtime contracts
  File,
  FileExtension,
  Geometry,
  JSONSchema7,
  JSONValue,
  // @ts-expect-error publication records are not runtime contracts
  PublicationRecord,
  // @ts-expect-error workspace markers are application infrastructure
  WorkspaceMarker,
} from '@taucad/runtime/types';

test('runtime owns the explicit veneer type contract', () => {
  void expectTypeOf<FileExtension>().toBeString;
  void expectTypeOf<Geometry>().toBeObject;
  void expectTypeOf<JSONSchema7>().toBeObject;
  void expectTypeOf<JSONValue>().not.toBeNever;
  void expectTypeOf<[ChatError, File, PublicationRecord, WorkspaceMarker]>().toBeArray;
});
