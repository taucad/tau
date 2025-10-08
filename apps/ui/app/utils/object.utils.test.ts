import { describe, expect, it } from "vitest";
import { getValueAtPath, setValueAtPath, deleteValueAtPath } from "#utils/object.utils.js";

describe("getValueAtPath", () => {
  describe("Basic functionality", () => {
    it("should get top-level value", () => {
      const object = { name: "John" };
      expect(getValueAtPath(object, ["name"] as const)).toBe("John");
    });

    it("should get nested value", () => {
      const object = {
        user: {
          profile: {
            email: "john@example.com",
          },
        },
      };
      expect(getValueAtPath(object, ["user", "profile", "email"] as const)).toBe("john@example.com");
    });

    it("should get deeply nested value", () => {
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
      expect(getValueAtPath(object, ["level1", "level2", "level3", "level4", "value"] as const)).toBe(42);
    });

    it("should return object itself with empty path", () => {
      const object = { name: "John", age: 30 };
      expect(getValueAtPath(object, [])).toEqual(object);
    });

    it("should return undefined for non-existent key", () => {
      const object = { name: "John" };
      expect(getValueAtPath(object, ["age"])).toBeUndefined();
    });

    it("should return undefined for non-existent nested key", () => {
      const object = { user: { name: "John" } };
      expect(getValueAtPath(object, ["user", "email"])).toBeUndefined();
    });
  });

  describe("Different value types", () => {
    it("should get string values", () => {
      const object = { text: "hello" };
      expect(getValueAtPath(object, ["text"] as const)).toBe("hello");
    });

    it("should get number values", () => {
      const object = { count: 42, price: 19.99 };
      expect(getValueAtPath(object, ["count"] as const)).toBe(42);
      expect(getValueAtPath(object, ["price"] as const)).toBe(19.99);
    });

    it("should get boolean values", () => {
      const object = { isActive: true, isDeleted: false };
      expect(getValueAtPath(object, ["isActive"] as const)).toBe(true);
      expect(getValueAtPath(object, ["isDeleted"] as const)).toBe(false);
    });

    it("should get null values", () => {
      const object = { value: null };
      expect(getValueAtPath(object, ["value"])).toBeNull();
    });

    it("should get undefined values", () => {
      const object = { value: undefined };
      expect(getValueAtPath(object, ["value"])).toBeUndefined();
    });

    it("should get array values", () => {
      const object = { items: [1, 2, 3] };
      expect(getValueAtPath(object, ["items"])).toEqual([1, 2, 3]);
    });

    it("should get object values", () => {
      const object = { user: { name: "John", age: 30 } };
      expect(getValueAtPath(object, ["user"])).toEqual({ name: "John", age: 30 });
    });

    it("should get zero values", () => {
      const object = { count: 0 };
      expect(getValueAtPath(object, ["count"] as const)).toBe(0);
    });

    it("should get empty string values", () => {
      const object = { text: "" };
      expect(getValueAtPath(object, ["text"] as const)).toBe("");
    });

    it("should get empty array values", () => {
      const object = { items: [] };
      expect(getValueAtPath(object, ["items"])).toEqual([]);
    });

    it("should get empty object values", () => {
      const object = { data: {} };
      expect(getValueAtPath(object, ["data"])).toEqual({});
    });
  });

  describe("Array handling", () => {
    it("should access array elements by index", () => {
      const object = { items: ["a", "b", "c"] };
      expect(getValueAtPath(object, ["items", "0"] as const)).toBe("a");
      expect(getValueAtPath(object, ["items", "1"] as const)).toBe("b");
      expect(getValueAtPath(object, ["items", "2"] as const)).toBe("c");
    });

    it("should access nested objects in arrays", () => {
      const object = {
        users: [
          { name: "John", age: 30 },
          { name: "Jane", age: 25 },
        ],
      };
      expect(getValueAtPath(object, ["users", "0", "name"] as const)).toBe("John");
      expect(getValueAtPath(object, ["users", "1", "age"] as const)).toBe(25);
    });

    it("should access deeply nested arrays", () => {
      const object = {
        data: {
          items: [
            { values: [1, 2, 3] },
            { values: [4, 5, 6] },
          ],
        },
      };
      expect(getValueAtPath(object, ["data", "items", "0", "values", "1"] as const)).toBe(2);
      expect(getValueAtPath(object, ["data", "items", "1", "values", "2"] as const)).toBe(6);
    });

    it("should return undefined for out-of-bounds array index", () => {
      const object = { items: ["a", "b", "c"] };
      expect(getValueAtPath(object, ["items", "5"])).toBeUndefined();
    });

    it("should handle negative array indices as keys", () => {
      const object = { items: ["a", "b", "c"] };
      // Negative indices are treated as property keys, not array indices
      expect(getValueAtPath(object, ["items", "-1"])).toBeUndefined();
    });
  });

  describe("Edge cases", () => {
    it("should return undefined when traversing through null", () => {
      const object = { user: null };
      expect(getValueAtPath(object, ["user", "name"])).toBeUndefined();
    });

    it("should return undefined when traversing through undefined", () => {
      const object = { user: undefined };
      expect(getValueAtPath(object, ["user", "name"])).toBeUndefined();
    });

    it("should return undefined when traversing through primitive values", () => {
      const object = { value: "string" };
      expect(getValueAtPath(object, ["value", "length"])).toBeUndefined();
    });

    it("should return undefined when traversing through numbers", () => {
      const object = { value: 42 };
      expect(getValueAtPath(object, ["value", "property"])).toBeUndefined();
    });

    it("should return undefined when traversing through booleans", () => {
      const object = { value: true };
      expect(getValueAtPath(object, ["value", "property"])).toBeUndefined();
    });

    it("should handle paths with empty string keys", () => {
      const object = { "": "empty key" };
      expect(getValueAtPath(object, [""] as const)).toBe("empty key");
    });

    it("should handle paths with special characters", () => {
      const object = {
        "field-name": "value1",
        "field.name": "value2",
        "field@name": "value3",
      };
      expect(getValueAtPath(object, ["field-name"] as const)).toBe("value1");
      expect(getValueAtPath(object, ["field.name"] as const)).toBe("value2");
      expect(getValueAtPath(object, ["field@name"] as const)).toBe("value3");
    });

    it("should handle paths with unicode characters", () => {
      const object = {
        名前: "name",
        поле: "field",
      };
      expect(getValueAtPath(object, ["名前"] as const)).toBe("name");
      expect(getValueAtPath(object, ["поле"] as const)).toBe("field");
    });

    it("should handle paths with numeric string keys", () => {
      const object = {
        "123": "numeric key",
        "0": "zero key",
      };
      expect(getValueAtPath(object, ["123"] as const)).toBe("numeric key");
      expect(getValueAtPath(object, ["0"] as const)).toBe("zero key");
    });

    it("should handle very long paths", () => {
      let object: Record<string, unknown> = {};
      let current = object;
      const path: string[] = [];

      // Create a deeply nested object
      for (let i = 0; i < 50; i++) {
        const key = `level${i}`;
        path.push(key);
        current[key] = i === 49 ? "deep value" : {};
        current = current[key] as Record<string, unknown>;
      }

      expect(getValueAtPath(object, path)).toBe("deep value");
    });

    it("should not modify the original object", () => {
      const object = { user: { name: "John" } };
      const original = JSON.stringify(object);
      getValueAtPath(object, ["user", "name"]);
      expect(JSON.stringify(object)).toBe(original);
    });
  });
});

