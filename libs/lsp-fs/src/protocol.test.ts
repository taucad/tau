import { describe, it, expect } from 'vitest';

import { fsContentRequest, fsFindFilesRequest, fsReadDirectoryRequest, fsStatRequest } from '#protocol.js';

describe('lsp-fs protocol method names', () => {
  it('matches fs/* wire strings', () => {
    expect(fsContentRequest.method).toBe('fs/content');
    expect(fsStatRequest.method).toBe('fs/stat');
    expect(fsReadDirectoryRequest.method).toBe('fs/readDir');
    expect(fsFindFilesRequest.method).toBe('fs/findFiles');
  });
});
