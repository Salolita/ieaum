import assert from 'node:assert/strict';
import { getTelegramInitData, telegramLaunchContext } from '../../uni-ludo/src/utils/telegram.ts';

const signedData = 'auth_date=1000&user=%7B%22id%22%3A123456%7D&hash=fixture';
let closed = 0;
Object.assign(globalThis, {window: {}, location: {hash: ''}});

assert.equal(getTelegramInitData(), '');
assert.equal(telegramLaunchContext().inTelegram, false);

globalThis.location.hash = '#tgWebAppPlatform=tdesktop';
assert.equal(getTelegramInitData(), '');
assert.equal(telegramLaunchContext().inTelegram, true);
assert.equal(telegramLaunchContext().close, undefined);

globalThis.location.hash += '&tgWebAppData=' + encodeURIComponent(signedData);
assert.equal(getTelegramInitData(), signedData);

Object.assign(globalThis.window, {Telegram: {WebApp: {
  initData: 'SDK session', platform: 'tdesktop', close: () => { closed++; },
}}});
assert.equal(getTelegramInitData(), signedData);
globalThis.location.hash = '';
assert.equal(getTelegramInitData(), 'SDK session');
telegramLaunchContext().close?.();
assert.equal(closed, 1);
console.log('Verified UniLudo signed launch fallback, direct-browser detection and Mini App close.');
