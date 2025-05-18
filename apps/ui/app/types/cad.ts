import { Cog, Zap, Cpu } from 'lucide-react';

export type Shape2D = {
  type: '2d';
  color?: string;
  format: 'svg';
  paths: string[];
  viewbox: string;
  opacity?: number;
  strokeType?: string;
  error: boolean;
  name: string;
};

export type Shape3D = {
  type: '3d';
  faces: {
    triangles: number[];
    vertices: number[];
    normals: number[];
    faceGroups: Array<{
      start: number;
      count: number;
      faceId: number;
    }>;
  };
  edges: {
    lines: number[];
    edgeGroups: Array<{
      start: number;
      count: number;
      edgeId: number;
    }>;
  };
  color?: string;
  opacity?: number;
  error: boolean;
  name: string;
  highlight?: number[];
};

export type Shape = Shape2D | Shape3D;

export const cadKernelProviders = ['replicad', 'openscad', 'kicad', 'kcl', 'cpp'] as const;
export type CadKernelProvider = (typeof cadKernelProviders)[number];

export const modelProviders = ['sambanova', 'openai', 'anthropic', 'ollama'] as const;
export type ModelProvider = (typeof modelProviders)[number];

export const categories = {
  mechanical: { icon: Cog, color: 'text-blue' },
  electrical: { icon: Zap, color: 'text-yellow' },
  firmware: { icon: Cpu, color: 'text-purple' },
} as const;
export type Category = keyof typeof categories;