describe("setValueAtPath", () => {
  describe("Basic functionality", () => {
    it("should set top-level value", () => {
      const object = { name: "John" };
      const result = setValueAtPath(object, ["name"], "Jane");
      expect(result.name).toBe("Jane");
    });

    it("should add new top-level property", () => {
      const object = { name: "John" };
      const result = setValueAtPath(object, ["age"], 30);
      expect(result).toEqual({ name: "John", age: 30 });
    });

    it("should set nested value", () => {
      const object = {
        user: {
          name: "John",
        },
      };
      const result = setValueAtPath(object, ["user", "name"], "Jane");
      expect(result.user.name).toBe("Jane");
    });

    it("should create nested objects when path does not exist", () => {
      const object = {};
      const result = setValueAtPath(object, ["user", "profile", "email"], "john@example.com");
      expect(result).toEqual({
        user: {
          profile: {
            email: "john@example.com",
          },
        },
      });
    });

    it("should set deeply nested value", () => {
      const object = {
        level1: {
          level2: {
            level3: {
              value: "old",
            },
          },
        },
      };
      const result = setValueAtPath(object, ["level1", "level2", "level3", "value"], "new");
      expect(result.level1.level2.level3.value).toBe("new");
    });

    it("should return same object when path is empty", () => {
      const object = { name: "John" };
      const result = setValueAtPath(object, [], "value");
      expect(result).toEqual(object);
    });
  });

  describe("Immutability", () => {
    it("should not modify the original object", () => {
      const object = { user: { name: "John" } };
      const original = JSON.stringify(object);
      setValueAtPath(object, ["user", "name"], "Jane");
      expect(JSON.stringify(object)).toBe(original);
      expect(object.user.name).toBe("John");
    });

    it("should create new object references at all levels", () => {
      const object = {
        user: {
          profile: {
            name: "John",
          },
        },
      };
      const result = setValueAtPath(object, ["user", "profile", "name"], "Jane");

      // Original should be unchanged
      expect(object.user.profile.name).toBe("John");

      // Result should have new value
      expect(result.user.profile.name).toBe("Jane");

      // References should be different
      expect(result).not.toBe(object);
      expect(result.user).not.toBe(object.user);
      expect(result.user.profile).not.toBe(object.user.profile);
    });

    it("should preserve other properties at the same level", () => {
      const object = {
        name: "John",
        age: 30,
        city: "New York",
      };
      const result = setValueAtPath(object, ["age"], 31);
      expect(result).toEqual({
        name: "John",
        age: 31,
        city: "New York",
      });
    });

    it("should preserve sibling nested objects", () => {
      const object = {
        user: {
          name: "John",
          address: {
            city: "New York",
          },
        },
      };
      const result = setValueAtPath(object, ["user", "name"], "Jane");
      expect(result.user.address.city).toBe("New York");
    });
  });

  describe("Different value types", () => {
    it("should set string values", () => {
      const object = {};
      const result = setValueAtPath(object, ["text"], "hello");
      expect(result.text).toBe("hello");
    });

    it("should set number values", () => {
      const object = {};
      const result = setValueAtPath(object, ["count"], 42);
      expect(result.count).toBe(42);
    });

    it("should set boolean values", () => {
      const object = {};
      const result = setValueAtPath(object, ["isActive"], true);
      expect(result.isActive).toBe(true);
    });

    it("should set null values", () => {
      const object = { value: "something" };
      const result = setValueAtPath(object, ["value"], null);
      expect(result.value).toBeNull();
    });

    it("should set undefined values", () => {
      const object = { value: "something" };
      const result = setValueAtPath(object, ["value"], undefined);
      expect(result.value).toBeUndefined();
    });

    it("should set array values", () => {
      const object = {};
      const result = setValueAtPath(object, ["items"], [1, 2, 3]);
      expect(result.items).toEqual([1, 2, 3]);
    });

    it("should set object values", () => {
      const object = {};
      const result = setValueAtPath(object, ["user"], { name: "John" });
      expect(result.user).toEqual({ name: "John" });
    });

    it("should set zero values", () => {
      const object = {};
      const result = setValueAtPath(object, ["count"], 0);
      expect(result.count).toBe(0);
    });

    it("should set empty string values", () => {
      const object = {};
      const result = setValueAtPath(object, ["text"], "");
      expect(result.text).toBe("");
    });

    it("should set empty array values", () => {
      const object = {};
      const result = setValueAtPath(object, ["items"], []);
      expect(result.items).toEqual([]);
    });

    it("should set empty object values", () => {
      const object = {};
      const result = setValueAtPath(object, ["data"], {});
      expect(result.data).toEqual({});
    });
  });

  describe("Path creation", () => {
    it("should create intermediate objects when they do not exist", () => {
      const object = {};
      const result = setValueAtPath(object, ["a", "b", "c"], "value");
      expect(result).toEqual({
        a: {
          b: {
            c: "value",
          },
        },
      });
    });

    it("should create objects over non-object values", () => {
      const object = { user: "string" };
      const result = setValueAtPath(object, ["user", "name"], "John");
      expect(result.user).toEqual({ name: "John" });
    });

    it("should create objects over null values", () => {
      const object = { user: null };
      const result = setValueAtPath(object, ["user", "name"], "John");
      expect(result.user).toEqual({ name: "John" });
    });

    it("should create objects over undefined values", () => {
      const object = { user: undefined };
      const result = setValueAtPath(object, ["user", "name"], "John");
      expect(result.user).toEqual({ name: "John" });
    });

    it("should create objects over primitive values", () => {
      const object = { data: 42 };
      const result = setValueAtPath(object, ["data", "value"], "new");
      expect(result.data).toEqual({ value: "new" });
    });
  });

  describe("Array handling", () => {
    it("should set array element by index", () => {
      const object = { items: ["a", "b", "c"] };
      const result = setValueAtPath(object, ["items", "1"], "x");
      expect(result.items).toEqual(["a", "x", "c"]);
      expect(Array.isArray(result.items)).toBe(true);
    });

    it("should set nested object in array", () => {
      const object = {
        users: [
          { name: "John", age: 30 },
          { name: "Jane", age: 25 },
        ],
      } as const;
      const result = setValueAtPath(object, ["users", "0", "age"], 31);
      expect(result.users[0]!.age).toBe(31);
      expect(result.users[1]!.age).toBe(25);
      expect(Array.isArray(result.users)).toBe(true);
    });

    it("should handle deeply nested arrays", () => {
      const object = {
        data: {
          items: [
            { values: [1, 2, 3] },
            { values: [4, 5, 6] },
          ],
        },
      } as const;
      const result = setValueAtPath(object, ["data", "items", "0", "values", "1"], 99);
      expect(result.data.items[0]!.values[1]).toBe(99);
      expect(result.data.items[1]!.values[1]).toBe(5);
      expect(Array.isArray(result.data.items)).toBe(true);
      expect(Array.isArray(result.data.items[0]!.values)).toBe(true);
    });

    it("should not modify original array", () => {
      const object = { items: ["a", "b", "c"] };
      const result = setValueAtPath(object, ["items", "1"], "x");
      expect(object.items).toEqual(["a", "b", "c"]);
      expect(result.items).toEqual(["a", "x", "c"]);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items).not.toBe(object.items);
    });
  });

  describe("Edge cases", () => {
    it("should handle paths with empty string keys", () => {
      const object = {};
      const result = setValueAtPath(object, [""], "value");
      expect(result[""]).toBe("value");
    });

    it("should handle paths with special characters", () => {
      const object = {};
      const result = setValueAtPath(object, ["field-name"], "value1");
      expect(result["field-name"]).toBe("value1");
    });

    it("should handle paths with unicode characters", () => {
      const object = {};
      const result = setValueAtPath(object, ["名前"], "name");
      expect(result["名前"]).toBe("name");
    });

    it("should handle paths with numeric string keys", () => {
      const object = {};
      const result = setValueAtPath(object, ["123"], "value");
      expect(result["123"]).toBe("value");
    });

    it("should handle very long paths", () => {
      const object = {};
      const path: string[] = [];
      for (let i = 0; i < 50; i++) {
        path.push(`level${i}`);
      }

      const result = setValueAtPath(object, path, "deep value");

      let current = result;
      for (let i = 0; i < 49; i++) {
        current = current[`level${i}`]!;
      }
      expect(current['level49']).toBe("deep value");
    });

    it("should handle single element path", () => {
      const object = {};
      const result = setValueAtPath(object, ["key"], "value");
      expect(result.key).toBe("value");
    });

    it("should overwrite existing nested structures", () => {
      const object = {
        user: {
          profile: {
            name: "John",
            age: 30,
          },
        },
      };
      const result = setValueAtPath(object, ["user", "profile"], { name: "Jane" });
      expect(result.user.profile).toEqual({ name: "Jane" });
    });
  });
});

