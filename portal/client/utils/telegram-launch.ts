export function telegramLaunchData(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, '')).get('tgWebAppData') ?? '';
}
