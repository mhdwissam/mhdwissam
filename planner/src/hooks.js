import { useSyncExternalStore } from 'react';
import { getState, getVersion, subscribe, getSessionUserId, today } from './lib/store.js';
import { userById } from './lib/engine.js';

export function useStore() {
  useSyncExternalStore(subscribe, getVersion);
  return { s: getState(), today: today() };
}

export function useMe() {
  const { s } = useStore();
  const id = getSessionUserId();
  return s && id ? userById(s, id) : null;
}
