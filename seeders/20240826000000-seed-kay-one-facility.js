'use strict';

const { v4: uuidv4 } = require('uuid');
const { KAY_ONE_FACILITY_NAME } = require('../constants/kayOneFacility');
const {
  FOUNDATION_CLINIC_DEPARTMENT_KEYS,
} = require('../config/clinicFacilityDepartments');

/**
 * Ensure the single Kay-One Dental clinic facility exists (idempotent).
 */
module.exports = {
  async up(queryInterface) {
    const [[existing]] = await queryInterface.sequelize.query(
      'SELECT id FROM facilities WHERE name = :name LIMIT 1',
      { replacements: { name: KAY_ONE_FACILITY_NAME } }
    );

    let facilityId = existing?.id;
    const now = new Date();

    if (!facilityId) {
      facilityId = uuidv4();
      await queryInterface.bulkInsert('facilities', [
        {
          id: facilityId,
          name: KAY_ONE_FACILITY_NAME,
          type: 'clinic',
          province: 'Khomas',
          district: 'Windhoek',
          address: 'Kay-One Dental Clinic',
          phone: '+26461000000',
          created_at: now,
        },
      ]);
      console.log(`seed-kay-one-facility: created ${KAY_ONE_FACILITY_NAME}`);
    } else {
      await queryInterface.sequelize.query(
        `UPDATE facilities
         SET type = 'clinic', name = :name
         WHERE id = :id`,
        { replacements: { name: KAY_ONE_FACILITY_NAME, id: facilityId } }
      );
      console.log(`seed-kay-one-facility: ensured ${KAY_ONE_FACILITY_NAME}`);
    }

    const [existingDepts] = await queryInterface.sequelize.query(
      'SELECT department_key FROM facility_departments WHERE facility_id = :id',
      { replacements: { id: facilityId } }
    );
    const have = new Set(existingDepts.map((d) => d.department_key));

    for (const key of FOUNDATION_CLINIC_DEPARTMENT_KEYS) {
      if (have.has(key)) continue;
      await queryInterface.bulkInsert('facility_departments', [
        {
          id: uuidv4(),
          facility_id: facilityId,
          department_key: key,
          is_active: true,
          created_at: now,
        },
      ]);
    }
  },

  async down(queryInterface) {
    const [[row]] = await queryInterface.sequelize.query(
      'SELECT id FROM facilities WHERE name = :name LIMIT 1',
      { replacements: { name: KAY_ONE_FACILITY_NAME } }
    );
    if (!row?.id) return;
    await queryInterface.sequelize.query(
      'DELETE FROM facility_departments WHERE facility_id = :id',
      { replacements: { id: row.id } }
    );
    await queryInterface.sequelize.query(
      'DELETE FROM facilities WHERE id = :id',
      { replacements: { id: row.id } }
    );
  },
};
