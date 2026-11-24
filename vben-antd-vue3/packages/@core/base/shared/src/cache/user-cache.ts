// A bucket captures its owner. Deferred work must retain the bucket it started with.
export type CacheArea = 'local' | 'session';
type Owner = null | string | undefined;
const fallback = {
  local: new Map<string, null | string>(),
  session: new Map<string, null | string>(),
};

function storage(area: CacheArea) {
  return area === 'session' ? sessionStorage : localStorage;
}

export class CacheBucket {
  constructor(
    private prefix: string,
    private area: CacheArea,
    private volatile = false,
  ) {}

  child(name: string) {
    return new CacheBucket(this.key(`${name}/`), this.area, this.volatile);
  }
  clear() {
    for (const name of this.keys()) this.removeItem(name);
  }

  get<T>(name: string): T | undefined {
    const raw = this.getItem(name);
    if (raw !== null) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        /* Invalid optional cache. */
      }
    }
  }

  getItem(name: string): null | string {
    const key = this.key(name);
    const memory = fallback[this.area];
    if (memory.has(key)) return memory.get(key) ?? null;
    if (this.volatile) return null;
    try {
      return storage(this.area).getItem(key);
    } catch {
      return null;
    }
  }

  key(name: string) {
    return this.prefix + encodeURIComponent(name);
  }

  keys(): string[] {
    const found = new Set<string>();
    if (!this.volatile) {
      try {
        const db = storage(this.area);
        for (let i = 0; i < db.length; i++) {
          const key = db.key(i);
          if (key?.startsWith(this.prefix)) found.add(key);
        }
      } catch {
        /* Include any in-memory entries below. */
      }
    }
    for (const [key, value] of fallback[this.area]) {
      if (!key.startsWith(this.prefix)) continue;
      if (value === null) found.delete(key);
      else found.add(key);
    }
    return [...found].map((key) =>
      decodeURIComponent(key.slice(this.prefix.length)),
    );
  }

  // Only callers that can establish the legacy entry's owner may import it.
  migrate(
    name: string,
    legacyKey: string,
    accept: (raw: string) => boolean = () => true,
    convert: (raw: string) => string = (raw) => raw,
  ) {
    if (this.volatile) return;
    try {
      const db = storage(this.area);
      const raw = db.getItem(legacyKey);
      if (raw === null || !accept(raw)) return;
      if (db.getItem(this.key(name)) === null) {
        this.setItem(name, this.getItem(name) ?? convert(raw), true);
      }
      db.removeItem(legacyKey);
    } catch {
      /* Keep the original until migration succeeds. */
    }
  }

  removeItem(name: string) {
    const key = this.key(name);
    if (!this.volatile) {
      try {
        storage(this.area).removeItem(key);
        fallback[this.area].delete(key);
        return;
      } catch {
        /* Hide the disk value while storage is unavailable. */
      }
    }
    fallback[this.area].set(key, null);
  }

  set<T>(name: string, value: T) {
    this.setItem(name, JSON.stringify(value));
  }

  setItem(name: string, value: string, requireDisk = false) {
    const key = this.key(name);
    if (!this.volatile) {
      try {
        storage(this.area).setItem(key, value);
        fallback[this.area].delete(key);
        return;
      } catch (error) {
        if (requireDisk) throw error;
      }
    }
    if (requireDisk) throw new Error('Persistent storage unavailable');
    fallback[this.area].set(key, value);
  }
}

export function removeLegacyCache(name: string, area: CacheArea = 'local') {
  try {
    storage(area).removeItem(name);
  } catch {
    /* Optional legacy entry. */
  }
}

let namespace = 'vben-pc';
let account: Owner;
let unidentified = 0;
let revision = 0;
const listeners = new Set<() => void>();

function bucket(owner: string, area: CacheArea, volatile = false) {
  return new CacheBucket(
    `vben-cache:v1:${encodeURIComponent(namespace)}:${encodeURIComponent(owner)}:`,
    area,
    volatile,
  );
}

export const userCache = {
  configure(application: string, authService: string) {
    namespace = JSON.stringify([
      application,
      new URL(authService, location.origin).href,
    ]);
  },
  get account() {
    return account;
  },
  capture() {
    const origin = account;
    const generation = revision;
    return () => origin === account && generation === revision;
  },
  // undefined is the anonymous user. An authenticated token without a usable
  // subject gets an isolated memory-only bucket, never the anonymous bucket.
  bind(next: Owner) {
    if (next === account && next !== null) return;
    if (next === null) unidentified++;
    revision++;
    account = next;
    for (const listener of listeners) listener();
  },
  onChange(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  current(area: CacheArea = 'local') {
    if (account === null) return bucket(`unknown/${unidentified}`, area, true);
    return account === undefined
      ? this.anonymous(area)
      : bucket(`user/${account}`, area);
  },
  anonymous(area: CacheArea = 'local') {
    return bucket('anonymous', area);
  },
  device(area: CacheArea = 'local') {
    return bucket('device', area);
  },
};
