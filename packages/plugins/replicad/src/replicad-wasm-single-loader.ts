import createInstance from 'replicad-opencascadejs/single/init';
import type { OpenCascadeInstance } from 'replicad-opencascadejs/single/init';

import type { OcctModuleFactory } from '@taucad/occt-core';

/**
 */
export type ReplicadOpenCascadeModuleFactory = OcctModuleFactory<OpenCascadeInstance>;

export const loadReplicadSingleWasm = async (): Promise<ReplicadOpenCascadeModuleFactory> => createInstance;
