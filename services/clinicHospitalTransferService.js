'use strict';

/** Kay One stub — clinic→hospital transfers are not used. */
function serializeTransfer() {
  return null;
}

function applyClinicalTransferPlan() {
  const err = new Error('Hospital transfer is not available in Kay One Dental.');
  err.status = 400;
  throw err;
}

module.exports = {
  serializeTransfer,
  applyClinicalTransferPlan,
};
