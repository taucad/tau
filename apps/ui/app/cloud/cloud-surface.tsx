import { Component, Suspense, useEffect, useSyncExternalStore } from 'react';
import type { ComponentType, ErrorInfo, ReactNode } from 'react';
import { useOptionalFinancialSession } from '@taucad/billing-ui/providers/financial-session-provider';
import { reportUiError } from '#lib/error-reporting.js';
import type { CloudLoader } from '#cloud/cloud-loader.js';
import { useCloudIdentity } from '#cloud/cloud-identity.js';
import { cloudSurfaces } from '#cloud/cloud-entries.js';
import type { CloudSurfacesModule } from '#cloud/cloud-entries.js';
import { useDeploymentMode } from '#cloud/use-deployment-mode.js';

type FinancialSessionHandle = ReturnType<typeof useOptionalFinancialSession>;

/**
 * The one helper every lazy Cloud surface mounts through (adaptive app deployment mode charter D6, I8, BA11, BA25):
 * an error boundary and a local Suspense boundary, both falling back to the surface's non-Cloud rendering, and a render
 * from the loader's settled state, never from an unsettled `lazy()`. A chunk that rejects, hangs or throws leaves the
 * shell interactive. The surface is keyed by the financial identity, so an identity change remounts it and nothing
 * else (D17). Part of Core.
 */

type BoundaryProps = Readonly<{ fallback: ReactNode; children: ReactNode }>;

/** Catches a Cloud surface that throws in render or in an effect; reports it once and shows the fallback. */
class CloudSurfaceBoundary extends Component<BoundaryProps, { readonly hasFailed: boolean }> {
  public static getDerivedStateFromError(): { hasFailed: boolean } {
    return { hasFailed: true };
  }

  public override state = { hasFailed: false };

  public override componentDidCatch(error: Error, _info: ErrorInfo): void {
    void reportUiError(error);
  }

  public override render(): ReactNode {
    return this.state.hasFailed ? this.props.fallback : this.props.children;
  }
}

/** Calls the surface's render beneath both local boundaries, so a throw or a suspension in it is contained. */
function CloudRendering<Module>({
  module,
  render,
}: Readonly<{ module: Module; render: (module: Module) => ReactNode }>): ReactNode {
  /* A Cloud chunk carries the context its surfaces need (the billing legal links); Core hands it the financial session,
   * so the chunk imports no Core provider module (gate G1, one-way dependency). */
  const financialSession = useOptionalFinancialSession();
  const { CloudProviders } = module as {
    readonly CloudProviders?: ComponentType<{
      readonly financialSession: FinancialSessionHandle | undefined;
      readonly children: ReactNode;
    }>;
  };
  return CloudProviders === undefined ? (
    render(module)
  ) : (
    <CloudProviders financialSession={financialSession}>{render(module)}</CloudProviders>
  );
}

/** What {@link CloudSurface} takes. @public */
export type CloudSurfaceProps<Module> = Readonly<{
  /** The entry's loader; none while the surface has no Cloud chunk (the W2 skeleton). */
  loader?: CloudLoader<Module> | undefined;
  /** Whether the mode allows the Cloud rendering (`funded`); otherwise the fallback, and no load starts. */
  enabled: boolean;
  /** The financial identity's key: a change remounts the Cloud rendering. The bound identity's by default. */
  identityKey?: string | undefined;
  /** The non-Cloud rendering, shown before, instead of and after a failed Cloud rendering. */
  fallback: ReactNode;
  /** The Cloud rendering, from the loaded module. */
  render: (module: Module) => ReactNode;
}>;

/* One object, so `useSyncExternalStore` sees a stable snapshot when a surface has no loader yet. */
const idle = { status: 'idle' } as const;
const idleState = (): typeof idle => idle;
const noSubscription = (): (() => void) => () => undefined;

/**
 * Mount a lazy Cloud surface.
 *
 * @param props - The loader, whether the mode allows it, the identity, the fallback and the Cloud rendering.
 * @returns The surface.
 * @public
 */
export function CloudSurface<Module>({
  loader,
  enabled,
  identityKey: givenKey,
  fallback,
  render,
}: CloudSurfaceProps<Module>): React.JSX.Element {
  const bound = useCloudIdentity();
  const identityKey = givenKey ?? bound.key;
  const state = useSyncExternalStore(
    loader?.subscribe ?? noSubscription,
    loader?.state ?? idleState,
    loader?.state ?? idleState,
  );
  useEffect(() => {
    if (enabled) {
      loader?.load();
    }
  }, [enabled, loader]);
  if (!enabled || state.status !== 'loaded') {
    // oxlint-disable-next-line react/jsx-no-useless-fragment -- turns the fallback node into an element for typed callers.
    return <>{fallback}</>;
  }
  return (
    <CloudSurfaceBoundary key={identityKey} fallback={fallback}>
      <Suspense fallback={fallback}>
        <CloudRendering module={state.module} render={render} />
      </Suspense>
    </CloudSurfaceBoundary>
  );
}

/**
 * A surface from the Cloud chunk, mounted while the display mode is `funded` (adaptive app deployment mode D6, the
 * surface table): the one loader, the one helper, and the facade's non-Cloud rendering before, instead of and after it.
 *
 * @param props - The non-Cloud rendering and the Cloud rendering from the chunk's module.
 * @returns The surface.
 * @public
 */
export function FundedSurface({
  fallback,
  render,
  enabled = true,
}: Readonly<{
  fallback: ReactNode;
  render: (module: CloudSurfacesModule) => ReactNode;
  /** A further condition beside `funded`, such as a confirmed basis. */
  enabled?: boolean;
}>): React.JSX.Element {
  const funded = useDeploymentMode().state === 'funded';
  return <CloudSurface loader={cloudSurfaces} enabled={funded && enabled} fallback={fallback} render={render} />;
}
