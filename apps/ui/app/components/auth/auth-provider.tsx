import { AuthProvider as AuthProviderPrimitive } from '@better-auth-ui/react';
import type { AuthProviderProps } from '@better-auth-ui/react';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';

// Module augmentation requires `interface` (TypeScript declaration merging only
// works on interfaces, not type aliases). The upstream `AuthConfig` is declared
// as an interface, so we must use the same shape here.
// oxlint-disable typescript-eslint/consistent-type-definitions -- module augmentation requires `interface` (TS declaration merging does not work with type aliases) and the upstream `AuthConfig` is itself an interface.
declare module '@better-auth-ui/core' {
  interface AuthConfig {
    /**
     * React component used to render internal navigation links.
     * Typically TanStack Router's `Link` or Next.js's `Link`.
     */
    Link: ComponentType<PropsWithChildren<{ className?: string; href: string; to?: string }>>;
  }

  /** Widen `AdditionalField.label` to `ReactNode` in the shadcn package. */
  interface AdditionalFieldRegister {
    label: ReactNode;
  }
}
// oxlint-enable typescript-eslint/consistent-type-definitions

/**
 * Provides an authentication context by rendering the upstream Better Auth UI
 * provider with our local `AuthConfig` module augmentation in scope.
 *
 * Global mutation/query error toasts are wired directly onto the app's
 * `QueryClient` in `apps/ui/app/root.tsx`, not here — the upstream
 * `AuthProvider` only falls back to its own QueryClient when none exists in
 * context, which is a different client from the one our mutations run against.
 *
 * @param children - React nodes to render inside the authentication provider
 * @returns A React element that renders the authentication provider configured with the provided props
 */
export function AuthProvider({ children, ...config }: AuthProviderProps): React.JSX.Element {
  return <AuthProviderPrimitive {...config}>{children}</AuthProviderPrimitive>;
}
