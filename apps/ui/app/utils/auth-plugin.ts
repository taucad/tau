import type { AuthPluginComponents, AuthPlugin as AuthPluginPrimitive } from '@better-auth-ui/react';

/** Props the shadcn `<Auth>` router spreads onto plugin-contributed auth views. */
export type AuthViewProps = {
  className?: string;
  socialLayout?: 'auto' | 'horizontal' | 'vertical' | 'grid';
  socialPosition?: 'top' | 'bottom';
};

/** Props the shadcn `<Settings>` router spreads onto plugin-contributed settings views. */
export type SettingsViewProps = {
  className?: string;
};

/** Shadcn plugin type. Plugin authors import this from `@/lib/auth/auth-plugin`. */
export type AuthPlugin = AuthPluginPrimitive<AuthPluginComponents, AuthViewProps, SettingsViewProps>;

/**
 * First plugin-provided captcha component.
 * Uses a plain loop instead of `Array#find` so predicate typing cannot be
 * mis-inferred as async (eslint `no-misused-promises` / `promise-function-async`).
 */
export const getCaptchaComponentFromPlugins = (
  pluginList: readonly AuthPlugin[],
): AuthPlugin['captchaComponent'] | undefined => {
  for (const plugin of pluginList) {
    const captcha = plugin.captchaComponent;
    if (captcha) {
      return captcha;
    }
  }

  return undefined;
};

declare module '@better-auth-ui/core' {
  /** Widens `useAuth().plugins` to the shadcn-typed `AuthPlugin`. */
  interface AuthPluginRegister {
    shadcn: AuthPlugin;
  }
}
