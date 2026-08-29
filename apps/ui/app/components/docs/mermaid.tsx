import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ClientOnly } from '#components/ui/utils/client-only.js';
import { Theme, useTheme } from '#hooks/use-theme.js';

const fontFamily = "'Geist Sans', ui-sans-serif, system-ui, sans-serif";

const diagramCssVariables = [
  '--diagram-node',
  '--diagram-node-border',
  '--diagram-node-text',
  '--diagram-cluster',
  '--diagram-cluster-border',
  '--diagram-line',
  '--diagram-text',
  '--diagram-note',
  '--diagram-note-border',
  '--diagram-accent',
] as const;

type DiagramVariable = (typeof diagramCssVariables)[number];
type DiagramColors = Record<DiagramVariable, string>;

/**
 * Resolves CSS custom properties (which may use oklch, var() chains, etc.)
 * to hex strings that Mermaid's themeVariables API requires.
 */
function resolveDiagramColors(): DiagramColors {
  const container = document.createElement('div');
  container.style.display = 'none';

  const probes = diagramCssVariables.map((variable) => {
    const element = document.createElement('span');
    element.style.color = `var(${variable})`;
    container.append(element);
    return element;
  });

  document.body.append(container);

  const result: Record<string, string> = {};
  for (const [index, element] of probes.entries()) {
    const variable = diagramCssVariables[index];
    if (variable) {
      result[variable] = computedColorToHex(getComputedStyle(element).color);
    }
  }

  container.remove();
  return result as DiagramColors;
}

/**
 * Converts any CSS color string (rgb, oklch, hsl, etc.) to a #rrggbb hex string.
 * Uses Canvas 2D which reliably handles all CSS Color Level 4 formats.
 */
function computedColorToHex(color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) {
    return 'var(--muted-foreground)';
  }

  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r = 128, g = 128, b = 128] = context.getImageData(0, 0, 1, 1).data;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function buildThemeVariables(colors: DiagramColors, { isDark }: { isDark: boolean }): Record<string, unknown> {
  const node = colors['--diagram-node'];
  const nodeBorder = colors['--diagram-node-border'];
  const nodeText = colors['--diagram-node-text'];
  const cluster = colors['--diagram-cluster'];
  const clusterBorder = colors['--diagram-cluster-border'];
  const line = colors['--diagram-line'];
  const text = colors['--diagram-text'];
  const note = colors['--diagram-note'];
  const noteBorder = colors['--diagram-note-border'];
  const accent = colors['--diagram-accent'];

  return {
    darkMode: isDark,
    primaryColor: node,
    primaryTextColor: nodeText,
    primaryBorderColor: nodeBorder,
    secondaryColor: note,
    secondaryTextColor: text,
    secondaryBorderColor: noteBorder,
    tertiaryColor: cluster,
    tertiaryTextColor: text,
    tertiaryBorderColor: clusterBorder,
    lineColor: line,
    textColor: text,
    mainBkg: node,
    nodeBkg: node,
    nodeBorder,
    nodeTextColor: nodeText,
    clusterBkg: cluster,
    clusterBorder,
    edgeLabelBackground: node,
    titleColor: nodeText,
    actorBkg: node,
    actorBorder: nodeBorder,
    actorTextColor: nodeText,
    actorLineColor: line,
    signalColor: line,
    signalTextColor: text,
    labelBoxBkgColor: cluster,
    labelBoxBorderColor: clusterBorder,
    labelTextColor: text,
    loopTextColor: text,
    activationBorderColor: accent,
    activationBkgColor: node,
    sequenceNumberColor: nodeText,
    noteBkgColor: note,
    noteBorderColor: noteBorder,
    noteTextColor: text,
  };
}

const themeCss = [
  '.node rect, .node circle, .node ellipse, .node polygon { rx: 12px; ry: 12px; }',
  '.cluster rect { rx: 16px; ry: 16px; }',
  'rect.actor { rx: 12px; ry: 12px; }',
  '.nodeLabel { font-weight: 500; font-size: 16px; }',
  '.cluster-label .nodeLabel { font-weight: 600; font-size: 16px; }',
  '.edgeLabel { font-size: 15px; font-weight: 500; }',
  '.edgeLabel rect { opacity: 1; rx: 8px; ry: 8px; stroke: var(--diagram-node-border); stroke-width: 1px; }',
  '.edgePath .path { stroke-width: 2px; }',
  '.messageText { font-size: 14px; font-weight: 500; }',
  '.loopText { font-size: 13px; }',
  '.actor { stroke-width: 1.5px; }',
].join('\n');

let mermaidIdCounter = 0;

function MermaidRenderer({ chart }: { readonly chart: string }): React.JSX.Element | undefined {
  const [id] = useState(() => `mermaid-${mermaidIdCounter++}`);
  const { theme, isHighContrast } = useTheme();
  const isDark = theme === Theme.DARK;
  const [svg, setSvg] = useState<string>();
  // oxlint-disable-next-line typescript/no-invalid-void-type -- React DOM refs require null initializer
  const containerRef = useRef<HTMLDivElement>(null);
  const bindFunctionsRef = useRef<((element: Element) => void) | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setSvg(undefined);

    // async-iife: bootstrap — Mermaid is dynamically imported; effect cleanup cancels in-flight render
    void (async () => {
      const { default: mermaid } = await import('mermaid');

      // oxlint-disable-next-line eslint/no-constant-condition, typescript/no-unnecessary-condition -- mutated by cleanup after await
      if (cancelled) {
        return;
      }

      const themeVariables = buildThemeVariables(resolveDiagramColors(), { isDark });

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        fontFamily,
        theme: 'base',
        themeVariables,
        themeCSS: themeCss, // eslint-disable-line @typescript-eslint/naming-convention -- Mermaid API property name.
        flowchart: { curve: 'basis', padding: 20 },
      });

      const result = await mermaid.render(id, chart.replaceAll(String.raw`\n`, '\n'));

      // oxlint-disable-next-line eslint/no-constant-condition, typescript/no-unnecessary-condition -- mutated by cleanup after await
      if (cancelled) {
        return;
      }

      bindFunctionsRef.current = result.bindFunctions;
      setSvg(result.svg);
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, isDark, isHighContrast, id]);

  useEffect(() => {
    if (containerRef.current && bindFunctionsRef.current) {
      bindFunctionsRef.current(containerRef.current);
      bindFunctionsRef.current = undefined;
    }
  }, [svg]);

  if (!svg) {
    return undefined;
  }

  return (
    <div className='not-prose my-6 overflow-x-auto rounded-xl border border-border/50 bg-muted/30 px-4 py-6'>
      <div
        // oxlint-disable-next-line react/no-danger -- Mermaid returns pre-rendered SVG strings; dangerouslySetInnerHTML is the intended injection method.
        dangerouslySetInnerHTML={{ __html: svg }}
        ref={containerRef}
        className='[&>svg]:mx-auto [&>svg]:block [&>svg]:bg-transparent!'
      />
    </div>
  );
}

/**
 * Renders a Mermaid diagram from chart definition text.
 * Only mounts on the client to avoid SSR hydration issues.
 */
export function Mermaid({ chart }: { readonly chart: string }): ReactNode {
  return (
    <ClientOnly>
      <MermaidRenderer chart={chart} />
    </ClientOnly>
  );
}
