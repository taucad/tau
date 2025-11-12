/* eslint-disable @typescript-eslint/naming-convention -- allowed for test fixtures */
import { describe, expect, it } from 'vitest';
import {
  deleteValueAtPath,
  extractModifiedProperties,
  getValueAtPath,
  hasCustomValue,
  setValueAtPath,
} from '#utils/object.utils.js';

describe('getValueAtPath', () => {
  describe('Basic functionality', () => {
    it('should get top-level value', () => {
      const object = { name: 'John' };
      expect(getValueAtPath(object, ['name'] as const)).toBe('John');
    });

    it('should get nested value', () => {
      const object = {
        user: {
          profile: {
            email: 'john@example.com',
          },
        },
      };
      expect(getValueAtPath(object, ['user', 'profile', 'email'] as const)).toBe('john@example.com');
    });

    it('should get deeply nested value', () => {
      const object = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 42,
              },
            },
          },
        },
      };
      expect(getValueAtPath(object, ['level1', 'level2', 'level3', 'level4', 'value'] as const)).toBe(42);
    });

    it('should return object itself with empty path', () => {
      const object = { name: 'John', age: 30 };
      expect(getValueAtPath(object, [] as const)).toEqual(object);
    });

    it('should return undefined for non-existent key', () => {
      const object = { name: 'John' };
      expect(getValueAtPath(object, ['age'] as const)).toBeUndefined();
    });

    it('should return undefined for non-existent nested key', () => {
      const object = { user: { name: 'John' } };
      expect(getValueAtPath(object, ['user', 'email'] as const)).toBeUndefined();
    });
  });

  describe('Different value types', () => {
    it('should get string values', () => {
      const object = { text: 'hello' };
      expect(getValueAtPath(object, ['text'] as const)).toBe('hello');
    });

    it('should get number values', () => {
      const object = { count: 42, price: 19.99 };
      expect(getValueAtPath(object, ['count'] as const)).toBe(42);
      expect(getValueAtPath(object, ['price'] as const)).toBe(19.99);
    });

    it('should get boolean values', () => {
      const object = { isActive: true, isDeleted: false };
      expect(getValueAtPath(object, ['isActive'] as const)).toBe(true);
      expect(getValueAtPath(object, ['isDeleted'] as const)).toBe(false);
    });

    it('should get null values', () => {
      const object = { value: null };
      expect(getValueAtPath(object, ['value'] as const)).toBeNull();
    });

    it('should get undefined values', () => {
      const object = { value: undefined };
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- undefined is allowed.
      expect(getValueAtPath(object, ['value'] as const)).toBeUndefined();
    });

    it('should get array values', () => {
      const object = { items: [1, 2, 3] };
      expect(getValueAtPath(object, ['items'] as const)).toEqual([1, 2, 3]);
    });

    it('should get object values', () => {
      const object = { user: { name: 'John', age: 30 } };
      expect(getValueAtPath(object, ['user'] as const)).toEqual({ name: 'John', age: 30 });
    });

    it('should get zero values', () => {
      const object = { count: 0 };
      expect(getValueAtPath(object, ['count'] as const)).toBe(0);
    });

    it('should get empty string values', () => {
      const object = { text: '' };
      expect(getValueAtPath(object, ['text'] as const)).toBe('');
    });

    it('should get empty array values', () => {
      const object = { items: [] };
      expect(getValueAtPath(object, ['items'] as const)).toEqual([]);
    });

    it('should get empty object values', () => {
      const object = { data: {} };
      expect(getValueAtPath(object, ['data'] as const)).toEqual({});
    });
  });

  describe('Array handling', () => {
    it('should access array elements by index', () => {
      const object = { items: ['a', 'b', 'c'] };
      expect(getValueAtPath(object, ['items', '0'] as const)).toBe('a');
      expect(getValueAtPath(object, ['items', '1'] as const)).toBe('b');
      expect(getValueAtPath(object, ['items', '2'] as const)).toBe('c');
    });

    it('should access nested objects in arrays', () => {
      const object = {
        users: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
        ],
      };
      expect(getValueAtPath(object, ['users', '0', 'name'] as const)).toBe('John');
      expect(getValueAtPath(object, ['users', '1', 'age'] as const)).toBe(25);
    });

    it('should access deeply nested arrays', () => {
      const object = {
        data: {
          items: [{ values: [1, 2, 3] }, { values: [4, 5, 6] }],
        },
      };
      expect(getValueAtPath(object, ['data', 'items', '0', 'values', '1'] as const)).toBe(2);
      expect(getValueAtPath(object, ['data', 'items', '1', 'values', '2'] as const)).toBe(6);
    });

    it('should return undefined for out-of-bounds array index', () => {
      const object = { items: ['a', 'b', 'c'] };
      expect(getValueAtPath(object, ['items', '5'] as const)).toBeUndefined();
    });

    it('should handle negative array indices as keys', () => {
      const object = { items: ['a', 'b', 'c'] };
      // Negative indices are treated as property keys, not array indices
      expect(getValueAtPath(object, ['items', '-1'] as const)).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should return undefined when traversing through null', () => {
      const object = { user: null };
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- undefined is allowed.
      expect(getValueAtPath(object, ['user', 'name'] as const)).toBeUndefined();
    });

    it('should return undefined when traversing through undefined', () => {
      const object = { user: undefined };
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- undefined is allowed.
      expect(getValueAtPath(object, ['user', 'name'] as const)).toBeUndefined();
    });

    it('should return undefined when traversing through primitive values', () => {
      const object = { value: 'string' };
      expect(getValueAtPath(object, ['value', 'length'] as const)).toBeUndefined();
    });

    it('should return undefined when traversing through numbers', () => {
      const object = { value: 42 };
      expect(getValueAtPath(object, ['value', 'property'] as const)).toBeUndefined();
    });

    it('should return undefined when traversing through booleans', () => {
      const object = { value: true };
      expect(getValueAtPath(object, ['value', 'property'] as const)).toBeUndefined();
    });

    it('should handle paths with empty string keys', () => {
      const object = { '': 'empty key' };
      expect(getValueAtPath(object, [''] as const)).toBe('empty key');
    });

    it('should handle paths with special characters', () => {
      const object = {
        'field-name': 'value1',
        'field.name': 'value2',
        'field@name': 'value3',
      };
      expect(getValueAtPath(object, ['field-name'] as const)).toBe('value1');
      expect(getValueAtPath(object, ['field.name'] as const)).toBe('value2');
      expect(getValueAtPath(object, ['field@name'] as const)).toBe('value3');
    });

    it('should handle paths with unicode characters', () => {
      const object = {
        名前: 'name',
        поле: 'field',
      };
      expect(getValueAtPath(object, ['名前'] as const)).toBe('name');
      expect(getValueAtPath(object, ['поле'] as const)).toBe('field');
    });

    it('should handle paths with numeric string keys', () => {
      const object = {
        '123': 'numeric key',
        '0': 'zero key',
      };
      expect(getValueAtPath(object, ['123'] as const)).toBe('numeric key');
      expect(getValueAtPath(object, ['0'] as const)).toBe('zero key');
    });

    it('should handle very long paths', () => {
      const object: Record<string, unknown> = {};
      let current = object;
      const path: string[] = [];

      // Create a deeply nested object
      for (let i = 0; i < 50; i++) {
        const key = `level${i}`;
        path.push(key);
        current[key] = i === 49 ? 'deep value' : {};
        current = current[key] as Record<string, unknown>;
      }

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- needs a dynamic type.
      const result = getValueAtPath(object, path);

      expect(result).toBe('deep value');
    });

    it('should not modify the original object', () => {
      const object = { user: { name: 'John' } };
      const original = JSON.stringify(object);
      getValueAtPath(object, ['user', 'name']);
      expect(JSON.stringify(object)).toBe(original);
    });
  });
});

