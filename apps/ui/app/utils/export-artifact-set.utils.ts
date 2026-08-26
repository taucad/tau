import JSZip from 'jszip';
import type { ExportFile } from '@taucad/types';
import { asBuffer, downloadBlob } from '@taucad/utils/file';
import { isSafeRelativePath } from '@taucad/utils/path';

export type ExportArtifact = Omit<ExportFile, 'mimeType'> & {
  readonly mimeType: string;
};

export type ExportArtifactGroup = {
  readonly directory?: string;
  readonly files: readonly ExportArtifact[];
};

const validateGroups = (groups: readonly ExportArtifactGroup[]): void => {
  const paths = new Set<string>();
  for (const group of groups) {
    if (group.files.length === 0) {
      throw new Error('Cannot download an empty export artifact set');
    }
    for (const file of group.files) {
      const path = group.directory ? `${group.directory}/${file.name}` : file.name;
      if (!isSafeRelativePath(path)) {
        throw new Error(`Export artifact has an unsafe relative path: ${path}`);
      }
      if (paths.has(path)) {
        throw new Error(`Export artifact path is duplicated: ${path}`);
      }
      paths.add(path);
    }
  }
};

export const createExportArtifactZip = async (groups: readonly ExportArtifactGroup[]): Promise<Blob> => {
  validateGroups(groups);
  const zip = new JSZip();
  for (const group of groups) {
    for (const file of group.files) {
      zip.file(group.directory ? `${group.directory}/${file.name}` : file.name, asBuffer(file.bytes));
    }
  }
  return zip.generateAsync({ type: 'blob' });
};

export const downloadExportArtifactSet = async (
  files: readonly ExportArtifact[],
  options: { readonly singleFileName: string; readonly archiveName: string },
): Promise<void> => {
  validateGroups([{ files }]);
  if (files.length === 1) {
    downloadBlob(new Blob([asBuffer(files[0]!.bytes)], { type: files[0]!.mimeType }), options.singleFileName);
    return;
  }
  downloadBlob(await createExportArtifactZip([{ files }]), options.archiveName);
};
