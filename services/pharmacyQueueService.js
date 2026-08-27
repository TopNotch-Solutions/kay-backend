'use strict';

/** Kay One stub — pharmacy queue module not used; statuses still needed for pending-med flags. */
const OPEN_PRESCRIPTION_STATUSES = ['pending', 'partially_dispensed'];

async function enqueuePharmacy() {
  return null;
}

async function isAwaitingPharmacy() {
  return false;
}

module.exports = {
  OPEN_PRESCRIPTION_STATUSES,
  enqueuePharmacy,
  isAwaitingPharmacy,
};
