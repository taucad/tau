import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import type { LegendPayload, LegendProps, TooltipContentProps, TooltipPayloadEntry } from 'recharts';
import { popoverSurfaceVariants } from '#components/popover.variants.js';
import { cn } from '#utils/cn.js';

// Format: { THEME_NAME: CSS_SELECTOR }
const themes = { light: '', dark: '.dark' } as const;

/**
 * Maps chart data keys to their labels, icons, and theme-aware colors.
 *
 * @public
 * @example <caption>Configure a chart series.</caption>
 * ```typescript
 * import type { ChartConfig } from '@taucad/ui/components/chart';
 *
 * const config = { revenue: { label: 'Revenue', color: 'var(--chart-1)' } } satisfies ChartConfig;
 * ```
 */
export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & ({ color?: string; theme?: never } | { color?: never; theme: Record<keyof typeof themes, string> })
>;

type ChartContextProps = {
  config: ChartConfig;
};

type PayloadItem = TooltipPayloadEntry<number | string, string>;

type FormatterOptions = {
  value: number | string;
  name: string;
  item: PayloadItem;
  index: number;
  payload: readonly PayloadItem[];
};

/**
 * Props accepted by {@link ChartTooltipContent}.
 *
 * @public
 * @example <caption>Format a tooltip value.</caption>
 * ```typescript
 * import type { CustomTooltipProps } from '@taucad/ui/components/chart';
 *
 * const indicator: CustomTooltipProps['indicator'] = 'dot';
 * ```
 */
export type CustomTooltipProps = TooltipContentProps & {
  readonly className?: string;
  readonly withLabel?: boolean;
  readonly withIndicator?: boolean;
  readonly indicator?: 'line' | 'dot' | 'dashed';
  readonly nameKey?: string;
  readonly labelKey?: string;
  readonly labelFormatter?: (
    label: TooltipContentProps<number>['label'],
    payload: TooltipContentProps<number>['payload'],
  ) => React.ReactNode;
  readonly formatter?: (options: FormatterOptions) => React.ReactNode;
  readonly labelClassName?: string;
  readonly color?: string;
};

/**
 * Props accepted by {@link ChartLegendContent}.
 *
 * @public
 * @example <caption>Place a legend above a chart.</caption>
 * ```typescript
 * import type { ChartLegendContentProps } from '@taucad/ui/components/chart';
 *
 * const legend = { verticalAlign: 'top' } satisfies ChartLegendContentProps;
 * ```
 */
export type ChartLegendContentProps = {
  readonly className?: string;
  readonly withIcon?: boolean;
  readonly verticalAlign?: LegendProps['verticalAlign'];
  readonly payload?: LegendPayload[];
  readonly nameKey?: string;
};

const ChartContext = React.createContext<ChartContextProps | undefined>(undefined);

function useChart(): ChartContextProps {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />');
  }

  return context;
}

/**
 * Provides chart configuration and responsive sizing to a Recharts chart.
 *
 * @public
 * @example <caption>Render a configured responsive chart region.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ChartContainer } from '@taucad/ui/components/chart';
 *
 * const config = { value: { label: 'Value', color: 'var(--chart-1)' } };
 * createElement(ChartContainer, { config, children: createElement('div') });
 * ```
 */
function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<'div'> & {
  readonly config: ChartConfig;
  readonly children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
}): React.ReactElement {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replaceAll(':', '')}`;

  const contextValue = React.useMemo(() => ({ config }), [config]);

  return (
    <ChartContext.Provider value={contextValue}>
      <div
        data-slot='chart'
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/**
 * Emits scoped CSS variables for the configured chart series.
 *
 * @public
 * @example <caption>Render chart color variables.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ChartStyle } from '@taucad/ui/components/chart';
 *
 * createElement(ChartStyle, { id: 'sales', config: { sales: { color: 'var(--chart-1)' } } });
 * ```
 */
function ChartStyle({
  id,
  config,
}: {
  readonly id: string;
  readonly config: ChartConfig;
}): React.ReactElement | undefined {
  const colorConfig = Object.entries(config).filter(([, configItem]) => configItem.theme ?? configItem.color);

  if (colorConfig.length === 0) {
    return undefined;
  }

  return (
    <style
      // oxlint-disable-next-line react/no-danger -- Required for injecting dynamic CSS variables for chart theming
      dangerouslySetInnerHTML={{
        __html: Object.entries(themes)
          .map(
            ([theme, prefix]) => `
            ${prefix} [data-chart=${id}] {
            ${colorConfig
              .map(([key, itemConfig]) => {
                const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ?? itemConfig.color;
                return color ? `  --color-${key}: ${color};` : undefined;
              })
              .join('\n')}
            }
            `,
          )
          .join('\n'),
      }}
    />
  );
}

