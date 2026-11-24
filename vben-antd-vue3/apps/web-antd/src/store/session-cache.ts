import { userCache } from '@vben/utils/cache';

import { decodeJwt } from 'jose';

import { claimPreferenceDrafts } from './preference-drafts';

// Authentication drives the cache before any protected view or onboarding request.
// The URL alone cannot distinguish a guest from a signed-in user on /auth/bind-email.
export function bindSessionCache(accessToken: string) {
  let owner: null | string = null;
  let previousKey: string | undefined;
  try {
    const { code, iss, sub } = decodeJwt(accessToken);
    if (typeof sub === 'string' && sub) {
      owner = JSON.stringify([iss ?? '', sub]);
      if (typeof code === 'string' && code)
        previousKey = JSON.stringify([iss ?? '', sub, code]);
    }
  } catch {
    /* Keep an unidentifiable session in memory only. */
  }
  userCache.bind(owner);
  claimPreferenceDrafts(previousKey);
}

export function releaseSessionCache() {
  userCache.bind(undefined);
}