describe('setValueAtPath', () => {
  describe('Basic functionality', () => {
    it('should set top-level value', () => {
      const object = { name: 'John' };
      const result = setValueAtPath(object, ['name'], 'Jane');
      expect(result.name).toBe('Jane');
    });

    it('should add new top-level property', () => {
      const object = { name: 'John' };
      const result = setValueAtPath(object, ['age'], 30);
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should set nested value', () => {
      const object = {
        user: {
          name: 'John',
        },
      };
      const result = setValueAtPath(object, ['user', 'name'], 'Jane');
      expect(result.user.name).toBe('Jane');
    });

    it('should create nested objects when path does not exist', () => {
      const object = {};
      const result = setValueAtPath(object, ['user', 'profile', 'email'], 'john@example.com');
      expect(result).toEqual({
        user: {
          profile: {
            email: 'john@example.com',
          },
        },
      });
    });

    it('should set deeply nested value', () => {
      const object = {
        level1: {
          level2: {
            level3: {
              value: 'old',
            },
          },
        },
      };
      const result = setValueAtPath(object, ['level1', 'level2', 'level3', 'value'], 'new');
      expect(result.level1.level2.level3.value).toBe('new');
    });

    it('should return same object when path is empty', () => {
      const object = { name: 'John' };
      const result = setValueAtPath(object, [], 'value');
      expect(result).toEqual(object);
    });
  });

  describe('Immutability', () => {
    it('should not modify the original object', () => {
      const object = { user: { name: 'John' } };
      const original = JSON.stringify(object);
      setValueAtPath(object, ['user', 'name'], 'Jane');
      expect(JSON.stringify(object)).toBe(original);
      expect(object.user.name).toBe('John');
    });

    it('should create new object references at all levels', () => {
      const object = {
        user: {
          profile: {
            name: 'John',
          },
        },
      };
      const result = setValueAtPath(object, ['user', 'profile', 'name'], 'Jane');

      // Original should be unchanged
      expect(object.user.profile.name).toBe('John');

      // Result should have new value
      expect(result.user.profile.name).toBe('Jane');

      // References should be different
      expect(result).not.toBe(object);
      expect(result.user).not.toBe(object.user);
      expect(result.user.profile).not.toBe(object.user.profile);
    });

    it('should preserve other properties at the same level', () => {
      const object = {
        name: 'John',
        age: 30,
        city: 'New York',
      };
      const result = setValueAtPath(object, ['age'], 31);
      expect(result).toEqual({
        name: 'John',
        age: 31,
        city: 'New York',
      });
    });

    it('should preserve sibling nested objects', () => {
      const object = {
        user: {
          name: 'John',
          address: {
            city: 'New York',
          },
        },
      };
      const result = setValueAtPath(object, ['user', 'name'], 'Jane');
      expect(result.user.address.city).toBe('New York');
    });
  });

  describe('Different value types', () => {
    it('should set string values', () => {
      const object = {};
      const result = setValueAtPath(object, ['text'], 'hello');
      expect(result.text).toBe('hello');
    });

    it('should set number values', () => {
      const object = {};
      const result = setValueAtPath(object, ['count'], 42);
      expect(result.count).toBe(42);
    });

    it('should set boolean values', () => {
      const object = {};
      const result = setValueAtPath(object, ['isActive'], true);
      expect(result.isActive).toBe(true);
    });

    it('should set null values', () => {
      const object = { value: 'something' };
      const result = setValueAtPath(object, ['value'], null);
      expect(result.value).toBeNull();
    });

    it('should set undefined values', () => {
      const object = { value: 'something' };
      const result = setValueAtPath(object, ['value'], undefined);
      expect(result.value).toBeUndefined();
    });

    it('should set array values', () => {
      const object = {};
      const result = setValueAtPath(object, ['items'], [1, 2, 3]);
      expect(result.items).toEqual([1, 2, 3]);
    });

    it('should set object values', () => {
      const object = {};
      const result = setValueAtPath(object, ['user'], { name: 'John' });
      expect(result.user).toEqual({ name: 'John' });
    });

    it('should set zero values', () => {
      const object = {};
      const result = setValueAtPath(object, ['count'], 0);
      expect(result.count).toBe(0);
    });

    it('should set empty string values', () => {
      const object = {};
      const result = setValueAtPath(object, ['text'], '');
      expect(result.text).toBe('');
    });

    it('should set empty array values', () => {
      const object = {};
      const result = setValueAtPath(object, ['items'], []);
      expect(result.items).toEqual([]);
    });

    it('should set empty object values', () => {
      const object = {};
      const result = setValueAtPath(object, ['data'], {});
      expect(result.data).toEqual({});
    });
  });

  describe('Path creation', () => {
    it('should create intermediate objects when they do not exist', () => {
      const object = {};
      const result = setValueAtPath(object, ['a', 'b', 'c'], 'value');
      expect(result).toEqual({
        a: {
          b: {
            c: 'value',
          },
        },
      });
    });

    it('should create objects over non-object values', () => {
      const object = { user: 'string' };
      const result = setValueAtPath(object, ['user', 'name'], 'John');
      expect(result.user).toEqual({ name: 'John' });
    });

    it('should create objects over null values', () => {
      const object = { user: null };
      const result = setValueAtPath(object, ['user', 'name'], 'John');
      expect(result.user).toEqual({ name: 'John' });
    });

    it('should create objects over undefined values', () => {
      const object = { user: undefined };
      const result = setValueAtPath(object, ['user', 'name'], 'John');
      expect(result.user).toEqual({ name: 'John' });
    });

    it('should create objects over primitive values', () => {
      const object = { data: 42 };
      const result = setValueAtPath(object, ['data', 'value'], 'new');
      expect(result.data).toEqual({ value: 'new' });
    });
  });

  describe('Array handling', () => {
    it('should set array element by index', () => {
      const object = { items: ['a', 'b', 'c'] };
      const result = setValueAtPath(object, ['items', '1'], 'x');
      expect(result.items).toEqual(['a', 'x', 'c']);
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should set nested object in array', () => {
      const object = {
        users: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
        ],
      } as const;
      const result = setValueAtPath(object, ['users', '0', 'age'], 31);
      expect(result.users[0]!.age).toBe(31);
      expect(result.users[1]!.age).toBe(25);
      expect(Array.isArray(result.users)).toBe(true);
    });

    it('should handle deeply nested arrays', () => {
      const object = {
        data: {
          items: [{ values: [1, 2, 3] }, { values: [4, 5, 6] }],
        },
      } as const;
      const result = setValueAtPath(object, ['data', 'items', '0', 'values', '1'], 99);
      expect(result.data.items[0]!.values[1]).toBe(99);
      expect(result.data.items[1]!.values[1]).toBe(5);
      expect(Array.isArray(result.data.items)).toBe(true);
      expect(Array.isArray(result.data.items[0]!.values)).toBe(true);
    });

    it('should not modify original array', () => {
      const object = { items: ['a', 'b', 'c'] };
      const result = setValueAtPath(object, ['items', '1'], 'x');
      expect(object.items).toEqual(['a', 'b', 'c']);
      expect(result.items).toEqual(['a', 'x', 'c']);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items).not.toBe(object.items);
    });
  });

  describe('Edge cases', () => {
    it('should handle paths with empty string keys', () => {
      const object = {};
      const result = setValueAtPath(object, [''], 'value');
      expect(result['']).toBe('value');
    });

    it('should handle paths with special characters', () => {
      const object = {};
      const result = setValueAtPath(object, ['field-name'], 'value1');
      expect(result['field-name']).toBe('value1');
    });

    it('should handle paths with unicode characters', () => {
      const object = {};
      const result = setValueAtPath(object, ['名前'], 'name');
      expect(result['名前']).toBe('name');
    });

    it('should handle paths with numeric string keys', () => {
      const object = {};
      const result = setValueAtPath(object, ['123'], 'value');
      expect(result['123']).toBe('value');
    });

    it('should handle very long paths', () => {
      const object = {};
      const path: string[] = [];
      for (let i = 0; i < 50; i++) {
        path.push(`level${i}`);
      }

      const result = setValueAtPath(object, path, 'deep value');

      let current = result;
      for (let i = 0; i < 49; i++) {
        current = current[`level${i}`]!;
      }

      expect(current['level49']).toBe('deep value');
    });

    it('should handle single element path', () => {
      const object = {};
      const result = setValueAtPath(object, ['key'], 'value');
      expect(result.key).toBe('value');
    });

    it('should overwrite existing nested structures', () => {
      const object = {
        user: {
          profile: {
            name: 'John',
            age: 30,
          },
        },
      };
      const result = setValueAtPath(object, ['user', 'profile'], { name: 'Jane' });
      expect(result.user.profile).toEqual({ name: 'Jane' });
    });
  });
});

