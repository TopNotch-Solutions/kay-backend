'use strict';

const { Op } = require('sequelize');
const callExternalApi = require('../utils/connectSMS');
const { Consultation, Visit, Patient, FollowUpReminder } = require('../models');
const {
  todayInClinicTz,
  parseFollowUpAt,
  formatFollowUpDisplay,
  assertFollowUpIsFuture,
  syncFollowUpReminders,
  patientPhone,
} = require('./followUpReminderService');

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
  const at = parseFollowUpAt(followUp.date, followUp.time);

  return {
    consultation_id: consultation.id,
    visit_id: visit?.id || consultation.visit_id,
    visit_number: visit?.visit_number || null,
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
  doctorId,
  reason,
  reschedule = false,
  follow_up_date,
  follow_up_time,
  now = new Date(),
}) {
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
  if (consultation.doctor_id !== doctorId) {
    const err = new Error('You can only cancel appointments from your own consultations.');
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

  if (reschedule) {
    const validated = assertFollowUpIsFuture({
      date: follow_up_date,
      time: follow_up_time || followUp.time,
      notes: followUp.notes,
    }, now);

    const newAt = parseFollowUpAt(validated.date, validated.time);
    const updatedDentalExam = {
      ...dentalExam,
      follow_up: {
        date: validated.date,
        time: validated.time,
        notes: validated.notes,
        status: 'scheduled',
        rescheduled_at: now.toISOString(),
        rescheduled_by: doctorId,
        reschedule_reason: reasonText,
        previous_date: followUp.date,
        previous_time: followUp.time || null,
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

  const updatedDentalExam = {
    ...dentalExam,
    follow_up: {
      ...followUp,
      status: 'cancelled',
      cancellation_reason: reasonText,
      cancelled_at: now.toISOString(),
      cancelled_by: doctorId,
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

module.exports = {
  listFutureAppointmentsForDoctor,
  cancelFollowUpAppointment,
  isFutureFollowUp,
  isFollowUpCancelled,
};
