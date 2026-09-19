/* The module's default export and one of its named exports are both `createInstance`; the local
 * name says which one this is. */
import initOpenCascade from 'replicad-opencascadejs/single/init';
import type { OpenCascadeInstance } from 'replicad-opencascadejs/single/init';

import type { OcctModuleFactory } from '@taucad/occt-core';

/** The OCCT module factory this loader hands the kernel. */
export type ReplicadOpenCascadeModuleFactory = OcctModuleFactory<OpenCascadeInstance>;

export const loadReplicadSingleWasm = async (): Promise<ReplicadOpenCascadeModuleFactory> => initOpenCascade;
