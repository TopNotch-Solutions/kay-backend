'use strict';

const { v4: uuidv4 } = require('uuid');
const { Facility } = require('../models');
const { KAY_ONE_FACILITY_NAME } = require('../constants/kayOneFacility');
const { NATIONAL_ADMIN_FACILITY_NAME } = require('./nationalAdmin');

/**
 * Resolve the single Kay-One Dental operational facility.
 * Creates it if missing (e.g. DB seeded before Kay-One migration).
 */
async function resolveKayOneFacility(transaction) {
  let facility = await Facility.findOne({
    where: { name: KAY_ONE_FACILITY_NAME },
    transaction,
  });

  if (!facility) {
    facility = await Facility.findOne({
      where: { type: 'clinic' },
      order: [['created_at', 'ASC']],
      transaction,
    });
    if (facility) {
      await facility.update({
        name: KAY_ONE_FACILITY_NAME,
        type: 'clinic',
      }, { transaction });
    }
  }

  if (!facility) {
    facility = await Facility.create({
      id: uuidv4(),
      name: KAY_ONE_FACILITY_NAME,
      type: 'clinic',
      province: 'Khomas',
      district: 'Windhoek',
      address: 'Kay-One Dental Clinic',
      phone: null,
    }, { transaction });
  }

  return facility;
}

async function getKayOneFacilityId(transaction) {
  const facility = await resolveKayOneFacility(transaction);
  return facility.id;
}

function displayKayOneFacilityName(name) {
  if (!name || name === NATIONAL_ADMIN_FACILITY_NAME) return KAY_ONE_FACILITY_NAME;
  return name;
}

module.exports = {
  resolveKayOneFacility,
  getKayOneFacilityId,
  displayKayOneFacilityName,
  KAY_ONE_FACILITY_NAME,
};
