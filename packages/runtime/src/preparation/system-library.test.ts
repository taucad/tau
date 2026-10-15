import { describe, expect, it } from 'vitest';

import { missingSystemLibrary, systemLibraryRefusal } from '#preparation/system-library.js';

describe('missingSystemLibrary', () => {
  it.each([
    ['ImportError: libGL.so.1: cannot open shared object file: No such file or directory', 'libGL.so.1'],
    ['Error loading shared library libX11.so.6: No such file or directory (needed by OCP.so)', 'libX11.so.6'],
    ['dyld[812]: Library not loaded: /usr/lib/libc++.1.dylib\n  Referenced from: worker', '/usr/lib/libc++.1.dylib'],
  ])('should name the library in %j', (output, library) => {
    expect(missingSystemLibrary(output)).toBe(library);
  });

  it('should not treat a library missing from the closure itself as a host library', () => {
    expect(missingSystemLibrary('dyld: Library not loaded: @rpath/libTKernel.7.8.dylib')).toBeUndefined();
    expect(missingSystemLibrary('Traceback: ModuleNotFoundError: No module named build123d')).toBeUndefined();
  });
});

describe('systemLibraryRefusal', () => {
  it('should answer a typed blocked state naming the library and its distribution package', () => {
    const refusal = systemLibraryRefusal({
      package: '@taucad/build123d',
      output: 'ImportError: libGL.so.1: cannot open shared object file: No such file or directory',
      attemptId: 'attempt-1',
    });

    expect(refusal).toEqual({
      status: 'blocked',
      attemptId: 'attempt-1',
      reason: 'missing-system-library',
      message:
        '@taucad/build123d needs the system library libGL.so.1, which this machine does not have. Install it (libgl1 on Debian and Ubuntu, mesa-libGL on Fedora and RHEL), then try again.',
      detail: { library: 'libGL.so.1' },
    });
  });

  it('should answer undefined when the output reports no missing library', () => {
    expect(
      systemLibraryRefusal({ package: '@taucad/build123d', output: 'Segmentation fault', attemptId: 'a' }),
    ).toBeUndefined();
  });
});
