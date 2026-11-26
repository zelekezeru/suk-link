// Market-aware calendar days.
//
// "Today" for a shop is the calendar day in its market's timezone
// (markets.timezone), never the UTC day. Africa/Addis_Ababa is UTC+3, so an
// order placed at 01:30 local time is still "today" there while UTC says
// yesterday.

const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();

function getDayKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = dayKeyFormatters.get(timeZone);
  if (!fmt) {
    try {
      // en-CA formats as YYYY-MM-DD.
      fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      // Unknown or unsupported zone in this WebView: fall back to UTC rather than throw.
      fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }
    dayKeyFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/** The calendar day (YYYY-MM-DD) of an instant, as seen in `timeZone`. */
export function marketDayKey(input: string | number | Date, timeZone: string): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return getDayKeyFormatter(timeZone).format(date);
}

/** True when `input` falls on the same calendar day as `now` in `timeZone`. */
export function isMarketToday(
  input: string | number | Date | null | undefined,
  timeZone: string,
  now: Date = new Date()
): boolean {
  if (input == null) return false;
  const key = marketDayKey(input, timeZone);
  return key !== '' && key === marketDayKey(now, timeZone);
}
