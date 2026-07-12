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
 * warm keys per family; mounted keys are pinned until their React subscriber
 * releases them.
 */
export const FINITE_QUERY_FAMILY_MAX_ENTRIES = 20;

/**
 * The warm cache does not reuse idle values older than this period, while the
 * LRU bounds their count. Atom-registry query nodes release their own payloads
 * immediately when idle, so LRU eviction drops the only remaining strong
 * result reference.
 */
export const BOUNDED_FINITE_QUERY_IDLE_TTL_MS = 2 * 60_000;

/** The atom registry must not retain a second copy of a bounded query result. */
export const BOUNDED_FINITE_QUERY_ATOM_IDLE_TTL_MS = 0;

interface FiniteQueryEntry<T extends object, A> {
  atom: T;
  activeSubscribers: number;
  cachedValue: A | undefined;
  idleSince: number | undefined;
}

interface FiniteQueryAtomLease {
  readonly retain: () => () => void;
  readonly cacheValue: (value: unknown) => void;
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
export function createBoundedAtomFamily<T extends object, A>(
  create: (key: string, cachedValue: A | undefined) => T,
  maxEntries: number,
  idleTtlMs = BOUNDED_FINITE_QUERY_IDLE_TTL_MS,
): BoundedAtomFamily<T> {
  const entries = new Map<string, FiniteQueryEntry<T, A>>();

  const remove = (key: string) => {
    entries.delete(key);
  };

  const evictIdleEntries = () => {
    while (entries.size > maxEntries) {
      const candidate = [...entries.entries()].find(([, entry]) => entry.activeSubscribers === 0);
      if (candidate === undefined) {
        return;
      }
      remove(candidate[0]);
    }
  };

  const touch = (key: string, entry: FiniteQueryEntry<T, A>) => {
    entry.idleSince = undefined;
    entries.delete(key);
    entries.set(key, entry);
  };

  const evictExpiredIdleEntries = () => {
    const now = globalThis.performance.now();
    for (const [key, entry] of entries) {
      if (
        entry.activeSubscribers === 0 &&
        entry.idleSince !== undefined &&
        now - entry.idleSince >= idleTtlMs
      ) {
        remove(key);
      }
    }
  };

  const registerAtom = (key: string, entry: FiniteQueryEntry<T, A>) => {
    finiteQueryAtomLeases.set(entry.atom, {
      retain: () => {
        entry.activeSubscribers += 1;
        touch(key, entry);
        return () => {
          entry.activeSubscribers -= 1;
          if (entry.activeSubscribers === 0 && entry.cachedValue !== undefined) {
            entry.atom = create(key, entry.cachedValue);
            registerAtom(key, entry);
          }
          entry.idleSince = globalThis.performance.now();
          evictIdleEntries();
        };
      },
      cacheValue: (value) => {
        entry.cachedValue = value as A;
        touch(key, entry);
      },
    });
  };

  return {
    get: (key) => {
      evictExpiredIdleEntries();
      const existing = entries.get(key);
      if (existing !== undefined) {
        touch(key, existing);
        return existing.atom;
      }

      const entry: FiniteQueryEntry<T, A> = {
        atom: create(key, undefined),
        activeSubscribers: 0,
        cachedValue: undefined,
        idleSince: undefined,
      };
      registerAtom(key, entry);
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

/** Stores a successful finite-query result in its bounded warm cache. */
export function cacheFiniteQueryValue<A>(atom: Atom.Atom<unknown>, value: A): void {
  finiteQueryAtomLeases.get(atom)?.cacheValue(value);
}
