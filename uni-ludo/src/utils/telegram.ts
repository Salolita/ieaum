import { telegramLaunchData } from '../../../portal/client/utils/telegram-launch';

interface TelegramHapticFeedback {
  impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged: () => void;
}

interface TelegramWebApp {
  initData?: string;
  ready: () => void;
  expand: () => void;
  close?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  openTelegramLink?: (url: string) => void;
  HapticFeedback?: TelegramHapticFeedback;
  platform?: string;
  version?: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

function getWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

export function initTelegramWebApp(): boolean {
  const tg = getWebApp();
  if (!tg) return false;
  try {
    tg.ready();
    tg.expand();
    if (tg.isVersionAtLeast?.('6.1')) {
      tg.setHeaderColor?.('#130F1B');
      tg.setBackgroundColor?.('#130F1B');
    }
    return true;
  } catch {
    return false;
  }
}

export function getTelegramInitData(): string {
  return telegramLaunchData(location.hash) || getWebApp()?.initData || '';
}

export function telegramLaunchContext() {
  const app = getWebApp();
  const platform = new URLSearchParams(location.hash.slice(1)).get('tgWebAppPlatform') || app?.platform;
  const inTelegram = Boolean(getTelegramInitData() || (platform && platform !== 'unknown'));
  return {inTelegram, close: inTelegram && app?.close ? () => app.close?.() : undefined};
}

export function triggerHaptic(
  kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'
) {
  const tg = getWebApp();
  try {
    if (tg?.HapticFeedback && tg.isVersionAtLeast?.('6.1')) {
      if (kind === 'success' || kind === 'warning' || kind === 'error') {
        tg.HapticFeedback.notificationOccurred(kind);
      } else {
        tg.HapticFeedback.impactOccurred(kind);
      }
      return;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const ms = kind === 'heavy' || kind === 'error' ? 35 : kind === 'medium' || kind === 'success' ? 18 : 10;
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore unsupported vibration environments
  }
}

export async function shareMatchResult(text: string): Promise<'telegram' | 'share' | 'copied' | 'failed'> {
  const tg = getWebApp();
  if (tg?.openTelegramLink) {
    try {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('https://t.me/ieaumbot?start=uniludo')}&text=${encodeURIComponent(text)}`;
      tg.openTelegramLink(shareUrl);
      return 'telegram';
    } catch {
      // Fall through to native share / clipboard
    }
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: 'مِنچَک!', text });
      return 'share';
    } catch {
      // User canceled or unsupported
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}
