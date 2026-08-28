'use strict';

const { Op } = require('sequelize');
const {
  Visit,
  QueueEntry,
  Facility,
  ClinicHospitalTransfer,
  sequelize,
} = require('../models');
const { isClinicFacility, isOutpatientDayBoundFacility } = require('../config/clinicRoles');
const {
  CLINIC_VISIT_MAX_MS,
  AUTO_CLOSE_QUEUE_NOTE,
  END_OF_DAY_CLOSE_QUEUE_NOTE,
} = require('../config/clinicVisitPolicy');
const { BOOKING_ROOM_DEPARTMENT } = require('../config/bookingRoomRouting');

const ACTIVE_QUEUE_STATUSES = ['waiting', 'in_progress'];
const OPEN_TRANSFER_STATUSES = ['pending_booking'];
const CLINIC_TRANSFER_HOLD_STATUSES = [
  'pending_booking',
  'transport_initiated',
  'external_in_transit',
  'departed_clinic',
  'arrived_hospital',
  'internal_in_transit',
  'delivered_to_department',
];

function visitIntakeAt(visit) {
  const row = visit?.toJSON ? visit.toJSON() : visit;
  return row?.created_at ? new Date(row.created_at) : null;
}

function visitExpiresAt(visit) {
  const intake = visitIntakeAt(visit);
  if (!intake || Number.isNaN(intake.getTime())) return null;
  return new Date(intake.getTime() + CLINIC_VISIT_MAX_MS);
}

function isVisitPastClinicDeadline(visit, now = new Date()) {
  const expiresAt = visitExpiresAt(visit);
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime();
}

function getVisitExpiryInfo(visit, now = new Date()) {
  const expiresAt = visitExpiresAt(visit);
  if (!expiresAt) {
    return { expiresAt: null, expired: false, msRemaining: null };
  }
  const msRemaining = expiresAt.getTime() - now.getTime();
  return {
    expiresAt,
    expired: msRemaining <= 0,
    msRemaining: Math.max(0, msRemaining),
  };
}

async function isClinicVisit(visit, transaction = null) {
  if (!visit?.facility_id) return false;
  const facility = visit.facility
    || await Facility.findByPk(visit.facility_id, { transaction });
  return isOutpatientDayBoundFacility(facility);
}

async function isClinicVisitHeldOpen(visitId, transaction = null) {
  const bookingEntry = await QueueEntry.findOne({
    where: {
      visit_id: visitId,
      department: BOOKING_ROOM_DEPARTMENT,
      status: { [Op.in]: ACTIVE_QUEUE_STATUSES },
    },
    transaction,
  });
  if (bookingEntry) return true;

  const openTransfer = await ClinicHospitalTransfer.findOne({
    where: {
      visit_id: visitId,
      transfer_status: { [Op.in]: CLINIC_TRANSFER_HOLD_STATUSES },
    },
    transaction,
  });
  return Boolean(openTransfer);
}

const CLINIC_TZ = 'Africa/Windhoek';

function clinicCalendarParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return {
    y: parts.find((p) => p.type === 'year')?.value,
    m: parts.find((p) => p.type === 'month')?.value,
    d: parts.find((p) => p.type === 'day')?.value,
  };
}

function clinicCalendarDateCompact(now = new Date()) {
  const { y, m, d } = clinicCalendarParts(now);
  return `${y}${m}${d}`;
}

function startOfClinicDay(now = new Date()) {
  const { y, m, d } = clinicCalendarParts(now);
  return new Date(`${y}-${m}-${d}T00:00:00+02:00`);
}

function visitNumberCalendarDate(visit) {
  const row = visit?.toJSON ? visit.toJSON() : visit;
  const num = row?.visit_number;
  const match = String(num || '').match(/^VIS-(\d{8})-/i);
  return match ? match[1] : null;
}

function isVisitBeforeClinicDay(visit, now = new Date()) {
  const todayCompact = clinicCalendarDateCompact(now);
  const visitNumDate = visitNumberCalendarDate(visit);
  if (visitNumDate && visitNumDate < todayCompact) return true;

  const intake = visitIntakeAt(visit);
  if (!intake || Number.isNaN(intake.getTime())) return false;
  return intake.getTime() < startOfClinicDay(now).getTime();
}

