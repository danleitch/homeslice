import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canProtect,
  createSealer,
  databaseKeyStore,
  isSealed,
  type KeyStore
} from './calendar-secret';

const ADDRESS =
  'https://calendar.google.com/calendar/ical/dan%40example.com/private-4f9a8c1d2e3b/basic.ics';

/** A key store in memory, which counts what is asked of it. */
const memoryStore = (
  start?: CryptoKey
): KeyStore & { key: CryptoKey | undefined; reads: number; keeps: number } => {
  const store = {
    key: start,
    reads: 0,
    keeps: 0,
    read: async () => {
      store.reads += 1;
      return store.key;
    },
    keep: async (candidate: CryptoKey) => {
      store.keeps += 1;
      store.key ??= candidate;
      return store.key;
    }
  };

  return store;
};

describe('isSealed', () => {
  const sealed = `enc1.${'A'.repeat(16)}.${'B'.repeat(120)}`;

  it('knows a sealed address by its shape', () => {
    expect(isSealed(sealed)).toBe(true);
  });

  it.each([
    ['an address as typed', ADDRESS],
    ['nothing', ''],
    ['another version', sealed.replace('enc1', 'enc2')],
    ['a short nonce', `enc1.${'A'.repeat(15)}.${'B'.repeat(120)}`],
    ['a long nonce', `enc1.${'A'.repeat(17)}.${'B'.repeat(120)}`],
    ['too little data', `enc1.${'A'.repeat(16)}.${'B'.repeat(5)}`],
    ['characters base64 doesn’t use', `enc1.${'A'.repeat(16)}.${'B'.repeat(60)}+/=`],
    ['a second address after it', `${sealed} ${sealed}`],
    ['a line break', `${sealed}\n`]
  ])('does not take %s for one', (_name, value) => {
    expect(isSealed(value)).toBe(false);
  });
});

