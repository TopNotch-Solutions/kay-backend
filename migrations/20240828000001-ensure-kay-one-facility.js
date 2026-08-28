'use strict';

const { v4: uuidv4 } = require('uuid');
const { KAY_ONE_FACILITY_NAME } = require('../constants/kayOneFacility');

/** Ensure Kay-One Dental exists for deployments that never ran seeders. */
module.exports = {
  async up(queryInterface) {
    const [[existing]] = await queryInterface.sequelize.query(
      'SELECT id FROM facilities WHERE name = :name LIMIT 1',
      { replacements: { name: KAY_ONE_FACILITY_NAME } }
    );

    if (existing?.id) return;

    const now = new Date();
    await queryInterface.bulkInsert('facilities', [{
      id: uuidv4(),
      name: KAY_ONE_FACILITY_NAME,
      type: 'clinic',
      province: 'Khomas',
      district: 'Windhoek',
      address: 'Kay-One Dental Clinic',
      phone: null,
      created_at: now,
    }]);
  },

  async down() {
    // Keep facility — non-destructive rollback.
  },
};
