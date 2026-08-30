import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ReactFlow,
  Handle,
  Position,
  NodeToolbar,
  EdgeLabelRenderer,
  BaseEdge,
  getSmoothStepPath,
  ReactFlowProvider,
} from '@xyflow/react';
import type { Node, Edge, EdgeProps, NodeProps, NodeTypes, EdgeTypes, ColorMode } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ClientOnly } from '#components/ui/utils/client-only.js';
import { Theme, useTheme } from '#hooks/use-theme.js';
import { popoverSurfaceVariants } from '#components/ui/popover.variants.js';
import { cn } from '#utils/ui.utils.js';

type DiagramNodeData = {
  label: string;
  description?: string;
};

type DiagramNode = Node<DiagramNodeData>;

type GroupNodeData = {
  label: string;
};

type GroupNode = Node<GroupNodeData>;

function GroupNodeComponent({ data }: NodeProps<GroupNode>): React.JSX.Element {
  return (
    <div className='size-full rounded-2xl bg-muted/20 p-3'>
      <div className='text-xs font-semibold tracking-wide text-muted-foreground/80'>{data.label}</div>
    </div>
  );
}

function DiagramNodeContent({ data }: NodeProps<DiagramNode>): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      <div
        className='group'
        onMouseEnter={() => {
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
        }}
      >
        <Handle type='target' position={Position.Top} className='opacity-0!' />
        <Handle type='source' position={Position.Bottom} className='opacity-0!' />
        <Handle type='target' position={Position.Left} id='left-target' className='opacity-0!' />
        <Handle type='source' position={Position.Right} id='right-source' className='opacity-0!' />
        <Handle type='target' position={Position.Right} id='right-target' className='opacity-0!' />
        <Handle type='source' position={Position.Left} id='left-source' className='opacity-0!' />

        <div className='cursor-pointer rounded-xl border border-border/50 bg-background/90 px-4 py-2.5 shadow-sm backdrop-blur-sm transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-md'>
          <div className='text-sm font-medium text-foreground'>{data.label}</div>
        </div>
      </div>

      {data.description && (
        <NodeToolbar isVisible={isHovered} position={Position.Bottom} offset={8}>
          <div className={cn(popoverSurfaceVariants(), 'z-50 w-64 p-3 text-xs leading-relaxed')}>
            {data.description}
          </div>
        </NodeToolbar>
      )}
    </>
  );
}

type LabeledEdgeData = {
  label?: string;
};

function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<Edge<LabeledEdgeData>>): React.JSX.Element {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
            }}
            className='rounded-md border border-border/40 bg-background/95 px-2 py-1 text-[11px] leading-tight font-medium text-muted-foreground shadow-sm backdrop-blur-sm'
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes: NodeTypes = {
  diagram: DiagramNodeContent,
  group: GroupNodeComponent,
};

const edgeTypes: EdgeTypes = {
  labeled: LabeledEdge,
};

function InteractiveDiagramRenderer({
  nodes: initialNodes,
  edges: initialEdges,
  title,
  description,
}: {
  readonly nodes: Array<Node<DiagramNodeData | GroupNodeData>>;
  readonly edges: Edge[];
  readonly title?: string;
  readonly description?: string;
}): React.JSX.Element {
  const { theme } = useTheme();
  const colorMode: ColorMode = theme === Theme.DARK ? 'dark' : 'light';

  const [selectedNode, setSelectedNode] = useState<string>();

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) {
      return undefined;
    }
    const node = initialNodes.find((n) => n.id === selectedNode);
    if (!node || node.type === 'group') {
      return undefined;
    }
    return node.data as DiagramNodeData;
  }, [selectedNode, initialNodes]);

  const highlightedEdges = useMemo(() => {
    if (!selectedNode) {
      return new Set<string>();
    }
    return new Set(
      initialEdges
        .filter((edge) => edge.source === selectedNode || edge.target === selectedNode)
        .map((edge) => edge.id),
    );
  }, [selectedNode, initialEdges]);

  const connectedNodes = useMemo(() => {
    if (!selectedNode) {
      return new Set<string>();
    }
    const connected = new Set<string>([selectedNode]);
    for (const edge of initialEdges) {
      if (edge.source === selectedNode) {
        connected.add(edge.target);
      }
      if (edge.target === selectedNode) {
        connected.add(edge.source);
      }
    }
    return connected;
  }, [selectedNode, initialEdges]);

  const styledNodes = useMemo(() => {
    return initialNodes.map((node) => {
      if (!selectedNode || node.type === 'group') {
        return node;
      }
      const isConnected = connectedNodes.has(node.id);
      return {
        ...node,
        style: {
          ...node.style,
          opacity: isConnected ? 1 : 0.3,
          transition: 'opacity 200ms ease',
        },
      };
    });
  }, [initialNodes, selectedNode, connectedNodes]);

  const styledEdges = useMemo(() => {
    return initialEdges.map((edge) => {
      const isHighlighted = highlightedEdges.has(edge.id);
      return {
        ...edge,
        animated: selectedNode ? isHighlighted : (edge.animated ?? false),
        style: {
          ...edge.style,
          stroke: selectedNode
            ? isHighlighted
              ? 'var(--color-primary)'
              : 'var(--color-border)'
            : 'var(--color-muted-foreground)',
          strokeWidth: selectedNode ? (isHighlighted ? 2.5 : 1.5) : 2,
          opacity: selectedNode ? (isHighlighted ? 1 : 0.15) : 1,
          transition: 'all 200ms ease',
        },
      };
    });
  }, [initialEdges, selectedNode, highlightedEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'group') {
      return;
    }
    setSelectedNode((previous) => (previous === node.id ? undefined : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(undefined);
  }, []);

  return (
    <div className='not-prose my-6 overflow-hidden rounded-xl border border-border/50 bg-muted/20'>
      {(title ?? description) && (
        <div className='border-b border-border/30 px-4 py-3'>
          {title && <div className='text-sm font-semibold text-foreground'>{title}</div>}
          {description && <div className='mt-0.5 text-xs text-muted-foreground'>{description}</div>}
        </div>
      )}

      <div className='interactive-diagram relative h-[640px] w-full'>
        <style>{`
          .interactive-diagram .react-flow__node-group {
            border: none !important;
            background: none !important;
            padding: 0 !important;
          }
          .interactive-diagram .react-flow__edge-labels {
            z-index: 5;
          }
        `}</style>
        <ReactFlow
          nodes={styledNodes}
          edges={styledEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          colorMode={colorMode}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.5}
          maxZoom={1.5}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        />
      </div>

      {selectedNodeData && (
        <div className='border-t border-border/30 px-4 py-3'>
          <div className='flex items-center gap-2'>
            <div className='size-2 rounded-full bg-primary' />
            <span className='text-sm font-semibold text-foreground'>{selectedNodeData.label}</span>
          </div>
          {selectedNodeData.description && (
            <p className='mt-1 text-xs leading-relaxed text-muted-foreground'>{selectedNodeData.description}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function InteractiveDiagram(props: {
  readonly nodes: Array<Node<DiagramNodeData | GroupNodeData>>;
  readonly edges: Edge[];
  readonly title?: string;
  readonly description?: string;
}): ReactNode {
  return (
    <ClientOnly>
      <ReactFlowProvider>
        <InteractiveDiagramRenderer {...props} />
      </ReactFlowProvider>
    </ClientOnly>
  );
}
