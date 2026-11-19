import { rpc } from './portal-store.js';

export function automationReady() {
  return rpc<boolean>('portal_valid_week_worker', { p_key: '' }).then(() => true, () => false);
}