describe('deleteValueAtPath', () => {
  describe('Basic functionality', () => {
    it('should delete top-level property', () => {
      const object = { name: 'John', age: 30 };
      const result = deleteValueAtPath(object, ['age']);
      expect(result).toEqual({ name: 'John' });
      expect(result).not.toHaveProperty('age');
    });

    it('should delete nested property', () => {
      const object = {
        user: {
          name: 'John',
          email: 'john@example.com',
        },
      };
      const result = deleteValueAtPath(object, ['user', 'email']);
      expect(result.user).toEqual({ name: 'John' });
      expect(result.user).not.toHaveProperty('email');
    });

    it('should delete deeply nested property', () => {
      const object = {
        level1: {
          level2: {
            level3: {
              toDelete: 'value',
              toKeep: 'keep',
            },
          },
        },
      };
      const result = deleteValueAtPath(object, ['level1', 'level2', 'level3', 'toDelete']);
      expect(result.level1.level2.level3).toEqual({ toKeep: 'keep' });
      expect(result.level1.level2.level3).not.toHaveProperty('toDelete');
    });

    it('should return same object when path is empty', () => {
      const object = { name: 'John' };
      const result = deleteValueAtPath(object, []);
      expect(result).toEqual(object);
    });

    it('should handle non-existent paths gracefully', () => {
      const object = { name: 'John' };
      const result = deleteValueAtPath(object, ['nonExistent']);
      expect(result).toEqual({ name: 'John' });
    });

    it('should handle non-existent nested paths gracefully', () => {
      const object = { user: { name: 'John' } };
      const result = deleteValueAtPath(object, ['user', 'nonExistent']);
      expect(result.user).toEqual({ name: 'John' });
    });
  });

  describe('Immutability', () => {
    it('should not modify the original object', () => {
      const object = { name: 'John', age: 30 };
      const original = JSON.stringify(object);
      deleteValueAtPath(object, ['age']);
      expect(JSON.stringify(object)).toBe(original);
      expect(object.age).toBe(30);
    });

    it('should create new object references at all levels', () => {
      const object = {
        user: {
          profile: {
            name: 'John',
            age: 30,
          },
        },
      };
      const result = deleteValueAtPath(object, ['user', 'profile', 'age']);

      // Original should be unchanged
      expect(object.user.profile.age).toBe(30);

      // Result should not have age
      expect(result.user.profile).not.toHaveProperty('age');

      // References should be different
      expect(result).not.toBe(object);
      expect(result.user).not.toBe(object.user);
      expect(result.user.profile).not.toBe(object.user.profile);
    });

    it('should preserve other properties at the same level', () => {
      const object = {
        name: 'John',
        age: 30,
        city: 'New York',
      };
      const result = deleteValueAtPath(object, ['age']);
      expect(result).toEqual({
        name: 'John',
        city: 'New York',
      });
    });

    it('should preserve sibling nested objects', () => {
      const object = {
        user: {
          name: 'John',
          age: 30,
          address: {
            city: 'New York',
            street: '123 Main St',
          },
        },
      };
      const result = deleteValueAtPath(object, ['user', 'name']);
      expect(result.user.address).toEqual({
        city: 'New York',
        street: '123 Main St',
      });
      expect(result.user.age).toBe(30);
    });
  });

  describe('Different value types', () => {
    it('should delete string values', () => {
      const object = { text: 'hello', other: 'world' };
      const result = deleteValueAtPath(object, ['text']);
      expect(result).toEqual({ other: 'world' });
    });

    it('should delete number values', () => {
      const object = { count: 42, price: 19.99 };
      const result = deleteValueAtPath(object, ['count']);
      expect(result).toEqual({ price: 19.99 });
    });

    it('should delete boolean values', () => {
      const object = { isActive: true, isDeleted: false };
      const result = deleteValueAtPath(object, ['isActive']);
      expect(result).toEqual({ isDeleted: false });
    });

    it('should delete null values', () => {
      const object = { value: null, other: 'keep' };
      const result = deleteValueAtPath(object, ['value']);
      expect(result).toEqual({ other: 'keep' });
    });

    it('should delete undefined values', () => {
      const object = { value: undefined, other: 'keep' };
      const result = deleteValueAtPath(object, ['value']);
      expect(result).toEqual({ other: 'keep' });
    });

    it('should delete array values', () => {
      const object = { items: [1, 2, 3], other: 'keep' };
      const result = deleteValueAtPath(object, ['items']);
      expect(result).toEqual({ other: 'keep' });
    });

    it('should delete nested object values', () => {
      const object = {
        user: { name: 'John', age: 30 },
        other: 'keep',
      };
      const result = deleteValueAtPath(object, ['user']);
      expect(result).toEqual({ other: 'keep' });
    });
  });

  describe('Path traversal', () => {
    it('should handle path through null gracefully', () => {
      const object = { user: null };
      const result = deleteValueAtPath(object, ['user', 'name']);
      expect(result).toEqual({ user: null });
    });

    it('should handle path through undefined gracefully', () => {
      const object = { user: undefined };
      const result = deleteValueAtPath(object, ['user', 'name']);
      expect(result).toEqual({ user: undefined });
    });

    it('should handle path through primitive values gracefully', () => {
      const object = { value: 'string' };
      const result = deleteValueAtPath(object, ['value', 'length']);
      expect(result).toEqual({ value: 'string' });
    });

    it('should handle path through numbers gracefully', () => {
      const object = { value: 42 };
      const result = deleteValueAtPath(object, ['value', 'property']);
      expect(result).toEqual({ value: 42 });
    });

    it('should handle missing intermediate objects', () => {
      const object = { user: { name: 'John' } };
      const result = deleteValueAtPath(object, ['user', 'profile', 'email']);
      expect(result).toEqual({ user: { name: 'John' } });
    });
  });

  describe('Array handling', () => {
    it('should delete property from object in array', () => {
      const object = {
        users: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
        ],
      };
      const result = deleteValueAtPath(object, ['users', '0', 'age']);
      expect(result.users[0]).toEqual({ name: 'John' });
      expect(result.users[1]).toEqual({ name: 'Jane', age: 25 });
      expect(Array.isArray(result.users)).toBe(true);
    });

    it('should delete array item by index', () => {
      const object = {
        items: [1, 2, 3],
      };
      const result = deleteValueAtPath(object, ['items', '1']);
      expect(result.items).toEqual([1, undefined, 3]);
    });

    it('should handle deeply nested arrays', () => {
      const object = {
        data: {
          items: [
            { values: [1, 2, 3], name: 'first' },
            { values: [4, 5, 6], name: 'second' },
          ],
        },
      };
      const result = deleteValueAtPath(object, ['data', 'items', '0', 'name']);
      expect(result.data.items[0]).toEqual({ values: [1, 2, 3] });
      expect(result.data.items[1]).toEqual({ values: [4, 5, 6], name: 'second' });
      expect(Array.isArray(result.data.items)).toBe(true);
    });

    it('should not modify original array', () => {
      const object = {
        users: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
        ],
      };
      const result = deleteValueAtPath(object, ['users', '0', 'age']);
      expect(object.users[0]).toEqual({ name: 'John', age: 30 });
      expect(result.users[0]).toEqual({ name: 'John' });
      expect(result.users).not.toBe(object.users);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string keys', () => {
      const object = { '': 'value', other: 'keep' };
      const result = deleteValueAtPath(object, ['']);
      expect(result).toEqual({ other: 'keep' });
    });

    it('should handle special characters in keys', () => {
      const object = {
        'field-name': 'value1',
        'field.name': 'value2',
        'field@name': 'value3',
      };
      const result = deleteValueAtPath(object, ['field-name']);
      expect(result).toEqual({
        'field.name': 'value2',
        'field@name': 'value3',
      });
    });

    it('should handle unicode characters in keys', () => {
      const object = {
        名前: 'name',
        поле: 'field',
        other: 'keep',
      };
      const result = deleteValueAtPath(object, ['名前']);
      expect(result).toEqual({
        поле: 'field',
        other: 'keep',
      });
    });

    it('should handle numeric string keys', () => {
      const object = {
        '123': 'numeric key',
        '0': 'zero key',
        other: 'keep',
      };
      const result = deleteValueAtPath(object, ['123']);
      expect(result).toEqual({
        '0': 'zero key',
        other: 'keep',
      });
    });

    it('should handle very long paths', () => {
      const object: Record<string, unknown> = { root: {} };
      let current = object['root'] as Record<string, unknown>;
      const path: string[] = ['root'];

      // Create a deeply nested object
      for (let i = 0; i < 50; i++) {
        const key = `level${i}`;
        path.push(key);
        if (i === 49) {
          current[key] = 'deep value';
          current['keep'] = 'this';
        } else {
          current[key] = {};
          current = current[key] as Record<string, unknown>;
        }
      }

      const result = deleteValueAtPath(object, path);

      // Navigate to the deep level and verify deletion
      let checkCurrent = result['root'] as Record<string, unknown>;
      for (let i = 0; i < 49; i++) {
        checkCurrent = checkCurrent[`level${i}`] as Record<string, unknown>;
      }

      expect(checkCurrent).toEqual({ keep: 'this' });
      expect(checkCurrent).not.toHaveProperty('level49');
    });

    it('should handle deleting only property in object', () => {
      const object = { onlyProperty: 'value' };
      const result = deleteValueAtPath(object, ['onlyProperty']);
      expect(result).toEqual({});
    });

    it('should handle deleting property that makes nested object empty', () => {
      const object = {
        user: {
          profile: {
            name: 'John',
          },
        },
      };
      const result = deleteValueAtPath(object, ['user', 'profile', 'name']);
      expect(result.user.profile).toEqual({});
    });
  });
});

