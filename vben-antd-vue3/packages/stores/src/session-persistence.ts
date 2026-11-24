import { userCache } from '@vben-core/shared/cache';

import SecureLS from 'secure-ls';

type StringStore = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
type SecureStore = {
  get(key: string): unknown;
  set(key: string, value: string): void;
  remove(key: string): void;
};
type SecureConstructor = new (options: {
  storage?: StringStore;
  encodingType: string;
  encryptionSecret: string;
  metaKey: string;
}) => SecureStore;
const module = SecureLS as unknown as {
  default?: SecureConstructor;
  SecureLS?: SecureConstructor;
};
const Encrypted =
  module.default ??
  module.SecureLS ??
  (SecureLS as unknown as SecureConstructor);

function encrypted(metaKey: string, storage?: StringStore): StringStore {
  const secure = new Encrypted({
    storage,
    metaKey,
    encodingType: 'aes',
    encryptionSecret: import.meta.env.VITE_APP_STORE_SECURE_KEY,
  });
  return {
    getItem(key) {
      const raw = secure.get(key);
      return typeof raw === 'string' && raw ? raw : null;
    },
    setItem: (key, value) => secure.set(key, value),
    removeItem: (key) => secure.remove(key),
  };
}

interface Recovery {
  token: string;
  lock?: string;
  locale?: string;
}
const activeKey = 'active-session';
let slot: null | string = null;
let detached = false;
let vault: StringStore | undefined;

function read(id: null | string): Recovery | undefined {
  if (!id || !vault) return;
  try {
    return JSON.parse(vault.getItem(`session/${id}`) ?? 'null') ?? undefined;
  } catch {
    return undefined;
  }
}

export const browserSession = {
  initialize(namespace: string, encrypt = import.meta.env.PROD) {
    const device = userCache.device();
    const tab = userCache.device('session');
    try {
      vault = encrypt ? encrypted('secure-meta', device) : device;
    } catch {
      // A corrupt encryption index cannot be used for restoration.
      device.removeItem('secure-meta');
      vault = encrypted('secure-meta', device);
    }
    const active = device.getItem(activeKey);
    const previous = tab.getItem(activeKey);
    slot = previous ?? active;
    // Only recover a shared legacy refresh credential. /info must repopulate permissions.
    if (!slot) {
      try {
        const oldKey = `${namespace}-core-access`;
        if (!encrypt) device.migrate('legacy-access', oldKey);
        const legacy = encrypt ? encrypted(`${namespace}-secure-meta`) : device;
        const name = encrypt ? oldKey : 'legacy-access';
        const saved = JSON.parse(legacy.getItem(name) ?? 'null');
        if (typeof saved?.refreshToken === 'string')
          this.save(saved.refreshToken, true);
        if (saved) legacy.removeItem(name);
      } catch {
        /* An unavailable or unreadable credential requires a new login. */
      }
    }
    if (slot) tab.setItem(activeKey, slot);
    const restored = this.isCurrent() ? read(slot) : undefined;
    detached = !!slot && !restored?.token;
    if (detached) slot = null;
    if (restored && slot) {
      const lock = vault.getItem(`lock/${slot}`);
      if (lock) restored.lock = lock;
    }
    return restored;
  },
  get detached() {
    return detached;
  },
  isCurrent() {
    return (
      !vault ||
      !slot ||
      (userCache.device().getItem(activeKey) === slot &&
        userCache.device().getItem(`session/${slot}`) !== null)
    );
  },
  latestToken(fallback: null | string) {
    if (!slot || !vault) return fallback;
    return this.isCurrent() ? (read(slot)?.token ?? null) : null;
  },
  restorationLocale(token: string) {
    const saved = this.isCurrent() ? read(slot) : undefined;
    return saved?.token === token && typeof saved.locale === 'string'
      ? saved.locale
      : undefined;
  },
  setLocale(locale: string) {
    if (!slot || !vault || !this.isCurrent()) return;
    const saved = read(slot);
    if (!saved?.token || saved.locale === locale) return;
    vault.setItem(
      `session/${slot}`,
      JSON.stringify({ token: saved.token, locale }),
    );
  },
  capture() {
    const original = slot;
    return () => original === slot && this.isCurrent();
  },
  hasExpired() {
    return !!slot && !this.isCurrent();
  },
  save(token: string, login = false) {
    if (!vault) return;
    const device = userCache.device();
    if (login || !slot) {
      detached = false;
      const prior = device.getItem(activeKey);
      slot = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      vault.setItem(`session/${slot}`, JSON.stringify({ token }));
      userCache.device('session').setItem(activeKey, slot);
      device.setItem(activeKey, slot);
      if (prior) {
        vault.removeItem(`session/${prior}`);
        vault.removeItem(`lock/${prior}`);
      }
    } else if (this.isCurrent()) {
      const locale = read(slot)?.locale;
      vault.setItem(`session/${slot}`, JSON.stringify({ token, locale }));
    }
  },
  lock(password?: string) {
    if (!slot || !vault || !this.isCurrent()) return;
    if (password) vault.setItem(`lock/${slot}`, password);
    else vault.removeItem(`lock/${slot}`);
  },
  end() {
    // Never delete the shared pointer: another tab may have just claimed it.
    if (slot) {
      vault?.removeItem(`session/${slot}`);
      vault?.removeItem(`lock/${slot}`);
    }
    detached = true;
    slot = null;
  },
};
