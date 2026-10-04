/**
 * Keeps a calendar's secret address from being read once it is saved.
 *
 * The address is the key to the calendar, and a saved dashboard is a file in
 * this browser's storage that is exported, edited and shared as YAML. So the
 * widget stores a sealed form of it: AES-GCM, under a key this browser makes
 * for itself the first time and keeps in IndexedDB, marked non-extractable so
 * it can be used but never read back out, and never part of the dashboard, its
 * storage or its export. The settings never show an address again, and a
 * dashboard imported on another browser can't open the addresses in it: they
 * are pasted again there.
 *
 * What this is, and isn't: it keeps an address out of the YAML, out of storage
 * a person might browse or share, and off the screen. It does not stand
 * against someone who can run code in this page, or use this browser's
 * developer tools, because the page itself has to open the address to fetch the
 * calendar. A page served over plain http can't do it at all (browsers keep
 * their cryptography for https and localhost), so there an address is saved as
 * typed, and the settings say so.
 */

/** A sealed address: a version, the random nonce and the encrypted address, in URL-safe base64. */
const SEALED = /^enc1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,1200}$/;

export const isSealed = (value: string): boolean => SEALED.test(value);

/** Ties a sealed address to being one: it won't open as anything else sealed with the same key. */
const PURPOSE = new TextEncoder().encode('home-slice calendar address v1');

/** Where the one key is kept. */
export type KeyStore = {
  /** The key made before, or undefined. */
  read: () => Promise<CryptoKey | undefined>;
  /**
   * Keeps `candidate` unless another tab got there first, and says which key stands. Two tabs
   * opened at once must not each make their own, or what one sealed the other couldn't open.
   */
  keep: (candidate: CryptoKey) => Promise<CryptoKey>;
};

const DB_NAME = 'home-slice';
const STORE = 'keys';
const KEY_ID = 'calendar-address';

const settled = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB failed.'));
  });

const finished = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB aborted.'));
  });

const openDatabase = (factory: IDBFactory): Promise<IDBDatabase> => {
  const request = factory.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE);
  };
  return settled(request);
};

/** The key store in a browser's IndexedDB. */
export const databaseKeyStore = (factory: IDBFactory): KeyStore => ({
  read: async () => {
    const database = await openDatabase(factory);

    try {
      const key = await settled(database.transaction(STORE).objectStore(STORE).get(KEY_ID));
      return key as CryptoKey | undefined;
    } finally {
      database.close();
    }
  },

  keep: async (candidate) => {
    const database = await openDatabase(factory);

    try {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const existing = (await settled(store.get(KEY_ID))) as CryptoKey | undefined;

      if (existing) {
        return existing;
      }

      store.put(candidate, KEY_ID);
      await finished(transaction);
      return candidate;
    } finally {
      database.close();
    }
  }
});

const encode = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const decode = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (character) =>
    character.charCodeAt(0)
  );

export type Sealer = {
  /** An address as it is kept: sealed under this browser's key, which is made if there is none. */
  seal: (address: string) => Promise<string>;
  /** The address inside a sealed one, or null: it isn't sealed, or this browser's key isn't the one. */
  open: (sealed: string) => Promise<string | null>;
};

export const createSealer = (store: KeyStore): Sealer => {
  let known: Promise<CryptoKey> | null = null;

  const makeKey = async (): Promise<CryptoKey> => {
    const existing = await store.read();

    if (existing) {
      return existing;
    }

    const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt'
    ]);
    return store.keep(fresh);
  };

  return {
    seal: async (address) => {
      // A failure isn't remembered, so a store that was busy or blocked is tried again.
      known ??= makeKey().catch((error: unknown) => {
        known = null;
        throw error;
      });
      const key = await known;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const sealed = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: PURPOSE },
        key,
        new TextEncoder().encode(address)
      );

      return `enc1.${encode(iv)}.${encode(new Uint8Array(sealed))}`;
    },

    open: async (sealed) => {
      if (!isSealed(sealed)) {
        return null;
      }

      try {
        // Without a key of its own, this browser has nothing that could open it; one isn't made.
        const key = (await known) ?? (await store.read());

        if (!key) {
          return null;
        }

        const [, iv, data] = sealed.split('.');
        const opened = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: decode(iv), additionalData: PURPOSE },
          key,
          decode(data)
        );

        return new TextDecoder().decode(opened);
      } catch {
        return null;
      }
    }
  };
};

/**
 * Whether this page can seal addresses: a browser keeps its cryptography for https and
 * localhost, and without IndexedDB there is nowhere to keep the key.
 */
export const canProtect = (): boolean =>
  typeof crypto !== 'undefined' &&
  typeof crypto.subtle?.encrypt === 'function' &&
  typeof indexedDB !== 'undefined';

let shared: Sealer | null = null;

const sealer = (): Sealer => (shared ??= createSealer(databaseKeyStore(indexedDB)));

/** Seals an address; rejects where the page can't (see canProtect). */
export const seal = async (address: string): Promise<string> => sealer().seal(address);

/** The address in a sealed one, or null: not one of this browser's, or this page can't open it. */
export const open = async (sealed: string): Promise<string | null> => {
  try {
    return await sealer().open(sealed);
  } catch {
    return null;
  }
};
