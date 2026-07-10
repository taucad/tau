import { describe, expect, it } from 'vitest';
import { createInitialProject } from '#constants/project.constants.js';

describe('createInitialProject', () => {
  it('should return fresh file buffers and a minimal module manifest', () => {
    const firstInput = new TextEncoder().encode('export default 1;');
    const secondInput = new TextEncoder().encode('export default 1;');

    const first = createInitialProject({
      projectName: 'First',
      mainFileName: 'main.ts',
      emptyCodeContent: firstInput,
    });
    const second = createInitialProject({
      projectName: 'Second',
      mainFileName: 'main.ts',
      emptyCodeContent: secondInput,
    });

    const firstMain = first.files['main.ts']?.content;
    const secondMain = second.files['main.ts']?.content;
    const firstPackageJson = first.files['package.json']?.content;
    const secondPackageJson = second.files['package.json']?.content;

    expect(firstMain).toEqual(firstInput);
    expect(firstMain).not.toBe(firstInput);
    expect(firstMain?.buffer).not.toBe(firstInput.buffer);

    expect(secondMain).toEqual(secondInput);
    expect(secondMain).not.toBe(secondInput);
    expect(secondMain?.buffer).not.toBe(secondInput.buffer);

    expect(firstPackageJson).toBeInstanceOf(Uint8Array);
    expect(secondPackageJson).toBeInstanceOf(Uint8Array);
    expect(firstPackageJson).toEqual(secondPackageJson);
    expect(firstPackageJson).not.toBe(secondPackageJson);
    expect(firstPackageJson?.buffer).not.toBe(secondPackageJson?.buffer);
    expect(JSON.parse(new TextDecoder().decode(firstPackageJson))).toEqual({ type: 'module' });
  });
});
