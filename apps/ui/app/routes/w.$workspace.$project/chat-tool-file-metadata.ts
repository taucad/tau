type FileMetadataDisplayInput =
  | {
      size: number;
      contentKind: 'text';
      lineCount: number;
    }
  | {
      size: number;
      contentKind: 'binary';
    };

export function formatToolFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const formatLineCount = (lineCount: number): string => (lineCount === 1 ? '1 line' : `${lineCount} lines`);

export function formatToolFileMetadata(input: FileMetadataDisplayInput): string {
  if (input.contentKind === 'binary') {
    return `binary, ${formatToolFileSize(input.size)}`;
  }
  return `${formatLineCount(input.lineCount)}, ${formatToolFileSize(input.size)}`;
}