describe("deleteValueAtPath", () => {
  describe("Basic functionality", () => {
    it("should delete top-level property", () => {
      const object = { name: "John", age: 30 };
      const result = deleteValueAtPath(object, ["age"]);
      expect(result).toEqual({ name: "John" });
      expect(result).not.toHaveProperty("age");
    });

    it("should delete nested property", () => {
      const object = {
        user: {
          name: "John",
          email: "john@example.com",
        },
      };
      const result = deleteValueAtPath(object, ["user", "email"]);
      expect(result.user).toEqual({ name: "John" });
      expect(result.user).not.toHaveProperty("email");
    });

    it("should delete deeply nested property", () => {
      const object = {
        level1: {
          level2: {
            level3: {
              toDelete: "value",
              toKeep: "keep",
            },
          },
        },
      };
      const result = deleteValueAtPath(object, ["level1", "level2", "level3", "toDelete"]);
      expect(result.level1.level2.level3).toEqual({ toKeep: "keep" });
      expect(result.level1.level2.level3).not.toHaveProperty("toDelete");
    });

    it("should return same object when path is empty", () => {
      const object = { name: "John" };
      const result = deleteValueAtPath(object, []);
      expect(result).toEqual(object);
    });

    it("should handle non-existent paths gracefully", () => {
      const object = { name: "John" };
      const result = deleteValueAtPath(object, ["nonExistent"]);
      expect(result).toEqual({ name: "John" });
    });

    it("should handle non-existent nested paths gracefully", () => {
      const object = { user: { name: "John" } };
      const result = deleteValueAtPath(object, ["user", "nonExistent"]);
      expect(result.user).toEqual({ name: "John" });
    });
  });

  describe("Immutability", () => {
    it("should not modify the original object", () => {
      const object = { name: "John", age: 30 };
      const original = JSON.stringify(object);
      deleteValueAtPath(object, ["age"]);
      expect(JSON.stringify(object)).toBe(original);
      expect(object.age).toBe(30);
    });

    it("should create new object references at all levels", () => {
      const object = {
        user: {
          profile: {
            name: "John",
            age: 30,
          },
        },
      };
      const result = deleteValueAtPath(object, ["user", "profile", "age"]);

      // Original should be unchanged
      expect(object.user.profile.age).toBe(30);

      // Result should not have age
      expect(result.user.profile).not.toHaveProperty("age");

      // References should be different
      expect(result).not.toBe(object);
      expect(result.user).not.toBe(object.user);
      expect(result.user.profile).not.toBe(object.user.profile);
    });

    it("should preserve other properties at the same level", () => {
      const object = {
        name: "John",
        age: 30,
        city: "New York",
      };
      const result = deleteValueAtPath(object, ["age"]);
      expect(result).toEqual({
        name: "John",
        city: "New York",
      });
    });

    it("should preserve sibling nested objects", () => {
      const object = {
        user: {
          name: "John",
          age: 30,
          address: {
            city: "New York",
            street: "123 Main St",
          },
        },
      };
      const result = deleteValueAtPath(object, ["user", "name"]);
      expect(result.user.address).toEqual({
        city: "New York",
        street: "123 Main St",
      });
      expect(result.user.age).toBe(30);
    });
  });

  describe("Different value types", () => {
    it("should delete string values", () => {
      const object = { text: "hello", other: "world" };
      const result = deleteValueAtPath(object, ["text"]);
      expect(result).toEqual({ other: "world" });
    });

    it("should delete number values", () => {
      const object = { count: 42, price: 19.99 };
      const result = deleteValueAtPath(object, ["count"]);
      expect(result).toEqual({ price: 19.99 });
    });

    it("should delete boolean values", () => {
      const object = { isActive: true, isDeleted: false };
      const result = deleteValueAtPath(object, ["isActive"]);
      expect(result).toEqual({ isDeleted: false });
    });

    it("should delete null values", () => {
      const object = { value: null, other: "keep" };
      const result = deleteValueAtPath(object, ["value"]);
      expect(result).toEqual({ other: "keep" });
    });

    it("should delete undefined values", () => {
      const object = { value: undefined, other: "keep" };
      const result = deleteValueAtPath(object, ["value"]);
      expect(result).toEqual({ other: "keep" });
    });

    it("should delete array values", () => {
      const object = { items: [1, 2, 3], other: "keep" };
      const result = deleteValueAtPath(object, ["items"]);
      expect(result).toEqual({ other: "keep" });
    });

    it("should delete nested object values", () => {
      const object = {
        user: { name: "John", age: 30 },
        other: "keep",
      };
      const result = deleteValueAtPath(object, ["user"]);
      expect(result).toEqual({ other: "keep" });
    });
  });

  describe("Path traversal", () => {
    it("should handle path through null gracefully", () => {
      const object = { user: null };
      const result = deleteValueAtPath(object, ["user", "name"]);
      expect(result).toEqual({ user: null });
    });

    it("should handle path through undefined gracefully", () => {
      const object = { user: undefined };
      const result = deleteValueAtPath(object, ["user", "name"]);
      expect(result).toEqual({ user: undefined });
    });

    it("should handle path through primitive values gracefully", () => {
      const object = { value: "string" };
      const result = deleteValueAtPath(object, ["value", "length"]);
      expect(result).toEqual({ value: "string" });
    });

    it("should handle path through numbers gracefully", () => {
      const object = { value: 42 };
      const result = deleteValueAtPath(object, ["value", "property"]);
      expect(result).toEqual({ value: 42 });
    });

    it("should handle missing intermediate objects", () => {
      const object = { user: { name: "John" } };
      const result = deleteValueAtPath(object, ["user", "profile", "email"]);
      expect(result).toEqual({ user: { name: "John" } });
    });
  });

  describe("Array handling", () => {
    it("should delete property from object in array", () => {
      const object = {
        users: [
          { name: "John", age: 30 },
          { name: "Jane", age: 25 },
        ],
      };
      const result = deleteValueAtPath(object, ["users", "0", "age"]);
      expect(result.users[0]).toEqual({ name: "John" });
      expect(result.users[1]).toEqual({ name: "Jane", age: 25 });
      expect(Array.isArray(result.users)).toBe(true);
    });

    it('should delete array item by index', () => {
      const object = {
        items: [1, 2, 3],
      };
      const result = deleteValueAtPath(object, ["items", "1"]);
      expect(result.items).toEqual([1, undefined, 3]);
    });

    it("should handle deeply nested arrays", () => {
      const object = {
        data: {
          items: [
            { values: [1, 2, 3], name: "first" },
            { values: [4, 5, 6], name: "second" },
          ],
        },
      };
      const result = deleteValueAtPath(object, ["data", "items", "0", "name"]);
      expect(result.data.items[0]).toEqual({ values: [1, 2, 3] });
      expect(result.data.items[1]).toEqual({ values: [4, 5, 6], name: "second" });
      expect(Array.isArray(result.data.items)).toBe(true);
    });

    it("should not modify original array", () => {
      const object = {
        users: [
          { name: "John", age: 30 },
          { name: "Jane", age: 25 },
        ],
      };
      const result = deleteValueAtPath(object, ["users", "0", "age"]);
      expect(object.users[0]).toEqual({ name: "John", age: 30 });
      expect(result.users[0]).toEqual({ name: "John" });
      expect(result.users).not.toBe(object.users);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty string keys", () => {
      const object = { "": "value", other: "keep" };
      const result = deleteValueAtPath(object, [""]);
      expect(result).toEqual({ other: "keep" });
    });

    it("should handle special characters in keys", () => {
      const object = {
        "field-name": "value1",
        "field.name": "value2",
        "field@name": "value3",
      };
      const result = deleteValueAtPath(object, ["field-name"]);
      expect(result).toEqual({
        "field.name": "value2",
        "field@name": "value3",
      });
    });

    it("should handle unicode characters in keys", () => {
      const object = {
        名前: "name",
        поле: "field",
        other: "keep",
      };
      const result = deleteValueAtPath(object, ["名前"]);
      expect(result).toEqual({
        поле: "field",
        other: "keep",
      });
    });

    it("should handle numeric string keys", () => {
      const object = {
        "123": "numeric key",
        "0": "zero key",
        other: "keep",
      };
      const result = deleteValueAtPath(object, ["123"]);
      expect(result).toEqual({
        "0": "zero key",
        other: "keep",
      });
    });

    it("should handle very long paths", () => {
      const object: Record<string, unknown> = { root: {} };
      let current = object["root"] as Record<string, unknown>;
      const path: string[] = ["root"];

      // Create a deeply nested object
      for (let i = 0; i < 50; i++) {
        const key = `level${i}`;
        path.push(key);
        if (i === 49) {
          current[key] = "deep value";
          current["keep"] = "this";
        } else {
          current[key] = {};
          current = current[key] as Record<string, unknown>;
        }
      }

      const result = deleteValueAtPath(object, path);

      // Navigate to the deep level and verify deletion
      let checkCurrent = result["root"] as Record<string, unknown>;
      for (let i = 0; i < 49; i++) {
        checkCurrent = checkCurrent[`level${i}`] as Record<string, unknown>;
      }
      expect(checkCurrent).toEqual({ keep: "this" });
      expect(checkCurrent).not.toHaveProperty("level49");
    });

    it("should handle deleting only property in object", () => {
      const object = { onlyProperty: "value" };
      const result = deleteValueAtPath(object, ["onlyProperty"]);
      expect(result).toEqual({});
    });

    it("should handle deleting property that makes nested object empty", () => {
      const object = {
        user: {
          profile: {
            name: "John",
          },
        },
      };
      const result = deleteValueAtPath(object, ["user", "profile", "name"]);
      expect(result.user.profile).toEqual({});
    });
  });
});