describe('extractModifiedProperties', () => {
  describe('Basic functionality', () => {
    it('should return empty object when all properties match defaults', () => {
      const formData = { name: 'test', count: 5 };
      const defaultProperties = { name: 'test', count: 5 };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({});
    });

    it('should extract only modified primitive properties', () => {
      const formData = { name: 'modified', count: 5, enabled: true };
      const defaultProperties = { name: 'default', count: 5, enabled: true };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ name: 'modified' });
      expect(result).not.toHaveProperty('count');
      expect(result).not.toHaveProperty('enabled');
    });

    it('should extract multiple modified properties', () => {
      const formData = { name: 'modified', count: 10, enabled: true };
      const defaultProperties = { name: 'default', count: 5, enabled: false };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ name: 'modified', count: 10, enabled: true });
    });

    it('should handle empty formData', () => {
      const formData = {};
      const defaultProperties = { name: 'test', count: 5 };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({});
    });

    it('should handle empty defaultProperties', () => {
      const formData = { name: 'test', count: 5 };
      const defaultProperties = {};
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ name: 'test', count: 5 });
    });
  });

  describe('Nested objects', () => {
    it('should extract only modified nested properties', () => {
      const formData = {
        config: {
          host: 'example.com',
          port: 8080,
        },
      };
      const defaultProperties = {
        config: {
          host: 'localhost',
          port: 8080,
        },
      };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({
        config: {
          host: 'example.com',
        },
      });
      expect(result.config).not.toHaveProperty('port');
    });

    it('should exclude nested object if all properties match defaults', () => {
      const formData = {
        config: {
          host: 'localhost',
          port: 8080,
        },
      };
      const defaultProperties = {
        config: {
          host: 'localhost',
          port: 8080,
        },
      };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({});
    });

    it('should handle deeply nested objects', () => {
      const formData = {
        level1: {
          level2: {
            level3: {
              value: 'modified',
              unchanged: 'same',
            },
          },
        },
      };
      const defaultProperties = {
        level1: {
          level2: {
            level3: {
              value: 'default',
              unchanged: 'same',
            },
          },
        },
      };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              value: 'modified',
            },
          },
        },
      });
    });

    it('should handle multiple nested objects with mixed modifications', () => {
      const formData = {
        config1: {
          host: 'example.com',
          port: 8080,
        },
        config2: {
          host: 'localhost',
          port: 9000,
        },
      };
      const defaultProperties = {
        config1: {
          host: 'localhost',
          port: 8080,
        },
        config2: {
          host: 'localhost',
          port: 8080,
        },
      };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({
        config1: {
          host: 'example.com',
        },
        config2: {
          port: 9000,
        },
      });
    });
  });

  describe('Arrays', () => {
    it('should extract modified array values', () => {
      const formData = { items: [1, 2, 3] };
      const defaultProperties = { items: [1, 2, 4] };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ items: [1, 2, 3] });
    });

    it('should exclude arrays that match defaults', () => {
      const formData = { items: [1, 2, 3] };
      const defaultProperties = { items: [1, 2, 3] };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({});
    });

    it('should handle empty arrays', () => {
      const formData = { items: [] };
      const defaultProperties = { items: [1, 2, 3] };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ items: [] });
    });

    it('should handle arrays with different lengths', () => {
      const formData = { items: [1, 2] };
      const defaultProperties = { items: [1, 2, 3] };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ items: [1, 2] });
    });
  });

  describe('Edge cases', () => {
    it('should handle null values', () => {
      const formData = { value: null };
      const defaultProperties = { value: 'default' };
      // @ts-expect-error -- edge test case for null values
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ value: null });
    });

    it('should handle undefined values', () => {
      const formData = { value: undefined };
      const defaultProperties = { value: 'default' };
      // @ts-expect-error -- edge test case for undefined values
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ value: undefined });
    });

    it('should handle zero values', () => {
      const formData = { count: 0 };
      const defaultProperties = { count: 5 };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ count: 0 });
    });

    it('should handle empty string values', () => {
      const formData = { name: '' };
      const defaultProperties = { name: 'default' };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ name: '' });
    });

    it('should handle boolean false values', () => {
      const formData = { enabled: false };
      const defaultProperties = { enabled: true };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ enabled: false });
    });

    it('should handle properties not in defaults', () => {
      const formData = { name: 'test', newProp: 'value' };
      const defaultProperties = { name: 'test' };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ newProp: 'value' });
    });

    it('should handle properties missing from formData but present in defaults', () => {
      const formData = { name: 'test' };
      const defaultProperties = { name: 'test', count: 5 };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({});
    });

    it('should handle nested objects with properties not in defaults', () => {
      const formData = {
        config: {
          host: 'localhost',
          newProp: 'value',
        },
      };
      const defaultProperties = {
        config: {
          host: 'localhost',
        },
      };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({
        config: {
          newProp: 'value',
        },
      });
    });

    it('should handle type mismatches (object vs primitive)', () => {
      const formData = { value: { nested: 'object' } };
      const defaultProperties = { value: 'string' };
      // @ts-expect-error -- edge test case for mismatched types
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ value: { nested: 'object' } });
    });

    it('should handle type mismatches (array vs object)', () => {
      const formData = { value: [1, 2, 3] };
      const defaultProperties = { value: { nested: 'object' } };
      // @ts-expect-error -- edge test case for mismatched types
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({ value: [1, 2, 3] });
    });
  });

  describe('Complex scenarios', () => {
    it('should handle mixed primitive and nested modifications', () => {
      const formData = {
        name: 'modified',
        count: 5,
        config: {
          host: 'example.com',
          port: 8080,
        },
        tags: ['tag1', 'tag2'],
      };
      const defaultProperties = {
        name: 'default',
        count: 5,
        config: {
          host: 'localhost',
          port: 8080,
        },
        tags: ['tag1', 'tag2'],
      };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({
        name: 'modified',
        config: {
          host: 'example.com',
        },
      });
    });

    it('should handle multiple levels of nesting with partial modifications', () => {
      const formData = {
        level1: {
          level2: {
            level3: {
              modified: 'changed',
              unchanged: 'same',
            },
            other: 'same',
          },
          top: 'same',
        },
      };
      const defaultProperties = {
        level1: {
          level2: {
            level3: {
              modified: 'default',
              unchanged: 'same',
            },
            other: 'same',
          },
          top: 'same',
        },
      };
      const result = extractModifiedProperties(formData, defaultProperties);
      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              modified: 'changed',
            },
          },
        },
      });
    });
  });
});

