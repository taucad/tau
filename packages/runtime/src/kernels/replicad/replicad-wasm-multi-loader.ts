import createInstance from 'replicad-opencascadejs/multi/init';
import type { OpenCascadeInstance } from 'replicad-opencascadejs/multi/init';
import type { OcctModuleFactory } from '#kernels/occt/oc-init.js';

export type ReplicadOpenCascadeModuleFactory = OcctModuleFactory<OpenCascadeInstance>;

export const loadReplicadMultiWasm = async (): Promise<ReplicadOpenCascadeModuleFactory> => createInstance;
