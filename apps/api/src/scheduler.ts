/**
 * Scheduled-refresh selection for Cloudflare Cron Triggers.
 *
 * refresh_cron uses a 5-field cron expression (minute hour dom month dow).
 * Supported syntax: wildcard, slash-step (e.g. every 15 minutes), exact
 * numbers, ranges `a-b`, and comma lists of those. Standard-cron semantics
 * where both dom and dow are specified act as OR; this MVP applies AND
 * (documented limitation — daily schedules are unaffected).
 */

export interface CronSpec {
  minute: readonly number[];
  hour: readonly number[];
  dayOfMonth: readonly number[];
  month: readonly number[];
  dayOfWeek: readonly number[];
}

function parseField(raw: string, min: number, max: number): number[] | null {
  const out = new Set<number>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') return null;
    const stepMatch = /^(?:\*|(\d+))(?:\/(\d+))?$/u.exec(trimmed);
    if (stepMatch) {
      const isStar = stepMatch[1] === undefined;
      const hasStep = stepMatch[2] !== undefined;
      const base = isStar ? min : Number(stepMatch[1]);
      const step = hasStep ? Number(stepMatch[2]) : null;
      if (!isStar && (base < min || base > max)) return null;
      if (step !== null && (!Number.isInteger(step) || step < 1)) return null;
      if (step === null) {
        // `*` expands to the full range; an exact number is a single value.
        for (let v = isStar ? min : base; v <= (isStar ? max : base); v += 1) out.add(v);
      } else {
        for (let v = base; v <= max; v += step) out.add(v);
      }
      continue;
    }
    const rangeMatch = /^(\d+)-(\d+)(?:\/(\d+))?$/u.exec(trimmed);
    if (rangeMatch) {
      const from = Number(rangeMatch[1]);
      const to = Number(rangeMatch[2]);
      const step = rangeMatch[3] === undefined ? 1 : Number(rangeMatch[3]);
      if (from < min || to > max || from > to || step < 1) return null;
      for (let v = from; v <= to; v += step) out.add(v);
      continue;
    }
    return null;
  }
  return [...out];
}

export function parseCron(cron: string): CronSpec | null {
  const fields = cron.trim().split(/\s+/u);
  if (fields.length !== 5) return null;
  const minute = parseField(fields[0] ?? '', 0, 59);
  const hour = parseField(fields[1] ?? '', 0, 23);
  const dayOfMonth = parseField(fields[2] ?? '', 1, 31);
  const month = parseField(fields[3] ?? '', 1, 12);
  const dayOfWeek = parseField(fields[4] ?? '', 0, 7);
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

/** True when the (UTC) date matches every field of the spec. */
export function cronMatches(spec: CronSpec, date: Date): boolean {
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const dayOfWeek = date.getUTCDay();
  const dowMatches =
    spec.dayOfWeek.includes(dayOfWeek) || (dayOfWeek === 0 && spec.dayOfWeek.includes(7));
  return (
    spec.minute.includes(minute) &&
    spec.hour.includes(hour) &&
    spec.dayOfMonth.includes(dayOfMonth) &&
    spec.month.includes(month) &&
    dowMatches
  );
}

export interface DueSourceInput {
  slug: string;
  refreshCron: string | null;
  lastRunAt: string | null;
}

/**
 * Selects sources whose cron matches `now` and whose most recent run is older
 * than `minIntervalMinutes` (so a retried scheduled invocation does not run
 * the same source twice in one window).
 */
export function selectDueSources(
  sources: readonly DueSourceInput[],
  now: Date,
  minIntervalMinutes = 55,
): string[] {
  return sources
    .filter((source) => {
      if (!source.refreshCron) return false;
      const spec = parseCron(source.refreshCron);
      if (!spec) return false;
      if (!cronMatches(spec, now)) return false;
      if (source.lastRunAt) {
        const lastRun = Date.parse(source.lastRunAt);
        if (Number.isFinite(lastRun) && now.getTime() - lastRun < minIntervalMinutes * 60_000) {
          return false;
        }
      }
      return true;
    })
    .map((source) => source.slug);
}