/**
 * Recharts tooltip primitive for use with {@link ChartTooltipContent}.
 *
 * @public
 * @example <caption>Use the Tau tooltip content renderer.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ChartTooltip } from '@taucad/ui/components/chart';
 *
 * createElement(ChartTooltip);
 * ```
 */
const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipItemProps = {
  readonly item: PayloadItem;
  readonly index: number;
  readonly payload: readonly PayloadItem[];
  readonly config: ChartConfig;
  readonly indicator: 'line' | 'dot' | 'dashed';
  readonly withIndicator: boolean;
  readonly isNestedLabel: boolean;
  readonly tooltipLabel: React.ReactNode;
  readonly formatter?: (options: FormatterOptions) => React.ReactNode;
  readonly color?: string;
  readonly nameKey?: string;
};

function TooltipItemIndicator({
  indicator,
  indicatorColor,
  isNestedLabel,
}: {
  readonly indicator: 'line' | 'dot' | 'dashed';
  readonly indicatorColor: string | undefined;
  readonly isNestedLabel: boolean;
}): React.ReactElement {
  return (
    <div
      className={cn('shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)', {
        'h-2.5 w-2.5': indicator === 'dot',
        'w-1': indicator === 'line',
        'w-0 border-[1.5px] border-dashed bg-transparent': indicator === 'dashed',
        'my-0.5': isNestedLabel && indicator === 'dashed',
      })}
      style={
        {
          '--color-bg': indicatorColor,
          '--color-border': indicatorColor,
        } as React.CSSProperties
      }
    />
  );
}

function TooltipItemContent({
  itemConfig,
  item,
  isNestedLabel,
  tooltipLabel,
}: {
  readonly itemConfig: ChartConfig[string] | undefined;
  readonly item: PayloadItem;
  readonly isNestedLabel: boolean;
  readonly tooltipLabel: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={cn('flex flex-1 justify-between gap-4 leading-none', isNestedLabel ? 'items-end' : 'items-center')}>
      <div className='grid gap-1.5'>
        {isNestedLabel ? tooltipLabel : undefined}
        <span className='text-muted-foreground'>{itemConfig?.label ?? item.name}</span>
      </div>
      {item.value === undefined ? undefined : (
        <span className='font-mono font-medium text-foreground tabular-nums'>
          {typeof item.value === 'number' ? item.value.toLocaleString() : String(item.value)}
        </span>
      )}
    </div>
  );
}

function TooltipItem({
  item,
  index,
  payload,
  config,
  indicator,
  withIndicator,
  isNestedLabel,
  tooltipLabel,
  formatter,
  color,
  nameKey,
}: TooltipItemProps): React.ReactElement {
  const dataKey = String(item.dataKey ?? item.name ?? 'value');
  const key = nameKey ?? item.name ?? dataKey;
  const itemConfig = getPayloadConfigFromPayload(config, item, key);
  const itemPayload = item.payload as Record<string, unknown> | undefined;
  const indicatorColor = color ?? (itemPayload?.['fill'] as string | undefined) ?? item.color;

  const shouldShowIndicator = withIndicator && !itemConfig?.icon;

  return (
    <div
      key={dataKey}
      className={cn(
        'flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground',
        indicator === 'dot' && 'items-center',
      )}
    >
      {formatter && item.value !== undefined && item.name ? (
        formatter({ value: item.value, name: item.name, item, index, payload })
      ) : (
        <>
          {itemConfig?.icon ? (
            <itemConfig.icon />
          ) : (
            shouldShowIndicator && (
              <TooltipItemIndicator
                indicator={indicator}
                indicatorColor={indicatorColor}
                isNestedLabel={isNestedLabel}
              />
            )
          )}
          <TooltipItemContent
            itemConfig={itemConfig}
            item={item}
            isNestedLabel={isNestedLabel}
            tooltipLabel={tooltipLabel}
          />
        </>
      )}
    </div>
  );
}

/**
 * Renders configured labels, values, and indicators for a chart tooltip.
 *
 * @public
 * @example <caption>Render tooltip content through Recharts.</caption>
 * ```typescript
 * import type { CustomTooltipProps } from '@taucad/ui/components/chart';
 *
 * const content = { indicator: 'line' } satisfies Pick<CustomTooltipProps, 'indicator'>;
 * ```
 */
