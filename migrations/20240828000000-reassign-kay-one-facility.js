'use strict';

const { KAY_ONE_FACILITY_NAME } = require('../constants/kayOneFacility');
const { NATIONAL_ADMIN_FACILITY_NAME } = require('../utils/nationalAdmin');

/**
 * Kay One Dental: all staff (including system admins) belong to Kay-One Dental,
 * not National Health Administration.
 */
module.exports = {
  async up(queryInterface) {
    const [[kayOne]] = await queryInterface.sequelize.query(
      'SELECT id FROM facilities WHERE name = :name LIMIT 1',
      { replacements: { name: KAY_ONE_FACILITY_NAME } }
    );
    const [[national]] = await queryInterface.sequelize.query(
      'SELECT id FROM facilities WHERE name = :name LIMIT 1',
      { replacements: { name: NATIONAL_ADMIN_FACILITY_NAME } }
    );

    if (!kayOne?.id || !national?.id || kayOne.id === national.id) return;

    await queryInterface.sequelize.query(
      'UPDATE users SET facility_id = :kayOneId WHERE facility_id = :nationalId',
      { replacements: { kayOneId: kayOne.id, nationalId: national.id } }
    );

    await queryInterface.sequelize.query(
      `UPDATE employee_facility_assignments
       SET facility_id = :kayOneId
       WHERE facility_id = :nationalId AND ended_at IS NULL`,
      { replacements: { kayOneId: kayOne.id, nationalId: national.id } }
    );
  },

  async down() {
    // Non-destructive — do not move users back to National Health Administration.
  },
};
