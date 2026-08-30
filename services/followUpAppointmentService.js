'use strict';

const { Op } = require('sequelize');
const callExternalApi = require('../utils/connectSMS');
const { Consultation, Visit, Patient, FollowUpReminder, User } = require('../models');
const {
  todayInClinicTz,
  parseFollowUpAt,
  formatFollowUpDisplay,
  assertFollowUpIsFuture,
  syncFollowUpReminders,
  patientPhone,
} = require('./followUpReminderService');

function formatActorName(user) {
  if (!user) return 'Unknown';
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name || user.email || 'Unknown';
}

async function resolveActorName(doctorId, actorName) {
  if (actorName) return actorName;
  const user = await User.findByPk(doctorId, {
    attributes: ['id', 'first_name', 'last_name', 'email'],
  });
  return formatActorName(user);
}

function appendFollowUpHistory(followUp, entry) {
  const history = Array.isArray(followUp?.history) ? [...followUp.history] : [];
  history.push(entry);
  return history;
}

function isFollowUpCancelled(followUp) {
  return String(followUp?.status || '').toLowerCase() === 'cancelled';
}

function isFutureFollowUp(followUp, now = new Date()) {
  if (!followUp || typeof followUp !== 'object' || isFollowUpCancelled(followUp)) return false;
  const date = String(followUp.date || '').trim();
  if (!date) return false;
  const today = todayInClinicTz(now);
  if (date > today) return true;
  if (date < today) return false;
  const at = parseFollowUpAt(date, followUp.time);
  if (!at) return false;
  return at.getTime() > now.getTime();
}

function serializeAppointmentRow(consultation) {
  const dentalExam = consultation.dental_exam || {};
  const followUp = dentalExam.follow_up || {};
  const visit = consultation.visit;
  const patient = visit?.patient;
  const doctor = consultation.doctor;
  const at = parseFollowUpAt(followUp.date, followUp.time);
  const doctorName = doctor
    ? [doctor.first_name, doctor.last_name].filter(Boolean).join(' ').trim()
    : '';

  return {
    consultation_id: consultation.id,
    visit_id: visit?.id || consultation.visit_id,
    visit_number: visit?.visit_number || null,
    doctor: doctor
      ? {
          id: doctor.id,
          first_name: doctor.first_name,
          last_name: doctor.last_name,
          name: doctorName || null,
        }
      : null,
    patient: patient
      ? {
          id: patient.id,
          first_name: patient.first_name,
          last_name: patient.last_name,
          patient_number: patient.patient_number,
          phone: patient.cell_phone || patient.phone || patient.telephone || null,
        }
      : null,
    follow_up: {
      date: followUp.date,
      time: followUp.time || null,
      notes: followUp.notes || null,
      status: followUp.status || 'scheduled',
      at: at ? at.toISOString() : null,
      display: at ? formatFollowUpDisplay(at) : followUp.date,
      cancelled_at: followUp.cancelled_at || null,
      cancelled_by: followUp.cancelled_by || null,
      cancelled_by_name: followUp.cancelled_by_name || null,
      cancellation_reason: followUp.cancellation_reason || null,
      rescheduled_at: followUp.rescheduled_at || null,
      rescheduled_by: followUp.rescheduled_by || null,
      rescheduled_by_name: followUp.rescheduled_by_name || null,
      reschedule_reason: followUp.reschedule_reason || null,
      previous_date: followUp.previous_date || null,
      previous_time: followUp.previous_time || null,
      history: Array.isArray(followUp.history) ? followUp.history : [],
    },
    diagnosis: consultation.diagnosis || null,
    consultation_created_at: consultation.created_at,
  };
}

async function listFutureAppointmentsForDoctor(doctorId, { now = new Date() } = {}) {
  const consultations = await Consultation.findAll({
    where: {
      doctor_id: doctorId,
      dental_exam: { [Op.ne]: null },
    },
    include: [
      {
        model: Visit,
        as: 'visit',
        include: [{ model: Patient, as: 'patient' }],
      },
    ],
    order: [['created_at', 'DESC']],
  });

  const rows = consultations
    .filter((row) => {
      const followUp = row.dental_exam?.follow_up;
      return isFutureFollowUp(followUp, now);
    })
    .map(serializeAppointmentRow)
    .sort((a, b) => {
      const ta = a.follow_up?.at ? new Date(a.follow_up.at).getTime() : 0;
      const tb = b.follow_up?.at ? new Date(b.follow_up.at).getTime() : 0;
      return ta - tb;
    });

  return { appointments: rows, count: rows.length };
}

