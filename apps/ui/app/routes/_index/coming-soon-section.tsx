import { Package, Cpu, Sparkles } from 'lucide-react';
import { metaConfig } from '#constants/meta.constants.js';
import { formatKernelList } from '#utils/kernel.utils.js';

export function ComingSoonSection(): React.JSX.Element {
  const kernelList = formatKernelList();

  return (
    <div className="border-t">
      <div className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm font-medium">
              <Sparkles className="size-4 text-primary" />
              Coming Soon
            </div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Embeddable CAD Components</h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Drop interactive 3D viewers and parametric editors directly into your web applications.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border bg-background/50 p-6 opacity-75">
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-muted">
                <Cpu className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mb-2 font-semibold">CAD Kernels</h3>
              <p className="text-sm text-muted-foreground">{kernelList} kernels as standalone web components.</p>
            </div>

            <div className="rounded-xl border bg-background/50 p-6 opacity-75">
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-muted">
                <Package className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mb-2 font-semibold">3D Viewer</h3>
              <p className="text-sm text-muted-foreground">
                Embed the CadViewer component with full orbit controls, grid, and axes.
              </p>
            </div>

            <div className="rounded-xl border bg-background/50 p-6 opacity-75">
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-muted">
                <Sparkles className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mb-2 font-semibold">Parameters UI</h3>
              <p className="text-sm text-muted-foreground">
                Auto-generated parameter controls from OpenSCAD Customizer or JSON Schema.
              </p>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              Want early access?{' '}
              <a href={`mailto:${metaConfig.salesEmail}`} className="text-primary underline-offset-4 hover:underline">
                Get in touch
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
