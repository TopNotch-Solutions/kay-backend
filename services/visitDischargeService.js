'use strict';

/** Kay One stub — hospital discharge workflow not used. */
async function finalizeOutpatientDischarge() {
  const err = new Error('Hospital discharge workflow is not available in Kay One Dental.');
  err.status = 400;
  throw err;
}

module.exports = {
  finalizeOutpatientDischarge,
};
