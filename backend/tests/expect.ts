import assert from "node:assert/strict";

/** Minimal Jest-style matchers on top of node:assert, used with the built-in node:test runner. */
export function expect(actual: unknown) {
  const matchers = (negate: boolean) => {
    const check = (pass: boolean, msg: string) => assert.ok(negate ? !pass : pass, negate ? `Expected not: ${msg}` : msg);
    return {
      toBe: (expected: unknown) => check(Object.is(actual, expected), `${String(actual)} to be ${String(expected)}`),
      toEqual: (expected: unknown) => {
        if (negate) assert.notDeepStrictEqual(actual, expected);
        else assert.deepStrictEqual(actual, expected);
      },
      toContain: (item: unknown) =>
        check(
          typeof actual === "string" ? actual.includes(String(item)) : Array.isArray(actual) && actual.includes(item),
          `${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`,
        ),
      toMatch: (re: RegExp) => check(re.test(String(actual)), `${String(actual)} to match ${re}`),
      toBeTruthy: () => check(Boolean(actual), `${String(actual)} to be truthy`),
      toThrow: () => {
        let threw = false;
        try {
          (actual as () => unknown)();
        } catch {
          threw = true;
        }
        check(threw, "function to throw");
      },
    };
  };
  return {
    ...matchers(false),
    not: matchers(true),
    rejects: {
      toBeTruthy: async () => {
        await assert.rejects(actual as Promise<unknown>);
      },
    },
  };
}