describe('hasCustomValue', () => {
  describe('Primitive values', () => {
    it('should return false when string matches default', () => {
      expect(hasCustomValue('test', 'test')).toBe(false);
    });

    it('should return true when string differs from default', () => {
      expect(hasCustomValue('modified', 'default')).toBe(true);
    });

    it('should return false when number matches default', () => {
      expect(hasCustomValue(5, 5)).toBe(false);
    });

    it('should return true when number differs from default', () => {
      expect(hasCustomValue(10, 5)).toBe(true);
    });

    it('should return false when boolean matches default', () => {
      expect(hasCustomValue(true, true)).toBe(false);
      expect(hasCustomValue(false, false)).toBe(false);
    });

    it('should return true when boolean differs from default', () => {
      expect(hasCustomValue(true, false)).toBe(true);
      expect(hasCustomValue(false, true)).toBe(true);
    });

    it('should handle zero values correctly', () => {
      expect(hasCustomValue(0, 0)).toBe(false);
      expect(hasCustomValue(0, 5)).toBe(true);
    });

    it('should handle empty string values correctly', () => {
      expect(hasCustomValue('', '')).toBe(false);
      expect(hasCustomValue('', 'default')).toBe(true);
    });
  });

  describe('Null and undefined', () => {
    it('should return false for undefined formData', () => {
      expect(hasCustomValue(undefined, 'default')).toBe(false);
      expect(hasCustomValue(undefined, undefined)).toBe(false);
    });

    it('should return false for null formData', () => {
      expect(hasCustomValue(null, 'default')).toBe(false);
      expect(hasCustomValue(null, null)).toBe(false);
    });

    it('should return true when formData is defined but default is null', () => {
      expect(hasCustomValue('value', null)).toBe(true);
    });

    it('should return true when formData is defined but default is undefined', () => {
      expect(hasCustomValue('value', undefined)).toBe(true);
    });
  });

  describe('Arrays', () => {
    it('should return false when arrays match exactly', () => {
      expect(hasCustomValue([1, 2, 3], [1, 2, 3])).toBe(false);
    });

    it('should return true when arrays have different values', () => {
      expect(hasCustomValue([1, 2, 3], [1, 2, 4])).toBe(true);
    });

    it('should return true when arrays have different lengths', () => {
      expect(hasCustomValue([1, 2], [1, 2, 3])).toBe(true);
      expect(hasCustomValue([1, 2, 3], [1, 2])).toBe(true);
    });

    it('should return true when array vs non-array', () => {
      expect(hasCustomValue([1, 2, 3], 'string')).toBe(true);
      expect(hasCustomValue([1, 2, 3], 5)).toBe(true);
      expect(hasCustomValue([1, 2, 3], { key: 'value' })).toBe(true);
    });

    it('should return false when empty arrays match', () => {
      expect(hasCustomValue([], [])).toBe(false);
    });

    it('should return true when empty array vs non-empty array', () => {
      expect(hasCustomValue([], [1, 2, 3])).toBe(true);
      expect(hasCustomValue([1, 2, 3], [])).toBe(true);
    });

    it('should handle arrays with objects (deep comparison)', () => {
      // Deep comparison: same content means same value
      expect(hasCustomValue([{ a: 1 }], [{ a: 1 }])).toBe(false);
      expect(hasCustomValue([{ a: 1 }], [{ a: 2 }])).toBe(true);
    });

    it('should handle arrays with nested arrays (deep comparison)', () => {
      // Deep comparison: same content means same value
      expect(hasCustomValue([[1, 2]], [[1, 2]])).toBe(false);
      expect(hasCustomValue([[1, 2]], [[1, 3]])).toBe(true);
    });
  });

  describe('Objects', () => {
    it('should return false when objects match exactly', () => {
      expect(hasCustomValue({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(false);
    });

    it('should return true when objects have different values', () => {
      expect(hasCustomValue({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(true);
    });

    it('should return true when objects have different keys', () => {
      expect(hasCustomValue({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(true);
    });

    it('should return true when objects have different number of keys', () => {
      expect(hasCustomValue({ a: 1, b: 2 }, { a: 1 })).toBe(true);
      expect(hasCustomValue({ a: 1 }, { a: 1, b: 2 })).toBe(true);
    });

    it('should return false when empty objects match', () => {
      expect(hasCustomValue({}, {})).toBe(false);
    });

    it('should return true when empty object vs non-empty object', () => {
      expect(hasCustomValue({}, { a: 1 })).toBe(true);
      expect(hasCustomValue({ a: 1 }, {})).toBe(true);
    });

    it('should handle nested objects (deep comparison)', () => {
      // Deep comparison: same content means same value
      expect(hasCustomValue({ a: { b: 1 } }, { a: { b: 1 } })).toBe(false);
      expect(hasCustomValue({ a: { b: 1 } }, { a: { b: 2 } })).toBe(true);
    });

    it('should handle objects with arrays (deep comparison)', () => {
      // Deep comparison: same content means same value
      expect(hasCustomValue({ items: [1, 2] }, { items: [1, 2] })).toBe(false);
      expect(hasCustomValue({ items: [1, 2] }, { items: [1, 3] })).toBe(true);
    });

    it('should handle objects with null values', () => {
      expect(hasCustomValue({ a: null }, { a: null })).toBe(false);
      expect(hasCustomValue({ a: null }, { a: 'value' })).toBe(true);
    });

    it('should handle objects with undefined values', () => {
      expect(hasCustomValue({ a: undefined }, { a: undefined })).toBe(false);
      expect(hasCustomValue({ a: undefined }, { a: 'value' })).toBe(true);
    });
  });

  describe('Type mismatches', () => {
    it('should return true when comparing string to number', () => {
      expect(hasCustomValue('5', 5)).toBe(true);
    });

    it('should return true when comparing number to string', () => {
      expect(hasCustomValue(5, '5')).toBe(true);
    });

    it('should return true when comparing boolean to number', () => {
      expect(hasCustomValue(true, 1)).toBe(true);
      expect(hasCustomValue(false, 0)).toBe(true);
    });

    it('should return true when comparing object to primitive', () => {
      expect(hasCustomValue({ a: 1 }, 'string')).toBe(true);
      expect(hasCustomValue({ a: 1 }, 5)).toBe(true);
    });

    it('should return true when comparing array to primitive', () => {
      expect(hasCustomValue([1, 2], 'string')).toBe(true);
      expect(hasCustomValue([1, 2], 5)).toBe(true);
    });

    it('should return true when comparing array to object', () => {
      expect(hasCustomValue([1, 2], { a: 1 })).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle same object reference', () => {
      const object = { a: 1 };
      expect(hasCustomValue(object, object)).toBe(false);
    });

    it('should handle different object references with same content (deep comparison)', () => {
      // Deep comparison: same content means same value, regardless of reference
      expect(hasCustomValue({ a: 1 }, { a: 1 })).toBe(false);
      expect(hasCustomValue({ a: { b: 1 } }, { a: { b: 1 } })).toBe(false);
    });

    it('should handle NaN values', () => {
      expect(hasCustomValue(Number.NaN, Number.NaN)).toBe(true); // NaN !== NaN in JavaScript
      expect(hasCustomValue(Number.NaN, 5)).toBe(true);
    });

    it('should handle Infinity values', () => {
      expect(hasCustomValue(Infinity, Infinity)).toBe(false);
      expect(hasCustomValue(Infinity, 5)).toBe(true);
    });

    it('should handle negative zero', () => {
      expect(hasCustomValue(-0, 0)).toBe(false); // -0 === 0 in JavaScript
      expect(hasCustomValue(0, -0)).toBe(false);
    });

    it('should handle very large numbers', () => {
      expect(hasCustomValue(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(false);
      expect(hasCustomValue(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1)).toBe(true);
    });

    it('should handle objects with many properties', () => {
      const largeObject = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key${i}`, i]));
      const largeObjectCopy = { ...largeObject };
      expect(hasCustomValue(largeObject, largeObjectCopy)).toBe(false);

      const modifiedObject = { ...largeObject, key50: 999 };
      expect(hasCustomValue(modifiedObject, largeObject)).toBe(true);
    });

    it('should handle arrays with many elements', () => {
      const largeArray = Array.from({ length: 100 }, (_, i) => i);
      const largeArrayCopy = [...largeArray];
      expect(hasCustomValue(largeArray, largeArrayCopy)).toBe(false);

      const modifiedArray = [...largeArray];
      modifiedArray[50] = 999;
      expect(hasCustomValue(modifiedArray, largeArray)).toBe(true);
    });
  });
});
