# @taucad/viewer

Tau's interactive CAD viewer: the React Three Fiber canvas, the graphics machines behind it, and the model controls around it (fit, fullscreen, grid, section view, measurement, viewer settings, parameters).

The viewer reads nothing from cookies, URLs or application stores. An embedder describes its surroundings once through `ViewerEnvironmentProvider` (colour scheme, accent, graphics backend, developer switches), mounts one `KeyboardProvider` from `@taucad/ui/components/keyboard` near its root (required: the viewer registers its shortcuts there, and throws without it), and supplies optional services through their own providers, such as `ExactMeasurementProvider` for CAD-exact distances.

## Install

```sh
npm install @taucad/viewer @taucad/runtime @taucad/ui react react-dom three @react-three/fiber xstate @xstate/react
```

`react`, `react-dom`, `three`, `@react-three/fiber`, `xstate`, `@xstate/react`, `@taucad/runtime` and `@taucad/ui` are peer dependencies so that one instance of each serves the whole application.

Components use Tailwind utility classes and the `@taucad/ui` design tokens. Import `@taucad/ui/styles/tokens.css` in your stylesheet and add the viewer's `dist` to Tailwind's sources.

## Quick start

```tsx
import { useState } from 'react';
import type { Artifact } from '@taucad/runtime';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { ViewerEnvironmentProvider, defaultViewerEnvironment } from '@taucad/viewer/environment/viewer-environment';
import { ModelViewer } from '@taucad/viewer/model-viewer';

export function Preview({ artifact, hash }: { readonly artifact: Artifact; readonly hash: string }) {
  const [selected, setSelected] = useState<string>();

  return (
    <KeyboardProvider>
      <ViewerEnvironmentProvider value={{ ...defaultViewerEnvironment, colorScheme: 'dark' }}>
        <ModelViewer
          artifact={artifact}
          artifactHash={hash}
          sourceFile='src/main.ts'
          enablePan
          enableZoom
          onComponentReference={(reference) => setSelected(reference.label)}
        />
        {selected ? <p>Selected {selected}</p> : null}
      </ViewerEnvironmentProvider>
    </KeyboardProvider>
  );
}
```

`ModelViewer` creates its own graphics machine. Pass `graphicsRef` to drive the viewer from a machine you own. With `sourceFile` set, a secondary click (right-click or long press) on a component reports its structured `GeometryComponentReference`.

## API

Each module is its own subpath, for example `@taucad/viewer/model-viewer`, `@taucad/viewer/cad/cad-viewer`, `@taucad/viewer/hooks/use-graphics` and `@taucad/viewer/machines/graphics.machine`. `package.json#exports` lists them all.

| Seam                       | Subpath                                  | Purpose                                                       |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `ViewerEnvironment`        | `environment/viewer-environment`         | Colour scheme, contrast, accent, backend preference, switches |
| `KeyboardProvider`         | `@taucad/ui/components/keyboard`         | Required: dispatches the viewer's shortcuts, such as Escape   |
| `ExactMeasurementProvider` | `graphics/three/react/exact-measurement` | CAD-exact body distances for the measure tool                 |
| `ViewerSettings` props     | `cad/viewer-settings`                    | The CAD operation timeout row, when the embedder runs CAD     |
| `debugStageBridge`         | `environment/viewer-environment`         | A debug-only component mounted in the stage under `tauDebug`  |

## License

Apache-2.0
