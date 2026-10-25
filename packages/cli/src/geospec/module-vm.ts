/**
 * The module VM `tau test` hands the GeoSpec pool: each worker imports this module by URL and bundles specs with
 * Tau's esbuild VM, which resolves the npm packages a spec imports, rather than GeoSpec's plain default, which does
 * not. A worker receives strings only, so the factory travels as this module's URL.
 *
 * @module
 */

import { createEsbuildModuleVm } from '@taucad/esbuild/vm';
import type { GeoSpecModuleVmModule } from 'geospec/runner';

const createTauModuleVm: GeoSpecModuleVmModule['default'] = createEsbuildModuleVm;

export default createTauModuleVm;