describe('createSealer', () => {
  it('seals an address so that it cannot be read, and opens it again', async () => {
    const { seal, open } = createSealer(memoryStore());

    const sealed = await seal(ADDRESS);

    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain('calendar.google.com');
    expect(sealed).not.toContain('private');
    expect(sealed).not.toContain('example');
    await expect(open(sealed)).resolves.toBe(ADDRESS);
  });

  it('seals the same address differently each time', async () => {
    const { seal, open } = createSealer(memoryStore());

    const [one, two] = [await seal(ADDRESS), await seal(ADDRESS)];

    expect(one).not.toBe(two);
    await expect(open(one)).resolves.toBe(ADDRESS);
    await expect(open(two)).resolves.toBe(ADDRESS);
  });

  it('makes one key, a key that cannot be read back out, and keeps it', async () => {
    const store = memoryStore();
    const { seal } = createSealer(store);

    await Promise.all([seal(ADDRESS), seal('another address')]);
    await seal(ADDRESS);

    expect(store.keeps).toBe(1);
    expect(store.key?.extractable).toBe(false);
    expect(store.key?.usages.sort()).toEqual(['decrypt', 'encrypt']);
  });

  it('seals under the key already kept, making none of its own', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt'
    ]);
    const store = memoryStore(key);
    const { seal, open } = createSealer(store);

    const sealed = await seal(ADDRESS);

    expect(store.keeps).toBe(0);
    expect(store.key).toBe(key);
    await expect(open(sealed)).resolves.toBe(ADDRESS);
  });

  it('opens what an earlier page sealed, from the key that page kept', async () => {
    const store = memoryStore();
    const sealed = await createSealer(store).seal(ADDRESS);

    await expect(createSealer(store).open(sealed)).resolves.toBe(ADDRESS);
    expect(store.keeps).toBe(1);
  });

  it('cannot open an address sealed by another browser, whose key is not this one', async () => {
    const sealed = await createSealer(memoryStore()).seal(ADDRESS);

    await expect(createSealer(memoryStore()).open(sealed)).resolves.toBeNull();
  });

  it('makes no key just to find it cannot open anything', async () => {
    const store = memoryStore();
    const sealed = await createSealer(memoryStore()).seal(ADDRESS);

    await expect(createSealer(store).open(sealed)).resolves.toBeNull();
    expect(store.keeps).toBe(0);
    expect(store.key).toBeUndefined();
  });

  it('does not open anything that is not a sealed address, or has been changed', async () => {
    const { seal, open } = createSealer(memoryStore());
    const sealed = await seal(ADDRESS);
    const [version, nonce, data] = sealed.split('.');
    const flipped = `${data.slice(0, 10)}${data[10] === 'A' ? 'B' : 'A'}${data.slice(11)}`;

    await expect(open(ADDRESS)).resolves.toBeNull();
    await expect(open('')).resolves.toBeNull();
    await expect(open([version, nonce, flipped].join('.'))).resolves.toBeNull();
    await expect(open([version, 'A'.repeat(16), data].join('.'))).resolves.toBeNull();
    await expect(open([version, nonce, data.slice(0, -4)].join('.'))).resolves.toBeNull();
  });

  it('is not fooled by a key it cannot read, or a store that fails', async () => {
    const failing: KeyStore = {
      read: async () => {
        throw new Error('blocked');
      },
      keep: async (candidate) => candidate
    };

    await expect(
      createSealer(failing).open(`enc1.${'A'.repeat(16)}.${'B'.repeat(40)}`)
    ).resolves.toBeNull();
  });

  it('keeps whichever key another tab kept first, rather than its own', async () => {
    const [theirs, ours] = await Promise.all([
      crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
      crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    ]);
    // The other tab wins the race between this one's looking and its keeping.
    let looked = false;
    const racing: KeyStore = {
      read: async () => {
        const seen = looked ? theirs : undefined;
        looked = true;
        return seen;
      },
      keep: async () => theirs
    };
    void ours;

    const sealed = await createSealer(racing).seal(ADDRESS);
    const afterwards = createSealer(memoryStore(theirs));

    await expect(afterwards.open(sealed)).resolves.toBe(ADDRESS);
  });

  it('tries again for a key after a store that failed once', async () => {
    let failures = 1;
    const store = memoryStore();
    const flaky: KeyStore = {
      read: async () => {
        if (failures > 0) {
          failures -= 1;
          throw new Error('blocked');
        }

        return store.read();
      },
      keep: store.keep
    };
    const { seal, open } = createSealer(flaky);

    await expect(seal(ADDRESS)).rejects.toThrow('blocked');
    const sealed = await seal(ADDRESS);

    await expect(open(sealed)).resolves.toBe(ADDRESS);
  });

  it('keeps an address and a sealed one apart by what they are for', async () => {
    // The same key sealing something else, without the purpose bound in, doesn't open as an address.
    const store = memoryStore();
    const { seal, open } = createSealer(store);
    await seal(ADDRESS);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const other = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        store.key!,
        new TextEncoder().encode(ADDRESS)
      )
    );
    const text = (bytes: Uint8Array): string =>
      btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    await expect(open(`enc1.${text(iv)}.${text(other)}`)).resolves.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The IndexedDB store, against a fake that does what a browser's does here   */
/* -------------------------------------------------------------------------- */

type Failure = 'open' | 'put' | null;

/** The part of IndexedDB the key store uses: one database, one object store, async requests. */
const fakeIndexedDB = (fail: () => Failure = () => null) => {
  const stores = new Map<string, Map<string, unknown>>();
  const log = { opened: 0, closed: 0, upgrades: 0 };

  const request = <T>(work: () => T, failure: Failure = null) => {
    const made: {
      result?: T;
      error?: Error | null;
      onsuccess?: () => void;
      onerror?: () => void;
    } = {};
    setTimeout(() => {
      if (failure && fail() === failure) {
        made.error = new Error(`${failure} failed`);
        made.onerror?.();
        return;
      }

      made.result = work();
      made.onsuccess?.();
    }, 0);
    return made;
  };

  const factory = {
    open: () => {
      const made: {
        result?: unknown;
        error?: Error | null;
        onsuccess?: () => void;
        onerror?: () => void;
        onupgradeneeded?: () => void;
      } = {};
      log.opened += 1;
      setTimeout(() => {
        if (fail() === 'open') {
          made.error = new Error('open failed');
          made.onerror?.();
          return;
        }

        const database = {
          createObjectStore: (name: string) => {
            log.upgrades += 1;
            stores.set(name, new Map());
          },
          close: () => {
            log.closed += 1;
          },
          transaction: (name: string) => {
            const records = stores.get(name)!;
            const transaction: {
              error?: Error | null;
              oncomplete?: () => void;
              onerror?: () => void;
              onabort?: () => void;
              objectStore: () => unknown;
            } = {
              objectStore: () => ({
                get: (key: string) => request(() => records.get(key)),
                put: (value: unknown, key: string) => {
                  const put = request(() => records.set(key, value), 'put');
                  setTimeout(() => {
                    if (fail() === 'put') {
                      transaction.error = new Error('put failed');
                      transaction.onerror?.();
                    } else {
                      transaction.oncomplete?.();
                    }
                  }, 5);
                  return put;
                }
              })
            };
            // A transaction that only reads is complete once its requests are.
            return transaction;
          }
        };
        made.result = database;

        if (!stores.has('keys')) {
          made.onupgradeneeded?.();
        }

        made.onsuccess?.();
      }, 0);
      return made;
    }
  };

  return { factory: factory as unknown as IDBFactory, stores, log };
};

