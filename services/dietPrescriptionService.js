'use strict';

/** Kay One stub — diet prescriptions not used. */
module.exports = {
  prescribeDiet: async () => {
    const err = new Error('Diet prescriptions are not available in Kay One Dental.');
    err.status = 400;
    throw err;
  },
};
