/* oxlint-disable no-barrel-files/no-barrel-files -- compatibility adapter for the extracted @taucad/vm substrate */
import { ModuleManager as VmModuleManager } from '@taucad/vm/internal';
import type { BuiltinModule as VmBuiltinModule, FetchedModule as VmFetchedModule } from '@taucad/vm/internal';

export type BuiltinModule = VmBuiltinModule;
export type FetchedModule = VmFetchedModule;

export class ModuleManager extends VmModuleManager {}
