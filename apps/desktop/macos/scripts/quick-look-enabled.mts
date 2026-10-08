#!/usr/bin/env node

/**
 * Purpose: Report whether the desktop's Quick Look feature flag is on, for Nx shell targets.
 * Why: `desktop-quick-look:build-runtime` skips its vite build while Quick Look is disabled.
 * Environment: Node with @oxc-node/core/register; reads apps/desktop/src/shared/quick-look.ts.
 * Usage: node --import @oxc-node/core/register apps/desktop/macos/scripts/quick-look-enabled.mts
 * Exit codes: 0 when isQuickLookEnabled() is true; 1 when it is false.
 */

import { isQuickLookEnabled } from '#shared/quick-look.js';

process.exitCode = isQuickLookEnabled() ? 0 : 1;
