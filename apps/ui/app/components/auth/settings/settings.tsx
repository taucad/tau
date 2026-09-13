'use client';

import type { SettingsView } from '@better-auth-ui/core';
import { useAuth, useAuthenticate } from '@better-auth-ui/react';
import { useMemo } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs.js';
import { cn } from '#utils/ui.utils.js';
import { AccountSettings } from '#components/auth/settings/account/account-settings.js';
import { SecuritySettings } from '#components/auth/settings/security/security-settings.js';

export type SettingsProps = {
  className?: string;
  path?: string;
  /** @remarks `SettingsView` */
  view?: SettingsView;
  hideNav?: boolean;
};

/**
 * Renders the settings UI and activates the appropriate settings view based on `view` or `path`.
 *
 * @param className - Additional CSS class names applied to the root container
 * @param path - Route path used to resolve which settings view to activate when `view` is not provided
 * @param view - Explicit settings view to activate (for example, `"account"` or `"security"`)
 * @param hideNav - When `true`, hides the settings navigation tabs
 * @returns A JSX element rendering the settings layout and the selected settings panel
 */
export function Settings({ className, view, path, hideNav }: SettingsProps) {
  const { authClient, basePaths, localization, viewPaths, Link } = useAuth();
  useAuthenticate(authClient);

  if (!view && !path) {
    throw new Error('[Better Auth UI] Either `view` or `path` must be provided');
  }

  const settingsPathViews = useMemo(
    () =>
      Object.fromEntries(Object.entries(viewPaths.settings).map(([k, v]) => [v, k])) as Record<string, SettingsView>,
    [viewPaths.settings],
  );

  const currentView = view ?? (path ? settingsPathViews[path] : undefined);

  return (
    <Tabs value={currentView} className={cn('w-full gap-4 md:gap-6', className)}>
      <div className={cn(hideNav && 'hidden')}>
        <TabsList aria-label={localization.settings.settings}>
          <TabsTrigger value='account' asChild>
            <Link href={`${basePaths.settings}/${viewPaths.settings.account}`}>{localization.settings.account}</Link>
          </TabsTrigger>

          <TabsTrigger value='security' asChild>
            <Link href={`${basePaths.settings}/${viewPaths.settings.security}`}>{localization.settings.security}</Link>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value='account' tabIndex={-1}>
        <AccountSettings />
      </TabsContent>

      <TabsContent value='security' tabIndex={-1}>
        <SecuritySettings />
      </TabsContent>
    </Tabs>
  );
}
