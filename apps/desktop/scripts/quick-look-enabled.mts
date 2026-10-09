#!/usr/bin/env node

/**
 * Purpose: Report whether the desktop's Quick Look feature flag is on, for Nx shell targets.
 * Why: `desktop-quick-look` build targets skip vite and xcodebuild while Quick Look is disabled; the script lives in `desktop` so that project never imports the flag.
 * Environment: Node with @oxc-node/core/register; reads apps/desktop/src/shared/quick-look.ts.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/quick-look-enabled.mts
 * Exit codes: 0 when isQuickLookEnabled() is true; 1 when it is false.
 */

import { isQuickLookEnabled } from '#shared/quick-look.js';

process.exitCode = isQuickLookEnabled() ? 0 : 1;
