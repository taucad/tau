import type * as Nanoraster from 'nanoraster';

/**
 * Load one image renderer backend for a capability worker context.
 * @returns The initialized renderer module.
 */
export const loadImageBackend = async (): Promise<typeof Nanoraster> => import('nanoraster');
