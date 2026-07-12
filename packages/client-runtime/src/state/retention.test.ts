import { describe, expect, it, vi } from "vite-plus/test";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import {
  cacheFiniteQueryValue,
  createBoundedAtomFamily,
  retainFiniteQueryAtom,
} from "./retention.ts";

describe("createBoundedAtomFamily", () => {
  it("evicts the least recently used idle atom at its capacity", () => {
    const family = createBoundedAtomFamily((key: string) => Atom.make(key), 2);
    const first = family.get("first");
    const second = family.get("second");

    expect(family.get("first")).toBe(first);
    family.get("third");

    expect(family.cachedKeys()).toEqual(["first", "third"]);
    expect(family.get("second")).not.toBe(second);
  });

  it("does not evict a retained atom when only it remains eligible", () => {
    const family = createBoundedAtomFamily((key: string) => Atom.make(key), 1);
    const active = family.get("active");
    const release = retainFiniteQueryAtom(active);
    const registry = AtomRegistry.make();
    const unmount = registry.mount(active);

    family.get("inactive");

    expect(family.cachedKeys()).toEqual(["active"]);
    expect(family.get("active")).toBe(active);
    expect(registry.getNodes().has(active)).toBe(true);
    unmount();
    registry.dispose();
    release?.();
  });

  it("drops an evicted idle value even before its warm TTL expires", () => {
    const createdValues = new Map<string, Array<string | undefined>>();
    const family = createBoundedAtomFamily(
      (key: string, cachedValue: string | undefined) => {
        const values = createdValues.get(key) ?? [];
        values.push(cachedValue);
        createdValues.set(key, values);
        return Atom.make(key);
      },
      2,
      60_000,
    );
    const first = family.get("first");
    const releaseFirst = retainFiniteQueryAtom(first);
    cacheFiniteQueryValue(first, "first value");
    releaseFirst?.();

    const second = family.get("second");
    const releaseSecond = retainFiniteQueryAtom(second);
    cacheFiniteQueryValue(second, "second value");
    releaseSecond?.();

    family.get("third");

    expect(family.cachedKeys()).toEqual(["second", "third"]);
    family.get("first");
    expect(createdValues.get("first")).toEqual([undefined, "first value", undefined]);
  });

  it("expires an idle warm value after its TTL", () => {
    vi.useFakeTimers();
    const createdValues = new Map<string, Array<string | undefined>>();
    const family = createBoundedAtomFamily(
      (key: string, cachedValue: string | undefined) => {
        const values = createdValues.get(key) ?? [];
        values.push(cachedValue);
        createdValues.set(key, values);
        return Atom.make(key);
      },
      2,
      100,
    );
    const atom = family.get("first");
    const release = retainFiniteQueryAtom(atom);
    cacheFiniteQueryValue(atom, "first value");
    release?.();

    vi.advanceTimersByTime(101);

    family.get("first");
    expect(createdValues.get("first")).toEqual([undefined, "first value", undefined]);
    vi.useRealTimers();
  });
});
