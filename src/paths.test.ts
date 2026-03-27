import { describe, expect, it } from "vitest";
import { isVec2, Vec2 } from "./math/vec2";
import { getAtPath, setAtPath } from "./paths";

describe("getAtPath", () => {
  it("gets shallow properties", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(getAtPath<typeof obj, number>(obj, ["a"])).toBe(1);
    expect(getAtPath<typeof obj, number>(obj, ["b"])).toBe(2);
    expect(getAtPath<typeof obj, number>(obj, ["c"])).toBe(3);
  });

  it("gets nested properties", () => {
    const obj = {
      user: {
        name: "Alice",
        address: {
          city: "NYC",
          zip: 10001,
        },
      },
    };

    expect(getAtPath<typeof obj, string>(obj, ["user", "name"])).toBe("Alice");
    expect(
      getAtPath<typeof obj, string>(obj, ["user", "address", "city"]),
    ).toBe("NYC");
    expect(getAtPath<typeof obj, number>(obj, ["user", "address", "zip"])).toBe(
      10001,
    );
  });

  it("gets array elements", () => {
    const obj = {
      items: [10, 20, 30],
    };

    expect(getAtPath<typeof obj, number>(obj, ["items", 0])).toBe(10);
    expect(getAtPath<typeof obj, number>(obj, ["items", 1])).toBe(20);
    expect(getAtPath<typeof obj, number>(obj, ["items", 2])).toBe(30);
  });

  it("handles deeply nested structures", () => {
    const obj = {
      a: {
        b: {
          c: {
            d: {
              e: "deep value",
            },
          },
        },
      },
    };

    expect(getAtPath<typeof obj, string>(obj, ["a", "b", "c", "d", "e"])).toBe(
      "deep value",
    );
  });
});

describe("setAtPath", () => {
  it("sets shallow properties immutably", () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = setAtPath<typeof obj, number>(obj, ["b"], 99);

    expect(result).toEqual({ a: 1, b: 99, c: 3 });
    expect(obj).toEqual({ a: 1, b: 2, c: 3 }); // original unchanged
    expect(result).not.toBe(obj); // different object
  });

  it("sets nested properties immutably", () => {
    const obj = {
      user: {
        name: "Alice",
        age: 30,
      },
      admin: false,
    };

    const result = setAtPath<typeof obj, string>(obj, ["user", "name"], "Bob");

    expect(result).toEqual({
      user: {
        name: "Bob",
        age: 30,
      },
      admin: false,
    });
    expect(obj.user.name).toBe("Alice"); // original unchanged
    expect(result).not.toBe(obj);
    expect(result.user).not.toBe(obj.user);
  });

  it("sets deeply nested properties", () => {
    const obj = {
      a: {
        b: {
          c: {
            d: {
              e: 42,
            },
          },
        },
      },
    };

    const result = setAtPath<typeof obj, number>(
      obj,
      ["a", "b", "c", "d", "e"],
      100,
    );

    expect(
      getAtPath<typeof result, number>(result, ["a", "b", "c", "d", "e"]),
    ).toBe(100);
    expect(getAtPath<typeof obj, number>(obj, ["a", "b", "c", "d", "e"])).toBe(
      42,
    ); // original unchanged
  });

  it("sets array elements", () => {
    const obj = {
      items: [1, 2, 3],
    };

    const result = setAtPath<typeof obj, number>(obj, ["items", 1], 99);

    expect(result.items).toEqual([1, 99, 3]);
    expect(obj.items).toEqual([1, 2, 3]); // original unchanged
  });

  it("preserves sibling properties", () => {
    const obj = {
      user: {
        name: "Alice",
        age: 30,
        email: "alice@example.com",
      },
    };

    const result = setAtPath<typeof obj, number>(obj, ["user", "age"], 31);

    expect(result.user.name).toBe("Alice");
    expect(result.user.age).toBe(31);
    expect(result.user.email).toBe("alice@example.com");
  });

  it("handles replacing entire objects", () => {
    const obj = {
      config: {
        theme: "dark",
        lang: "en",
      },
    };

    const newConfig = { theme: "light", lang: "es" };
    const result = setAtPath<typeof obj, { theme: string; lang: string }>(
      obj,
      ["config"],
      newConfig,
    );

    expect(result.config).toEqual(newConfig);
    expect(obj.config).toEqual({ theme: "dark", lang: "en" });
  });

  it("preserves Vec2 instances when setting properties", () => {
    const obj = {
      pos: Vec2(10, 20),
    };

    const result = setAtPath<typeof obj, number>(obj, ["pos", "x"], 30);

    expect(isVec2(result.pos)).toBe(true);
    expect(result.pos.x).toBe(30);
    expect(result.pos.y).toBe(20);
  });
});

describe("integration: get and set", () => {
  it("round-trips values correctly", () => {
    const obj = {
      data: {
        users: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      },
    };

    const original = getAtPath<typeof obj, string>(obj, [
      "data",
      "users",
      1,
      "name",
    ]);
    expect(original).toBe("Bob");

    const updated = setAtPath<typeof obj, string>(
      obj,
      ["data", "users", 1, "name"],
      "Robert",
    );
    const newValue = getAtPath<typeof updated, string>(updated, [
      "data",
      "users",
      1,
      "name",
    ]);
    expect(newValue).toBe("Robert");

    // Original unchanged
    expect(
      getAtPath<typeof obj, string>(obj, ["data", "users", 1, "name"]),
    ).toBe("Bob");
  });

  it("works with complex state updates", () => {
    type State = {
      ui: {
        modal: {
          isOpen: boolean;
          title: string;
        };
      };
      data: {
        count: number;
      };
    };

    const state: State = {
      ui: {
        modal: {
          isOpen: false,
          title: "Welcome",
        },
      },
      data: {
        count: 0,
      },
    };

    let nextState = setAtPath<State, boolean>(
      state,
      ["ui", "modal", "isOpen"],
      true,
    );
    nextState = setAtPath<State, string>(
      nextState,
      ["ui", "modal", "title"],
      "Hello",
    );
    nextState = setAtPath<State, number>(nextState, ["data", "count"], 5);

    expect(nextState).toEqual({
      ui: {
        modal: {
          isOpen: true,
          title: "Hello",
        },
      },
      data: {
        count: 5,
      },
    });

    // Original unchanged
    expect(state.ui.modal.isOpen).toBe(false);
    expect(state.data.count).toBe(0);
  });

  it("type checks paths match values", () => {
    type Obj = {
      str: string;
      num: number;
      nested: {
        bool: boolean;
      };
    };

    const obj: Obj = {
      str: "hello",
      num: 42,
      nested: {
        bool: true,
      },
    };

    // These should type-check correctly
    const s = getAtPath<Obj, string>(obj, ["str"]);
    const n = getAtPath<Obj, number>(obj, ["num"]);
    const b = getAtPath<Obj, boolean>(obj, ["nested", "bool"]);

    expect(s).toBe("hello");
    expect(n).toBe(42);
    expect(b).toBe(true);

    // Set operations
    const obj2 = setAtPath<Obj, string>(obj, ["str"], "world");
    const obj3 = setAtPath<Obj, number>(obj2, ["num"], 100);
    const obj4 = setAtPath<Obj, boolean>(obj3, ["nested", "bool"], false);

    expect(obj4.str).toBe("world");
    expect(obj4.num).toBe(100);
    expect(obj4.nested.bool).toBe(false);
  });
});
