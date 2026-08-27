'use strict';

/**
 * Kay One stub — hospital visit expiry is unused.
 * Export no-ops so shared visit helpers (patient search) do not crash.
 */

function isVisitPastHospitalDeadline() {
  return false;
}

async function expireHospitalVisit() {
  return null;
}

function startHospitalVisitExpiryScheduler() {
  return null;
}

async function assertHospitalVisitNotExpired() {
  return true;
}

module.exports = {
  isVisitPastHospitalDeadline,
  expireHospitalVisit,
  startHospitalVisitExpiryScheduler,
  assertHospitalVisitNotExpired,
};
