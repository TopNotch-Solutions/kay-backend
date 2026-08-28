'use strict';

const CLINIC_TZ = 'Africa/Windhoek';

/** Calendar date YYYYMMDD in clinic local time (Africa/Windhoek). */
function clinicCalendarDateCompact(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}${m}${d}`;
}

module.exports = { CLINIC_TZ, clinicCalendarDateCompact };