describe('databaseKeyStore', () => {
  const makeKey = (): Promise<CryptoKey> =>
    crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

  it('has no key until one is kept, and then the one that was', async () => {
    const { factory } = fakeIndexedDB();
    const store = databaseKeyStore(factory);
    const key = await makeKey();

    await expect(store.read()).resolves.toBeUndefined();
    await expect(store.keep(key)).resolves.toBe(key);
    await expect(store.read()).resolves.toBe(key);
  });

  it('keeps the key that is already there, and says so, rather than replacing it', async () => {
    const { factory } = fakeIndexedDB();
    const store = databaseKeyStore(factory);
    const [first, second] = [await makeKey(), await makeKey()];

    await store.keep(first);

    await expect(store.keep(second)).resolves.toBe(first);
    await expect(store.read()).resolves.toBe(first);
  });

  it('makes its store once, and shuts each connection it opens', async () => {
    const { factory, log } = fakeIndexedDB();
    const store = databaseKeyStore(factory);

    await store.read();
    await store.keep(await makeKey());
    await store.read();

    expect(log.upgrades).toBe(1);
    expect(log.closed).toBe(log.opened);
  });

  it('fails, closing nothing it did not open, when the database will not open', async () => {
    const { factory, log } = fakeIndexedDB(() => 'open');
    const store = databaseKeyStore(factory);

    await expect(store.read()).rejects.toThrow('open failed');
    await expect(store.keep(await makeKey())).rejects.toThrow('open failed');
    expect(log.closed).toBe(0);
  });

  it('fails, and closes, when the key cannot be written', async () => {
    let failure: Failure = null;
    const { factory, log } = fakeIndexedDB(() => failure);
    const store = databaseKeyStore(factory);
    failure = 'put';

    await expect(store.keep(await makeKey())).rejects.toThrow('put failed');
    expect(log.closed).toBe(log.opened);
  });

  it('is what the page uses, when the browser has IndexedDB', async () => {
    const { factory } = fakeIndexedDB();
    vi.stubGlobal('indexedDB', factory);
    vi.resetModules();
    const { seal, open } = await import('./calendar-secret');

    const sealed = await seal(ADDRESS);

    expect(await open(sealed)).toBe(ADDRESS);
    // A second page load finds the key the first kept.
    vi.resetModules();
    const again = await import('./calendar-secret');
    expect(await again.open(sealed)).toBe(ADDRESS);
  });
});

describe('the page’s own seal and open, with no IndexedDB to keep a key in', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cannot seal, and says so by failing', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.resetModules();
    const { seal } = await import('./calendar-secret');

    await expect(seal(ADDRESS)).rejects.toThrow();
  });

  it('cannot open anything, and says so by finding nothing, even where IndexedDB is not there at all', async () => {
    Reflect.deleteProperty(globalThis, 'indexedDB');
    vi.resetModules();
    const { open } = await import('./calendar-secret');

    await expect(open(`enc1.${'A'.repeat(16)}.${'B'.repeat(40)}`)).resolves.toBeNull();
  });
});

describe('canProtect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true where the browser has cryptography and somewhere to keep a key', () => {
    vi.stubGlobal('indexedDB', {});

    expect(canProtect()).toBe(true);
  });

  it('is false without IndexedDB', () => {
    vi.stubGlobal('indexedDB', undefined);

    expect(canProtect()).toBe(false);
  });

  it('is false on a page a browser keeps its cryptography from, such as one on plain http', () => {
    vi.stubGlobal('indexedDB', {});
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });

    expect(canProtect()).toBe(false);
  });

  it('is false without crypto at all', () => {
    vi.stubGlobal('indexedDB', {});
    vi.stubGlobal('crypto', undefined);

    expect(canProtect()).toBe(false);
  });
});
