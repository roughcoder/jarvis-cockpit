import type { Atom } from "effect/unstable/reactivity";

/**
 * Bounds retained client-side thread detail. These windows keep active agent
 * sessions predictable while the `truncation` marker lets a future UI request
 * the omitted history from the source of truth.
 */
export const THREAD_DETAIL_RETENTION = {
  messages: 500,
  proposedPlans: 100,
  checkpoints: 100,
  activities: 1_000,
} as const;

/**
 * Finite Jarvis queries can contain full transcripts. Keep only this many
 * inactive keys strongly referenced per query family; mounted keys are pinned
 * until their React subscriber releases them.
 */
export const FINITE_QUERY_FAMILY_MAX_ENTRIES = 20;

/**
 * A bounded query atom releases its payload as soon as it has no subscribers.
 * The small LRU below preserves atom identity for the most recently visited
 * keys without retaining their remote result payloads.
 */
export const BOUNDED_FINITE_QUERY_IDLE_TTL_MS = 0;

interface FiniteQueryEntry<T extends object> {
  readonly atom: T;
  activeSubscribers: number;
}

interface FiniteQueryAtomLease {
  readonly retain: () => () => void;
}

const finiteQueryAtomLeases = new WeakMap<object, FiniteQueryAtomLease>();

export interface BoundedAtomFamily<T extends object> {
  readonly get: (key: string) => T;
  readonly cachedKeys: () => ReadonlyArray<string>;
}

/**
 * Creates an access-ordered atom family. Only idle entries are removed from
 * the LRU, so a subscribed conversation can never lose its atom identity.
 */
export function createBoundedAtomFamily<T extends object>(
  create: (key: string) => T,
  maxEntries: number,
): BoundedAtomFamily<T> {
  const entries = new Map<string, FiniteQueryEntry<T>>();

  const evictIdleEntries = () => {
    while (entries.size > maxEntries) {
      const candidate = [...entries.entries()].find(([, entry]) => entry.activeSubscribers === 0);
      if (candidate === undefined) {
        return;
      }
      entries.delete(candidate[0]);
    }
  };

  const touch = (key: string, entry: FiniteQueryEntry<T>) => {
    entries.delete(key);
    entries.set(key, entry);
  };

  return {
    get: (key) => {
      const existing = entries.get(key);
      if (existing !== undefined) {
        touch(key, existing);
        return existing.atom;
      }

      const entry: FiniteQueryEntry<T> = { atom: create(key), activeSubscribers: 0 };
      finiteQueryAtomLeases.set(entry.atom, {
        retain: () => {
          entry.activeSubscribers += 1;
          touch(key, entry);
          return () => {
            entry.activeSubscribers -= 1;
            evictIdleEntries();
          };
        },
      });
      entries.set(key, entry);
      evictIdleEntries();
      return entry.atom;
    },
    cachedKeys: () => [...entries.keys()],
  };
}

/**
 * Pins a bounded finite-query atom while a consumer is mounted. Atoms outside
 * a bounded family are intentionally a no-op.
 */
export function retainFiniteQueryAtom(atom: Atom.Atom<unknown>): (() => void) | undefined {
  return finiteQueryAtomLeases.get(atom)?.retain();
}
