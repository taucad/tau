import { describe, expect, it } from 'vitest';
import { mutatingRpcNames, readOnlyRpcNames, rpcName, rpcNames } from '#constants/rpc.constants.js';

describe('rpc.constants', () => {
  describe('mutatingRpcNames / readOnlyRpcNames partition invariant', () => {
    it('partitions every rpcName into exactly one of the two sets', () => {
      const unclassified: string[] = [];
      const doubleClassified: string[] = [];

      for (const name of rpcNames) {
        const inMutating = mutatingRpcNames.has(name);
        const inReadOnly = readOnlyRpcNames.has(name);

        if (inMutating && inReadOnly) {
          doubleClassified.push(name);
        } else if (!inMutating && !inReadOnly) {
          unclassified.push(name);
        }
      }

      expect(
        unclassified,
        `New RPCs must be added to mutatingRpcNames or readOnlyRpcNames: ${unclassified.join(', ')}`,
      ).toEqual([]);
      expect(doubleClassified, `RPCs cannot appear in both partitions: ${doubleClassified.join(', ')}`).toEqual([]);
    });

    it('mutatingRpcNames + readOnlyRpcNames sizes equal rpcNames length', () => {
      expect(mutatingRpcNames.size + readOnlyRpcNames.size).toBe(rpcNames.length);
    });

    it('classifies the four canonical mutating RPCs', () => {
      expect(mutatingRpcNames.has(rpcName.createFile)).toBe(true);
      expect(mutatingRpcNames.has(rpcName.deleteFile)).toBe(true);
      expect(mutatingRpcNames.has(rpcName.appendFile)).toBe(true);
      expect(mutatingRpcNames.has(rpcName.editFile)).toBe(true);
    });

    it('classifies read-only RPCs out of the mutating set', () => {
      expect(mutatingRpcNames.has(rpcName.readFile)).toBe(false);
      expect(mutatingRpcNames.has(rpcName.grep)).toBe(false);
      expect(mutatingRpcNames.has(rpcName.listDirectory)).toBe(false);
      expect(mutatingRpcNames.has(rpcName.getKernelResult)).toBe(false);
      expect(readOnlyRpcNames.has(rpcName.resolveSkill)).toBe(true);
    });
  });
});