async function closeClinicVisitAndQueues(visit, {
  transaction = null,
  now = new Date(),
  queueNote,
} = {}) {
  const activeEntries = await QueueEntry.findAll({
    where: {
      visit_id: visit.id,
      status: { [Op.in]: ACTIVE_QUEUE_STATUSES },
    },
    transaction,
  });

  for (const entry of activeEntries) {
    const mergedNotes = [entry.notes, queueNote].filter(Boolean).join(' | ');
    await entry.update({
      status: 'skipped',
      assigned_to: null,
      started_at: null,
      completed_at: now,
      notes: mergedNotes,
    }, { transaction });
  }

  await ClinicHospitalTransfer.update(
    { transfer_status: 'cancelled' },
    {
      where: {
        visit_id: visit.id,
        transfer_status: { [Op.in]: OPEN_TRANSFER_STATUSES },
      },
      transaction,
    }
  );

  await visit.update({
    status: 'completed',
    current_department: null,
    current_queue_position: null,
    completed_at: now,
  }, { transaction });

  return true;
}

async function expireVisitEndOfClinicDay(visit, { transaction = null, now = new Date() } = {}) {
  if (!visit || visit.status !== 'in_progress') return false;
  if (!(await isClinicVisit(visit, transaction))) return false;
  if (await isClinicVisitHeldOpen(visit.id, transaction)) return false;
  if (!isVisitBeforeClinicDay(visit, now)) return false;

  return closeClinicVisitAndQueues(visit, {
    transaction,
    now,
    queueNote: END_OF_DAY_CLOSE_QUEUE_NOTE,
  });
}

async function expireClinicVisit(visit, { transaction = null, now = new Date() } = {}) {
  if (!visit || visit.status !== 'in_progress') return false;
  if (!(await isClinicVisit(visit, transaction))) return false;
  if (await isClinicVisitHeldOpen(visit.id, transaction)) return false;
  if (!isVisitPastClinicDeadline(visit, now)) return false;

  return closeClinicVisitAndQueues(visit, {
    transaction,
    now,
    queueNote: AUTO_CLOSE_QUEUE_NOTE,
  });
}

async function expireVisitsBeforeClinicDayAtFacility(
  facilityId,
  { transaction = null, now = new Date() } = {}
) {
  if (!facilityId) return 0;

  const facility = await Facility.findByPk(facilityId, { transaction });
  if (!isOutpatientDayBoundFacility(facility)) return 0;

  const staleVisits = await Visit.findAll({
    where: {
      facility_id: facilityId,
      status: 'in_progress',
    },
    transaction,
  });

  let expired = 0;
  for (const visit of staleVisits) {
    if (!isVisitBeforeClinicDay(visit, now)) continue;
    if (await expireVisitEndOfClinicDay(visit, { transaction, now })) expired += 1;
  }
  return expired;
}

async function expireVisitsBeforeClinicDayGlobally({ now = new Date() } = {}) {
  const sites = await Facility.findAll({
    where: { type: { [Op.in]: ['clinic', 'health_center'] } },
    attributes: ['id'],
  });
  if (!sites.length) return 0;

  const staleVisits = await Visit.findAll({
    where: {
      facility_id: { [Op.in]: sites.map((c) => c.id) },
      status: 'in_progress',
    },
  });

  let expired = 0;
  for (const visit of staleVisits) {
    if (!isVisitBeforeClinicDay(visit, now)) continue;
    if (await expireVisitEndOfClinicDay(visit, { now })) expired += 1;
  }
  return expired;
}

/**
 * Close active queue rows tied to visits from before today's clinic calendar day.
 */
async function closeStaleQueueEntriesBeforeClinicDay(
  facilityId,
  department,
  { transaction = null, now = new Date() } = {}
) {
  if (!facilityId || !department) return 0;

  const facility = await Facility.findByPk(facilityId, { transaction });
  if (!isOutpatientDayBoundFacility(facility)) return 0;

  const entries = await QueueEntry.findAll({
    where: {
      department,
      status: { [Op.in]: ACTIVE_QUEUE_STATUSES },
    },
    include: [
      {
        association: 'visit',
        where: { facility_id: facilityId },
        required: true,
      },
    ],
    transaction,
  });

  let closed = 0;
  for (const entry of entries) {
    if (!entry.visit || !isVisitBeforeClinicDay(entry.visit, now)) continue;
    const mergedNotes = [entry.notes, END_OF_DAY_CLOSE_QUEUE_NOTE].filter(Boolean).join(' | ');
    await entry.update({
      status: 'skipped',
      assigned_to: null,
      started_at: null,
      completed_at: now,
      notes: mergedNotes,
    }, { transaction });
    closed += 1;

    if (entry.visit.status === 'in_progress') {
      await expireVisitEndOfClinicDay(entry.visit, { transaction, now });
    }
  }
  return closed;
}

async function expireStaleClinicVisitsAtFacility(facilityId, { transaction = null, now = new Date() } = {}) {
  if (!facilityId) return 0;

  const facility = await Facility.findByPk(facilityId, { transaction });
  if (!isOutpatientDayBoundFacility(facility)) return 0;

  const cutoff = new Date(now.getTime() - CLINIC_VISIT_MAX_MS);
  const staleVisits = await Visit.findAll({
    where: {
      facility_id: facilityId,
      status: 'in_progress',
      created_at: { [Op.lt]: cutoff },
    },
    transaction,
  });

  let expired = 0;
  for (const visit of staleVisits) {
    if (await expireClinicVisit(visit, { transaction, now })) expired += 1;
  }
  return expired;
}

async function expireStaleClinicVisitsGlobally({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - CLINIC_VISIT_MAX_MS);
  const sites = await Facility.findAll({
    where: { type: { [Op.in]: ['clinic', 'health_center'] } },
    attributes: ['id'],
  });
  if (!sites.length) return 0;

  const staleVisits = await Visit.findAll({
    where: {
      facility_id: { [Op.in]: sites.map((c) => c.id) },
      status: 'in_progress',
      created_at: { [Op.lt]: cutoff },
    },
  });

  let expired = 0;
  for (const visit of staleVisits) {
    if (await expireClinicVisit(visit, { now })) expired += 1;
  }
  return expired;
}

async function assertClinicVisitNotExpired(visit, { autoExpire = true, now = new Date() } = {}) {
  if (!visit || visit.status !== 'in_progress') return visit;
  if (!(await isClinicVisit(visit))) return visit;

  if (await isClinicVisitHeldOpen(visit.id)) return visit;

  if (isVisitBeforeClinicDay(visit, now)) {
    if (autoExpire) {
      await expireVisitEndOfClinicDay(visit, { now });
    }
    const err = new Error(
      'This clinic visit ended at the close of clinic day. The patient must check in again at the front office.'
    );
    err.statusCode = 410;
    err.code = 'CLINIC_VISIT_END_OF_DAY';
    throw err;
  }

  if (!isVisitPastClinicDeadline(visit, now)) return visit;

  if (autoExpire) {
    await expireClinicVisit(visit, { now });
  }

  const err = new Error(
    'This clinic visit has ended — the 24-hour window from front office intake has expired. '
    + 'The patient must be registered again at the front office.'
  );
  err.statusCode = 410;
  err.code = 'CLINIC_VISIT_EXPIRED';
  throw err;
}

function startClinicVisitExpiryScheduler({ intervalMs = 15 * 60 * 1000 } = {}) {
  const run = async () => {
    try {
      const endOfDay = await expireVisitsBeforeClinicDayGlobally();
      const stale = await expireStaleClinicVisitsGlobally();
      if (endOfDay > 0) {
        console.log(`Clinic visit expiry: auto-closed ${endOfDay} visit(s) from before today`);
      }
      if (stale > 0) {
        console.log(`Clinic visit expiry: auto-closed ${stale} visit(s) past the 24-hour window`);
      }
    } catch (err) {
      console.error('Clinic visit expiry sweep error:', err.message);
    }
  };

  run();
  return setInterval(run, intervalMs);
}

module.exports = {
  visitIntakeAt,
  visitExpiresAt,
  isVisitPastClinicDeadline,
  isVisitBeforeClinicDay,
  visitNumberCalendarDate,
  clinicCalendarDateCompact,
  startOfClinicDay,
  getVisitExpiryInfo,
  isClinicVisitHeldOpen,
  expireClinicVisit,
  expireVisitEndOfClinicDay,
  expireVisitsBeforeClinicDayAtFacility,
  expireVisitsBeforeClinicDayGlobally,
  closeStaleQueueEntriesBeforeClinicDay,
  expireStaleClinicVisitsAtFacility,
  expireStaleClinicVisitsGlobally,
  assertClinicVisitNotExpired,
  startClinicVisitExpiryScheduler,
};
