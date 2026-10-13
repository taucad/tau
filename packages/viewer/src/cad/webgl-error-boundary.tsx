import React from 'react';
import type { ReactNode, ErrorInfo } from 'react';

type WebglErrorBoundaryState = {
  hasError: boolean;
  error: Error | undefined;
};

type WebglErrorBoundaryProps = {
  readonly children: ReactNode;
  readonly fallback: (props: WebglErrorFallbackProps) => ReactNode;
};

export type WebglErrorFallbackProps = {
  readonly error: Error | undefined;
  readonly onRetry: () => void;
  readonly onReload: () => void;
};

/**
 * Error boundary that catches WebGL-related crashes (e.g. null context from
 * exceeding the browser limit, postprocessing EffectComposer failures, GPU
 * driver errors).  Renders a fallback UI with retry / reload actions instead
 * of tearing down the whole page.
 */
export class WebglErrorBoundary extends React.Component<WebglErrorBoundaryProps, WebglErrorBoundaryState> {
  public static getDerivedStateFromError(error: Error): WebglErrorBoundaryState {
    return { hasError: true, error };
  }

  public override state: WebglErrorBoundaryState = { hasError: false, error: undefined };

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[WebglErrorBoundary] Rendering failed:', error, errorInfo);
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback({
        error: this.state.error,
        onRetry: this.handleRetry,
        onReload: this.handleReload,
      });
    }

    return this.props.children;
  }

  private readonly handleRetry = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  private readonly handleReload = (): void => {
    globalThis.location.reload();
  };
}
