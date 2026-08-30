'use strict';

const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const callExternalApi = require('../utils/connectSMS');
const { normalizePhone } = require('./consentOtpService');
const { FollowUpReminder } = require('../models');

/** Namibia / CAT — no DST. Doctor date+time are treated as local clinic time. */
const FOLLOW_UP_TZ_OFFSET = '+02:00';

const REMINDER_OFFSETS_MS = {
  day_before: 24 * 60 * 60 * 1000,
  three_hours_before: 3 * 60 * 60 * 1000,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Today's calendar date in Africa/Windhoek (YYYY-MM-DD). */
function todayInClinicTz(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Windhoek',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

/**
 * Parse follow-up date (+ optional time) as a Date in clinic local time.
 * Default time 09:00 when only a date is provided.
 */
function parseFollowUpAt(dateStr, timeStr) {
  const date = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let time = String(timeStr || '').trim();
  if (!time) time = '09:00';
  const m = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = pad2(Number(m[1]));
  const mm = pad2(Number(m[2]));
  const ss = pad2(Number(m[3] || 0));
  const parsed = new Date(`${date}T${hh}:${mm}:${ss}${FOLLOW_UP_TZ_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Follow-up date must be strictly after today's clinic calendar date.
 */
function assertFollowUpIsFuture(followUp, now = new Date()) {
  if (!followUp || typeof followUp !== 'object') return null;
  const date = String(followUp.date || '').trim();
  const time = String(followUp.time || '').trim() || null;
  const notes = String(followUp.notes || '').trim() || null;
  if (!date && !time && !notes) return null;
  if (!date) {
    const err = new Error('Follow-up date is required when scheduling a follow-up.');
    err.status = 400;
    throw err;
  }
  const today = todayInClinicTz(now);
  if (date <= today) {
    const err = new Error('Follow-up date must be a future date (tomorrow or later).');
    err.status = 400;
    throw err;
  }
  const at = parseFollowUpAt(date, time);
  if (!at) {
    const err = new Error('Invalid follow-up date or time.');
    err.status = 400;
    throw err;
  }
  return { date, time, notes, at };
}

function formatFollowUpDisplay(at) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Windhoek',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}

function buildReminderMessage(reminderType, followUpAt) {
  const when = formatFollowUpDisplay(followUpAt);
  if (reminderType === 'day_before') {
    return `Kay-One Dental: Reminder — you have a follow-up appointment tomorrow (${when}). Please attend as scheduled.`;
  }
  return `Kay-One Dental: Reminder — your follow-up appointment is in 3 hours (${when}). Please arrive on time.`;
}

function patientPhone(patient) {
  if (!patient) return '';
  return normalizePhone(patient.cell_phone || patient.phone || patient.telephone || '');
}

function isFollowUpCancelled(followUp) {
  return String(followUp?.status || '').toLowerCase() === 'cancelled';
}

function isFollowUpInactive(followUp) {
  const status = String(followUp?.status || '').toLowerCase();
  return status === 'cancelled' || status === 'attended' || status === 'completed';
}

/**
 * Replace pending reminders for a consultation based on dental_exam.follow_up.
 * Cancels pending rows when follow-up is cleared.
 */
async function syncFollowUpReminders({
  consultation,
  visit,
  patient,
  transaction = null,
  now = new Date(),
} = {}) {
  if (!consultation?.id || !visit?.id) return { scheduled: 0, cancelled: 0 };

  const dentalExam = consultation.dental_exam
    || (typeof consultation.get === 'function' ? consultation.get('dental_exam') : null);
  const followUp = dentalExam?.follow_up || null;

  if (isFollowUpInactive(followUp)) {
    const [cancelled] = await FollowUpReminder.update(
      { status: 'cancelled' },
      {
        where: {
          consultation_id: consultation.id,
          status: 'pending',
        },
        transaction,
      }
    );
    return { scheduled: 0, cancelled };
  }

  let validated = null;
  try {
    validated = assertFollowUpIsFuture(followUp, now);
  } catch (err) {
    throw err;
  }

  const cancelPending = async () => {
    const [cancelled] = await FollowUpReminder.update(
      { status: 'cancelled' },
      {
        where: {
          consultation_id: consultation.id,
          status: 'pending',
        },
        transaction,
      }
    );
    return cancelled;
  };

  if (!validated) {
    const cancelled = await cancelPending();
    return { scheduled: 0, cancelled };
  }

  const phone = patientPhone(patient);
  if (!phone) {
    const err = new Error(
      'Patient cell phone is required to schedule follow-up SMS reminders.'
    );
    err.status = 400;
    throw err;
  }

  await cancelPending();

  const types = [
    {
      reminder_type: 'day_before',
      scheduled_for: new Date(validated.at.getTime() - REMINDER_OFFSETS_MS.day_before),
    },
    {
      reminder_type: 'three_hours_before',
      scheduled_for: new Date(validated.at.getTime() - REMINDER_OFFSETS_MS.three_hours_before),
    },
  ];

  let scheduled = 0;
  for (const row of types) {
    if (row.scheduled_for.getTime() <= now.getTime()) {
      // Appointment too soon for this reminder window — skip.
      continue;
    }
    const message = buildReminderMessage(row.reminder_type, validated.at);
    const existing = await FollowUpReminder.findOne({
      where: {
        consultation_id: consultation.id,
        reminder_type: row.reminder_type,
      },
      transaction,
    });

    const payload = {
      visit_id: visit.id,
      patient_id: visit.patient_id || patient.id,
      phone,
      follow_up_at: validated.at,
      scheduled_for: row.scheduled_for,
      status: 'pending',
      message,
      sent_at: null,
      last_error: null,
    };

    if (existing) {
      const sameAppointment =
        existing.status === 'sent'
        && new Date(existing.follow_up_at).getTime() === validated.at.getTime();
      if (sameAppointment) continue;
      await existing.update(payload, { transaction });
    } else {
      await FollowUpReminder.create({
        id: uuidv4(),
        consultation_id: consultation.id,
        reminder_type: row.reminder_type,
        ...payload,
      }, { transaction });
    }
    scheduled += 1;
  }

  return { scheduled, cancelled: 0 };
}

async function processDueFollowUpReminders({ now = new Date(), limit = 50 } = {}) {
  const due = await FollowUpReminder.findAll({
    where: {
      status: 'pending',
      scheduled_for: { [Op.lte]: now },
    },
    order: [['scheduled_for', 'ASC']],
    limit,
  });

  let sent = 0;
  let failed = 0;

  for (const reminder of due) {
    try {
      await callExternalApi(reminder.phone, reminder.message);
      await reminder.update({
        status: 'sent',
        sent_at: new Date(),
        last_error: null,
      });
      sent += 1;
    } catch (err) {
      await reminder.update({
        status: 'failed',
        last_error: (err.message || 'SMS send failed').slice(0, 1000),
      });
      failed += 1;
      console.error(
        `Follow-up reminder ${reminder.id} (${reminder.reminder_type}) failed:`,
        err.message
      );
    }
  }

  return { processed: due.length, sent, failed };
}

function startFollowUpReminderScheduler({ intervalMs = 60 * 1000 } = {}) {
  const run = async () => {
    try {
      const result = await processDueFollowUpReminders();
      if (result.sent > 0 || result.failed > 0) {
        console.log(
          `Follow-up reminders: sent ${result.sent}, failed ${result.failed}`
        );
      }
    } catch (err) {
      console.error('Follow-up reminder sweep error:', err.message);
    }
  };

  run();
  return setInterval(run, intervalMs);
}

module.exports = {
  todayInClinicTz,
  parseFollowUpAt,
  assertFollowUpIsFuture,
  formatFollowUpDisplay,
  patientPhone,
  syncFollowUpReminders,
  processDueFollowUpReminders,
  startFollowUpReminderScheduler,
  REMINDER_OFFSETS_MS,
};
