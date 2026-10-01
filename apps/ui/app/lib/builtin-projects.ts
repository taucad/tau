import { findBuiltinExample } from '@taucad/tau-examples/builtin';
import type { BuiltinExample } from '@taucad/tau-examples/builtin';
import { findWarehousePart } from '@taucad/warehouse/builtin';

/** Resolve shipped projects from both the example and parts catalogs. */
export const findBuiltinProject = (locator: string): BuiltinExample | undefined =>
  findBuiltinExample(locator) ?? findWarehousePart(locator);
