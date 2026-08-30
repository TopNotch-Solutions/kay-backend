const { success, error } = require('../utils/response');
const { getSupervisorMetrics } = require('../services/frontOfficeSupervisorMetricsService');
const { getMyRegistrations } = require('../services/frontOfficeService');
const { getClinicRoutingOptionsForFacility } = require('../services/clinicRoutingService');
const { sendConsentOtp, verifyConsentOtp } = require('../services/consentOtpService');
const {
  listFutureAppointmentsForFacility,
  cancelFollowUpAppointment,
  cancelFollowUpAppointmentsForDate,
} = require('../services/followUpAppointmentService');

function appointmentActorContext(req) {
  const actorName = [req.user.first_name, req.user.last_name].filter(Boolean).join(' ').trim()
    || req.user.email
    || null;
  return {
    actorId: req.user.id,
    actorName,
    actorRole: req.user.role?.name || 'front_office',
  };
}

exports.getSupervisorMetrics = async (req, res) => {
  try {
    const facilityId = req.user.facility_id;
    if (!facilityId) return error(res, 'Facility context required', 400);
    const metrics = await getSupervisorMetrics(facilityId);
    return success(res, metrics);
  } catch (err) {
    console.error('Front office supervisor metrics error:', err);
    return error(res, 'Failed to fetch supervisor metrics', 500);
  }
};

exports.getRoutingOptions = async (req, res) => {
  try {
    const facilityId = req.user?.facility_id;
    if (!facilityId) return error(res, 'Facility context required', 400);
    const options = await getClinicRoutingOptionsForFacility(facilityId);
    return success(res, options);
  } catch (err) {
    console.error('Front office routing options error:', err);
    return error(res, 'Failed to load routing options', 500);
  }
};

exports.getMyRegistrations = async (req, res) => {
  try {
    const facilityId = req.user.facility_id;
    if (!facilityId) return error(res, 'Facility context required', 400);
    const rows = await getMyRegistrations(req.user.id, facilityId);
    return success(res, { registrations: rows, count: rows.length });
  } catch (err) {
    console.error('Front office my registrations error:', err);
    return error(res, 'Failed to fetch today\'s registrations', 500);
  }
};

exports.sendConsentOtp = async (req, res) => {
  try {
    const result = await sendConsentOtp(req.body?.phone);
    return success(res, result, result.message);
  } catch (err) {
    console.error('Consent send OTP error:', err);
    return error(res, err.message || 'Failed to send OTP', err.statusCode || 500);
  }
};

exports.verifyConsentOtp = async (req, res) => {
  try {
    const result = verifyConsentOtp(req.body?.phone, req.body?.otp);
    return success(res, result, 'OTP verified — consent signature accepted');
  } catch (err) {
    console.error('Consent verify OTP error:', err);
    return error(res, err.message || 'Failed to verify OTP', err.statusCode || 500);
  }
};

exports.listAppointments = async (req, res) => {
  try {
    const facilityId = req.user.facility_id;
    if (!facilityId) return error(res, 'Facility context required', 400);
    const doctorId = req.query.doctor_id || null;
    const data = await listFutureAppointmentsForFacility(facilityId, { doctorId });
    return success(res, data);
  } catch (err) {
    console.error('Front office list appointments error:', err);
    return error(res, err.message || 'Failed to load appointments', 500);
  }
};

exports.cancelAppointment = async (req, res) => {
  try {
    const facilityId = req.user.facility_id;
    if (!facilityId) return error(res, 'Facility context required', 400);
    const {
      reason,
      reschedule,
      follow_up_date,
      follow_up_time,
    } = req.body || {};
    const actor = appointmentActorContext(req);
    const result = await cancelFollowUpAppointment({
      consultationId: req.params.consultationId,
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorRole: actor.actorRole,
      facilityId,
      reason,
      reschedule: Boolean(reschedule),
      follow_up_date,
      follow_up_time,
    });
    let message;
    if (result.rescheduled) {
      message = result.sms_sent
        ? 'Appointment rescheduled and SMS sent to the patient.'
        : 'Appointment rescheduled. Patient has no cell phone on file — SMS was not sent.';
    } else {
      message = result.sms_sent
        ? 'Appointment cancelled and SMS sent to the patient.'
        : 'Appointment cancelled. Patient has no cell phone on file — SMS was not sent.';
    }
    return success(res, result, message);
  } catch (err) {
    console.error('Front office cancel appointment error:', err);
    const status = err.status || 500;
    return error(res, err.message || 'Failed to update appointment', status);
  }
};

exports.cancelAppointmentsByDate = async (req, res) => {
  try {
    const facilityId = req.user.facility_id;
    if (!facilityId) return error(res, 'Facility context required', 400);
    const {
      date,
      reason,
      reschedule,
      reschedules,
      doctor_id: doctorId,
    } = req.body || {};
    const actor = appointmentActorContext(req);
    const result = await cancelFollowUpAppointmentsForDate({
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorRole: actor.actorRole,
      facilityId,
      doctorId: doctorId || null,
      date,
      reason,
      reschedule: Boolean(reschedule),
      reschedules,
    });

    const actionLabel = result.rescheduled ? 'Rescheduled' : 'Cancelled';
    const count = result.processed_count;
    let message;
    if (result.failures.length > 0) {
      message = `${actionLabel} ${count} of ${result.requested_count} appointments. ${result.sms_sent_count} SMS sent. ${result.failures.length} could not be updated.`;
    } else if (result.sms_sent_count === count) {
      message = `${actionLabel} ${count} appointment${count === 1 ? '' : 's'} and sent SMS to each patient.`;
    } else if (result.sms_sent_count > 0) {
      message = `${actionLabel} ${count} appointment${count === 1 ? '' : 's'}. SMS sent to ${result.sms_sent_count} patient${result.sms_sent_count === 1 ? '' : 's'}.`;
    } else {
      message = `${actionLabel} ${count} appointment${count === 1 ? '' : 's'}. No cell phones on file — SMS was not sent.`;
    }

    return success(res, result, message);
  } catch (err) {
    console.error('Front office cancel appointments by date error:', err);
    const status = err.status || 500;
    return error(res, err.message || 'Failed to update appointments', status);
  }
};