async function listFutureAppointmentsForFacility(facilityId, { doctorId, now = new Date() } = {}) {
  if (!facilityId) {
    const err = new Error('Facility context is required.');
    err.status = 400;
    throw err;
  }

  const consultationWhere = {
    dental_exam: { [Op.ne]: null },
  };
  if (doctorId) consultationWhere.doctor_id = doctorId;

  const consultations = await Consultation.findAll({
    where: consultationWhere,
    include: [
      {
        model: Visit,
        as: 'visit',
        where: { facility_id: facilityId },
        required: true,
        include: [{ model: Patient, as: 'patient' }],
      },
      {
        model: User,
        as: 'doctor',
        attributes: ['id', 'first_name', 'last_name'],
      },
    ],
    order: [['created_at', 'DESC']],
  });

  const rows = consultations
    .filter((row) => {
      const followUp = row.dental_exam?.follow_up;
      return isFutureFollowUp(followUp, now);
    })
    .map(serializeAppointmentRow)
    .sort((a, b) => {
      const ta = a.follow_up?.at ? new Date(a.follow_up.at).getTime() : 0;
      const tb = b.follow_up?.at ? new Date(b.follow_up.at).getTime() : 0;
      return ta - tb;
    });

  return { appointments: rows, count: rows.length };
}

async function patientHasScheduledFollowUp(patientId, facilityId, { now = new Date() } = {}) {
  if (!patientId || !facilityId) return false;

  const consultations = await Consultation.findAll({
    where: {
      dental_exam: { [Op.ne]: null },
    },
    include: [
      {
        model: Visit,
        as: 'visit',
        where: {
          facility_id: facilityId,
          patient_id: patientId,
        },
        required: true,
        attributes: ['id'],
      },
    ],
    attributes: ['id', 'dental_exam'],
  });

  return consultations.some((row) => isFutureFollowUp(row.dental_exam?.follow_up, now));
}

async function scheduledFollowUpFlagsForPatients(patientIds, facilityId, { now = new Date() } = {}) {
  const flags = new Map();
  const ids = [...new Set((patientIds || []).filter(Boolean))];
  ids.forEach((id) => flags.set(id, false));
  if (!ids.length || !facilityId) return flags;

  const consultations = await Consultation.findAll({
    where: {
      dental_exam: { [Op.ne]: null },
    },
    include: [
      {
        model: Visit,
        as: 'visit',
        where: {
          facility_id: facilityId,
          patient_id: { [Op.in]: ids },
        },
        required: true,
        attributes: ['id', 'patient_id'],
      },
    ],
    attributes: ['id', 'dental_exam'],
  });

  for (const row of consultations) {
    const patientId = row.visit?.patient_id;
    if (!patientId || !isFutureFollowUp(row.dental_exam?.follow_up, now)) continue;
    flags.set(patientId, true);
  }

  return flags;
}

function buildCancellationMessage(followUpAt, reason) {
  const when = formatFollowUpDisplay(followUpAt);
  const reasonText = String(reason || '').trim().slice(0, 500);
  return `Kay-One Dental: Your follow-up appointment on ${when} has been cancelled. Reason: ${reasonText}. Please contact the clinic to reschedule.`;
}

function buildRescheduleMessage(previousAt, newAt, reason) {
  const fromWhen = formatFollowUpDisplay(previousAt);
  const toWhen = formatFollowUpDisplay(newAt);
  const reasonText = String(reason || '').trim().slice(0, 500);
  return `Kay-One Dental: Your follow-up appointment has been moved from ${fromWhen} to ${toWhen}. Reason: ${reasonText}.`;
}