function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  indicator = 'dot',
  withLabel = true,
  withIndicator = true,
  labelFormatter,
  formatter,
  labelClassName,
  color,
  nameKey,
  labelKey,
}: CustomTooltipProps): React.ReactElement | undefined {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (!withLabel || payload.length === 0) {
      return undefined;
    }

    const item = payload[0] as PayloadItem;

    const dataKey = String(item.dataKey ?? item.name ?? 'value');
    const key = labelKey ?? dataKey;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value = (() => {
      const v = !labelKey && typeof label === 'string' ? (config[label]?.label ?? label) : itemConfig?.label;

      return typeof v === 'string' || typeof v === 'number' ? v : undefined;
    })();

    if (labelFormatter) {
      return <div className={cn('font-medium', labelClassName)}>{labelFormatter(value, payload)}</div>;
    }

    if (!value) {
      return undefined;
    }

    return <div className={cn('font-medium', labelClassName)}>{value}</div>;
  }, [label, labelFormatter, payload, withLabel, labelClassName, config, labelKey]);

  if (!active || payload.length === 0) {
    return undefined;
  }

  const isNestedLabel = payload.length === 1 && indicator !== 'dot';
  const typedPayload = payload as PayloadItem[];

  return (
    <div className={cn(popoverSurfaceVariants(), 'grid min-w-32 items-start gap-1.5 px-2.5 py-1.5 text-xs', className)}>
      {isNestedLabel ? undefined : tooltipLabel}
      <div className='grid gap-1.5'>
        {typedPayload.map((item, index) => (
          <TooltipItem
            // oxlint-disable-next-line react/no-array-index-key -- chart tooltip payload has no stable unique id
            key={String(item.dataKey ?? index)}
            item={item}
            index={index}
            payload={typedPayload}
            config={config}
            indicator={indicator}
            withIndicator={withIndicator}
            isNestedLabel={isNestedLabel}
            tooltipLabel={tooltipLabel}
            formatter={formatter}
            color={color}
            nameKey={nameKey}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Recharts legend primitive for use with {@link ChartLegendContent}.
 *
 * @public
 * @example <caption>Use the Tau legend content renderer.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ChartLegend } from '@taucad/ui/components/chart';
 *
 * createElement(ChartLegend);
 * ```
 */
const ChartLegend = RechartsPrimitive.Legend;

/**
 * Renders configured labels and swatches for a chart legend.
 *
 * @public
 * @example <caption>Render a top-aligned chart legend.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { ChartLegendContent } from '@taucad/ui/components/chart';
 *
 * createElement(ChartLegendContent, { verticalAlign: 'top' });
 * ```
 */
function ChartLegendContent({
  className,
  withIcon = true,
  payload,
  verticalAlign = 'bottom',
  nameKey,
}: ChartLegendContentProps): React.ReactElement | undefined {
  const { config } = useChart();

  if (!payload?.length) {
    return undefined;
  }

  return (
    <div className={cn('flex items-center justify-center gap-4', verticalAlign === 'top' ? 'pb-3' : 'pt-3', className)}>
      {payload.map((item) => {
        const key = nameKey ?? String(item.dataKey ?? 'value');
        const itemConfig = getPayloadConfigFromPayload(config, item, key);

        return (
          <div
            key={String(item.value)}
            className={cn('flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground')}
          >
            {itemConfig?.icon && withIcon ? (
              <itemConfig.icon />
            ) : (
              <div
                className='h-2 w-2 shrink-0 rounded-[2px]'
                style={{
                  backgroundColor: item.color,
                }}
              />
            )}
            {itemConfig?.label}
          </div>
        );
      })}
    </div>
  );
}

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
): ChartConfig[string] | undefined {
  if (typeof payload !== 'object' || !payload) {
    return undefined;
  }

  const payloadPayload =
    'payload' in payload && typeof payload.payload === 'object' && payload.payload ? payload.payload : undefined;

  let configLabelKey: string = key;

  if (key in payload && typeof payload[key as keyof typeof payload] === 'string') {
    configLabelKey = payload[key as keyof typeof payload] as string;
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === 'string'
  ) {
    configLabelKey = payloadPayload[key as keyof typeof payloadPayload] as string;
  }

  return configLabelKey in config ? config[configLabelKey] : config[key];
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle };
