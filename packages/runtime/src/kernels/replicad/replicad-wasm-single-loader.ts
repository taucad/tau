import createInstance from 'replicad-opencascadejs/single/init';
import type { OpenCascadeInstance } from 'replicad-opencascadejs/single/init';
import type { OcctModuleFactory } from '#kernels/occt/oc-init.js';

export type ReplicadOpenCascadeModuleFactory = OcctModuleFactory<OpenCascadeInstance>;

export const loadReplicadSingleWasm = async (): Promise<ReplicadOpenCascadeModuleFactory> => createInstance;