async function cancelFollowUpAppointment({
  consultationId,
  actorId,
  doctorId,
  reason,
  reschedule = false,
  follow_up_date,
  follow_up_time,
  actorName,
  actorRole = null,
  requireDoctorOwnership = false,
  facilityId = null,
  now = new Date(),
}) {
  const performedById = actorId || doctorId;
  if (!performedById) {
    const err = new Error('Actor context is required.');
    err.status = 400;
    throw err;
  }
  const reasonText = String(reason || '').trim();
  if (!reasonText) {
    const err = new Error('Cancellation reason is required.');
    err.status = 400;
    throw err;
  }
  if (reasonText.length > 500) {
    const err = new Error('Cancellation reason must be 500 characters or fewer.');
    err.status = 400;
    throw err;
  }

  const consultation = await Consultation.findByPk(consultationId, {
    include: [
      {
        model: Visit,
        as: 'visit',
        include: [{ model: Patient, as: 'patient' }],
      },
    ],
  });

  if (!consultation) {
    const err = new Error('Consultation not found.');
    err.status = 404;
    throw err;
  }
  if (requireDoctorOwnership && consultation.doctor_id !== performedById) {
    const err = new Error('You can only cancel appointments from your own consultations.');
    err.status = 403;
    throw err;
  }
  if (facilityId && consultation.visit?.facility_id !== facilityId) {
    const err = new Error('This appointment does not belong to your facility.');
    err.status = 403;
    throw err;
  }

  const dentalExam = consultation.dental_exam || {};
  const followUp = dentalExam.follow_up;
  if (!followUp || !followUp.date) {
    const err = new Error('This consultation has no scheduled follow-up appointment.');
    err.status = 400;
    throw err;
  }
  if (isFollowUpCancelled(followUp)) {
    const err = new Error('This appointment has already been cancelled.');
    err.status = 409;
    throw err;
  }
  if (!isFutureFollowUp(followUp, now)) {
    const err = new Error('Only future appointments can be cancelled.');
    err.status = 400;
    throw err;
  }

  const followUpAt = parseFollowUpAt(followUp.date, followUp.time);
  const visit = consultation.visit;
  const patient = visit?.patient;
  const phone = patientPhone(patient);
  const performedByName = await resolveActorName(performedById, actorName);
  const historyActorRole = actorRole || (requireDoctorOwnership ? 'doctor' : null);

  if (reschedule) {
    const validated = assertFollowUpIsFuture({
      date: follow_up_date,
      time: follow_up_time || followUp.time,
      notes: followUp.notes,
    }, now);

    const newAt = parseFollowUpAt(validated.date, validated.time);
    const historyEntry = {
      action: 'rescheduled',
      at: now.toISOString(),
      by: performedById,
      by_name: performedByName,
      by_role: historyActorRole,
      reason: reasonText,
      from_date: followUp.date,
      from_time: followUp.time || null,
      to_date: validated.date,
      to_time: validated.time,
    };
    const updatedDentalExam = {
      ...dentalExam,
      follow_up: {
        date: validated.date,
        time: validated.time,
        notes: validated.notes,
        status: 'scheduled',
        rescheduled_at: now.toISOString(),
        rescheduled_by: performedById,
        rescheduled_by_name: performedByName,
        rescheduled_by_role: historyActorRole,
        reschedule_reason: reasonText,
        previous_date: followUp.date,
        previous_time: followUp.time || null,
        history: appendFollowUpHistory(followUp, historyEntry),
      },
    };

    await consultation.update({ dental_exam: updatedDentalExam });

    await syncFollowUpReminders({
      consultation: { ...consultation.toJSON(), dental_exam: updatedDentalExam },
      visit,
      patient,
      now,
    });

    let sms_sent = false;
    if (phone && followUpAt && newAt) {
      const message = buildRescheduleMessage(followUpAt, newAt, reasonText);
      await callExternalApi(phone, message);
      sms_sent = true;
    }

    return {
      consultation_id: consultation.id,
      rescheduled: true,
      sms_sent,
      appointment: serializeAppointmentRow({
        ...consultation.toJSON(),
        dental_exam: updatedDentalExam,
        visit,
      }),
    };
  }

  const historyEntry = {
    action: 'cancelled',
    at: now.toISOString(),
    by: performedById,
    by_name: performedByName,
    by_role: historyActorRole,
    reason: reasonText,
    from_date: followUp.date,
    from_time: followUp.time || null,
  };
  const updatedDentalExam = {
    ...dentalExam,
    follow_up: {
      ...followUp,
      status: 'cancelled',
      cancellation_reason: reasonText,
      cancelled_at: now.toISOString(),
      cancelled_by: performedById,
      cancelled_by_name: performedByName,
      cancelled_by_role: historyActorRole,
      history: appendFollowUpHistory(followUp, historyEntry),
    },
  };

  await consultation.update({ dental_exam: updatedDentalExam });

  await FollowUpReminder.update(
    { status: 'cancelled' },
    {
      where: {
        consultation_id: consultation.id,
        status: 'pending',
      },
    }
  );

  let sms_sent = false;
  if (phone) {
    const message = buildCancellationMessage(followUpAt, reasonText);
    await callExternalApi(phone, message);
    sms_sent = true;
  }

  return {
    consultation_id: consultation.id,
    rescheduled: false,
    sms_sent,
    appointment: serializeAppointmentRow({
      ...consultation.toJSON(),
      dental_exam: updatedDentalExam,
    }),
  };
}

