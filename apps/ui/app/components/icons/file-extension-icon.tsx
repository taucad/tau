import { File as FileIcon } from 'lucide-react';
import type { FileExtension } from '@taucad/types';
import { fileExtensionSet } from '@taucad/types/constants';
import { Format3D } from '#components/icons/format-3d.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import type { SvgIcons } from '#components/icons/generated/svg-icons.js';
import { getFileExtension } from '#utils/filesystem.utils.js';

type IconConfig =
  | {
      type: 'lib';
      id: SvgIcons;
    }
  | {
      type: 'format-3d';
      id: FileExtension;
    };

// Only lib types and renamed format-3d types (where extension doesn't match format name)
const iconConfigMap: Partial<Record<string, IconConfig>> = {
  // Languages (lib types)
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
    id: 'react',
  },
  ts: {
    type: 'lib',
    id: 'typescript',
  },
  tsx: {
    type: 'lib',
    id: 'react',
  },
  py: {
    type: 'lib',
    id: 'build123d',
  },
  cs: {
    type: 'lib',
    id: 'webassembly',
  },

  // Special lib types for 3D formats
  gltf: {
    type: 'lib',
    id: 'gltf',
  },
  glb: {
    type: 'lib',
    id: 'gltf',
  },
  fbx: {
    type: 'lib',
    id: 'autodesk',
  },
  dae: {
    type: 'lib',
    id: 'collada',
  },

  // USD formats
  usda: {
    type: 'lib',
    id: 'usd',
  },
  usdc: {
    type: 'lib',
    id: 'usd',
  },
  usdz: {
    type: 'lib',
    id: 'usd',
  },

  // Renamed format-3d types (extension doesn't match format name)
  stp: {
    type: 'format-3d',
    id: 'step',
  },

  // Version Control (lib types)
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

// Whole-filename matches, checked before the extension table so `tau.json`
// and `package.json` do not collapse into the generic `.json` icon — the same
// rule editors use to badge `package.json` or `vite.config.ts`.
const iconConfigByFilename: Partial<Record<string, IconConfig>> = {
  'tau.json': {
    type: 'lib',
    id: 'tau',
  },
  'package.json': {
    type: 'lib',
    id: 'npm',
  },
  'readme.md': {
    type: 'lib',
    id: 'readme.md',
  },
};

/** Last path segment, lowercased — call sites pass bare names and full paths alike. */
function getBasename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).toLowerCase();
}

function getIconConfig(filename: string): IconConfig | undefined {
  // Priority 1: whole-filename match
  const filenameConfig = iconConfigByFilename[getBasename(filename)];
  if (filenameConfig) {
    return filenameConfig;
  }

  // Priority 2: extension match
  const extension = getFileExtension(filename);
  const explicitConfig = iconConfigMap[extension];
  if (explicitConfig) {
    return explicitConfig;
  }

  if (fileExtensionSet.has(extension as FileExtension)) {
    return {
      type: 'format-3d',
      id: extension as FileExtension,
    };
  }

  // Priority 3: Fallback (return undefined, will use FileIcon)
  return undefined;
}

/**
 * Renders an icon based on a file's extension, using branded SVG icons for known
 * languages and 3D format badges for CAD file types, with a generic file icon fallback.
 */
export function FileExtensionIcon({
  filename,
  className,
}: {
  readonly filename: string;
  readonly className?: string;
}): React.JSX.Element {
  const config = getIconConfig(filename);

  if (!config) {
    return <FileIcon className={className} />;
  }

  if (config.type === 'lib') {
    return <SvgIcon id={config.id} className={className} />;
  }

  return <Format3D extension={config.id} className={className} />;
}

/**
 * Get the icon ID for a filename or path using the priority system:
 * 1. Whole-filename config
 * 2. Extension config
 * 3. Supported 3D formats
 * 4. Returns undefined for fallback
 */
export function getIconIdForFilename(filename: string): string | undefined {
  return getIconConfig(filename)?.id;
}
