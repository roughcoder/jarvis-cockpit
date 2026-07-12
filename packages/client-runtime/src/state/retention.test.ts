import { describe, expect, it } from "vite-plus/test";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import { createBoundedAtomFamily, retainFiniteQueryAtom } from "./retention.ts";

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
});