async function cancelFollowUpAppointmentsForDate({
  actorId,
  doctorId,
  facilityId,
  date,
  reason,
  reschedule = false,
  reschedules = [],
  actorName,
  actorRole = null,
  requireDoctorOwnership = false,
  now = new Date(),
}) {
  const performedById = actorId || doctorId;
  if (!performedById) {
    const err = new Error('Actor context is required.');
    err.status = 400;
    throw err;
  }

  const dateStr = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const err = new Error('A valid appointment date (YYYY-MM-DD) is required.');
    err.status = 400;
    throw err;
  }

  const { appointments } = facilityId
    ? await listFutureAppointmentsForFacility(facilityId, { doctorId, now })
    : await listFutureAppointmentsForDoctor(doctorId, { now });
  const targets = appointments.filter((row) => row.follow_up?.date === dateStr);

  if (targets.length === 0) {
    const err = new Error('No upcoming appointments found for that date.');
    err.status = 404;
    throw err;
  }

  const rescheduleByConsultation = new Map();
  if (reschedule) {
    if (!Array.isArray(reschedules) || reschedules.length === 0) {
      const err = new Error('Reschedule details are required for each appointment.');
      err.status = 400;
      throw err;
    }
    for (const entry of reschedules) {
      const consultationId = String(entry?.consultation_id || '').trim();
      const newDate = String(entry?.follow_up_date || '').trim();
      const newTime = entry?.follow_up_time != null && String(entry.follow_up_time).trim() !== ''
        ? String(entry.follow_up_time).trim()
        : null;
      if (!consultationId) {
        const err = new Error('Each reschedule entry must include a consultation_id.');
        err.status = 400;
        throw err;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        const err = new Error('Each reschedule entry must include a valid follow-up date (YYYY-MM-DD).');
        err.status = 400;
        throw err;
      }
      if (!newTime) {
        const err = new Error('Each reschedule entry must include a follow-up time.');
        err.status = 400;
        throw err;
      }
      try {
        assertFollowUpIsFuture({ date: newDate, time: newTime }, now);
      } catch (validationErr) {
        validationErr.status = validationErr.status || 400;
        throw validationErr;
      }
      rescheduleByConsultation.set(consultationId, {
        follow_up_date: newDate,
        follow_up_time: newTime,
      });
    }

    const missing = targets.filter((row) => !rescheduleByConsultation.has(String(row.consultation_id)));
    if (missing.length > 0) {
      const err = new Error('Reschedule date and time are required for every appointment on this day.');
      err.status = 400;
      throw err;
    }
  }

  const results = [];
  const failures = [];
  const performedByName = await resolveActorName(performedById, actorName);

  for (const row of targets) {
    const consultationId = String(row.consultation_id);
    const rescheduleEntry = rescheduleByConsultation.get(consultationId);
    try {
      const result = await cancelFollowUpAppointment({
        consultationId: row.consultation_id,
        actorId: performedById,
        reason,
        reschedule: Boolean(reschedule),
        follow_up_date: reschedule ? rescheduleEntry.follow_up_date : undefined,
        follow_up_time: reschedule ? rescheduleEntry.follow_up_time : undefined,
        actorName: performedByName,
        actorRole,
        requireDoctorOwnership,
        facilityId: facilityId || null,
        now,
      });
      results.push(result);
    } catch (err) {
      failures.push({
        consultation_id: row.consultation_id,
        message: err.message || (reschedule ? 'Reschedule failed.' : 'Cancellation failed.'),
      });
    }
  }

  const sms_sent_count = results.filter((r) => r.sms_sent).length;
  const rescheduled_count = results.filter((r) => r.rescheduled).length;
  const cancelled_count = results.length - rescheduled_count;

  return {
    date: dateStr,
    rescheduled: Boolean(reschedule),
    requested_count: targets.length,
    processed_count: results.length,
    rescheduled_count,
    cancelled_count,
    sms_sent_count,
    failures,
    consultation_ids: results.map((r) => r.consultation_id),
  };
}

module.exports = {
  listFutureAppointmentsForDoctor,
  listFutureAppointmentsForFacility,
  cancelFollowUpAppointment,
  cancelFollowUpAppointmentsForDate,
  patientHasScheduledFollowUp,
  scheduledFollowUpFlagsForPatients,
  isFutureFollowUp,
  isFollowUpCancelled,
};
