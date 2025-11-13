import { File as FileIcon } from 'lucide-react';
import type { InputFormat } from '@taucad/converter';
import { Format3D } from '#components/icons/format-3d.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import type { SvgIcons } from '#components/icons/generated/svg-icons.js';

type IconConfig =
  | {
      type: 'lib';
      id: SvgIcons;
    }
  | {
      type: 'format-3d';
      id: InputFormat;
    };

export const iconFromExtension: Partial<Record<string, IconConfig>> = {
  // Languages
  scad: {
    type: 'lib',
    id: 'openscad',
  },
  kcl: {
    type: 'lib',
    id: 'zoo',
  },
  js: {
    type: 'lib',
    id: 'javascript',
  },
  jsx: {
    type: 'lib',
    id: 'javascript',
  },
  ts: {
    type: 'lib',
    id: 'typescript',
  },
  tsx: {
    type: 'lib',
    id: 'typescript',
  },

  // 3D Formats
  stl: {
    type: 'format-3d',
    id: 'stl',
  },
  step: {
    type: 'format-3d',
    id: 'step',
  },
  stp: {
    type: 'format-3d',
    id: 'step',
  },
  gltf: {
    type: 'lib',
    id: 'gltf',
  },
  glb: {
    type: 'lib',
    id: 'gltf',
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- file extension
  '3mf': {
    type: 'format-3d',
    id: '3mf',
  },
  fbx: {
    type: 'lib',
    id: 'autodesk',
  },
  obj: {
    type: 'format-3d',
    id: 'obj',
  },
  ply: {
    type: 'format-3d',
    id: 'ply',
  },
  dae: {
    type: 'lib',
    id: 'collada',
  },

  // Version Control
  gitignore: {
    type: 'lib',
    id: 'git',
  },
  gitkeep: {
    type: 'lib',
    id: 'git',
  },
  gitattributes: {
    type: 'lib',
    id: 'git',
  },
};

export function FileExtensionIcon({
  filename,
  className,
}: {
  readonly filename: string;
  readonly className?: string;
}): React.JSX.Element {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const config = iconFromExtension[extension];

  if (!config) {
    return <FileIcon className={className} />;
  }

  if (config.type === 'lib') {
    return <SvgIcon id={config.id} className={className} />;
  }

  // Config.type === 'format-3d'
  return <Format3D extension={config.id as never} className={className} />;
}
