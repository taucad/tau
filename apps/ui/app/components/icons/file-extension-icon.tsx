import { File as FileIcon } from 'lucide-react';
import type { InputFormat } from '@taucad/converter';
import { supportedInputFormats, supportedOutputFormats } from '@taucad/converter';
import { kernelConfigurations } from '@taucad/types/constants';
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

// Export for backward compatibility
export const iconFromExtension = iconConfigMap;

// Create sets for fast lookup
const supportedFormatsSet = new Set<string>([
  ...(supportedInputFormats as readonly string[]),
  ...(supportedOutputFormats as readonly string[]),
]);

// Map kernel mainFile extensions to kernel configs
const kernelExtensionMap = new Map<string, string>();
for (const kernel of kernelConfigurations) {
  const extension = kernel.mainFile.split('.').pop()?.toLowerCase();
  if (extension) {
    kernelExtensionMap.set(extension, kernel.id);
  }
}

function getIconConfig(extension: string): IconConfig | undefined {
  // Priority 1: Check config (kernel or explicit iconConfigMap)
  const explicitConfig = iconConfigMap[extension];
  if (explicitConfig) {
    return explicitConfig;
  }

  // Check kernel config
  const kernelId = kernelExtensionMap.get(extension);
  if (kernelId) {
    // Map kernel IDs to lib types
    const kernelLibMap: Record<string, SvgIcons> = {
      openscad: 'openscad',
      zoo: 'zoo',
      replicad: 'typescript',
      jscad: 'typescript',
    };

    const libId = kernelLibMap[kernelId];
    if (libId) {
      return {
        type: 'lib',
        id: libId,
      };
    }
  }

  // Priority 2: Check supported formats
  if (supportedFormatsSet.has(extension)) {
    return {
      type: 'format-3d',
      id: extension as InputFormat,
    };
  }

  // Priority 3: Fallback (return undefined, will use FileIcon)
  return undefined;
}

export function FileExtensionIcon({
  filename,
  className,
}: {
  readonly filename: string;
  readonly className?: string;
}): React.JSX.Element {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const config = getIconConfig(extension);

  if (!config) {
    return <FileIcon className={className} />;
  }

  if (config.type === 'lib') {
    return <SvgIcon id={config.id} className={className} />;
  }

  // Config.type === 'format-3d'
  return <Format3D extension={config.id as never} className={className} />;
}

/**
 * Get the icon ID for a file extension using the priority system:
 * 1. Config (explicit or kernel)
 * 2. Supported formats
 * 3. Returns undefined for fallback
 */
export function getIconIdFromExtension(extension: string): string | undefined {
  const config = getIconConfig(extension.toLowerCase());
  return config?.id;
}
