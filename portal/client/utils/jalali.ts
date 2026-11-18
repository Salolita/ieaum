const dayMs = 86_400_000;
const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
  year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
});

export function jalaliParts(date: Date) {
  const parts = formatter.formatToParts(date);
  const part = (name: string) => Number(parts.find((value) => value.type === name)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

export function jalaliToISO(value: string) {
  const normalized = value.trim().replace(/[۰-۹٠-٩]/g, (digit) =>
    String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660)));
  const match = /^(1[23-5]\d{2})[/-](\d{1,2})[/-](\d{1,2})$/.exec(normalized);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const wanted = year * 10_000 + month * 100 + day;
  let left = Date.UTC(year + 621, 0, 1) / dayMs;
  let right = Date.UTC(year + 622, 3, 1) / dayMs;
  while (left <= right) {
    const middle = Math.floor((right + left) / 2);
    const date = new Date(middle * dayMs);
    const parts = jalaliParts(date);
    const current = parts.year * 10_000 + parts.month * 100 + parts.day;
    if (current === wanted) return date.toISOString().slice(0, 10);
    if (current < wanted) left = middle + 1;
    else right = middle - 1;
  }
  return null;
}
