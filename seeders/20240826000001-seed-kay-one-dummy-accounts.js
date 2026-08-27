'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { ROLES } = require('../config/roles');
const { deleteRefreshTokensForUserEmail } = require('../utils/seedHelpers');
const { KAY_ONE_FACILITY_NAME } = require('../constants/kayOneFacility');

const DUMMY_PASSWORD = 'Password123!';

const DUMMY_USERS = [
  {
    role: ROLES.FRONT_OFFICE,
    email: 'front_office@kayone.demo',
    firstName: 'Front',
    lastName: 'Office',
    employeeId: 'KAY-FO-001',
  },
  {
    role: ROLES.DOCTOR,
    email: 'doctor@kayone.demo',
    firstName: 'Demo',
    lastName: 'Doctor',
    employeeId: 'KAY-DOC-001',
  },
  {
    role: ROLES.SYSTEM_ADMIN,
    email: 'admin@kayone.demo',
    firstName: 'System',
    lastName: 'Admin',
    employeeId: 'KAY-ADMIN-001',
  },
];

module.exports = {
  async up(queryInterface) {
    const [facilityRows] = await queryInterface.sequelize.query(
      'SELECT id FROM facilities WHERE name = :name LIMIT 1',
      { replacements: { name: KAY_ONE_FACILITY_NAME } }
    );
    let facility = facilityRows[0];
    if (!facility?.id) {
      const [fallback] = await queryInterface.sequelize.query(
        'SELECT id FROM facilities ORDER BY created_at ASC LIMIT 1'
      );
      facility = fallback[0];
    }
    if (!facility?.id) {
      throw new Error(
        'seed-kay-one-dummy-accounts: no facility found. Run seed-kay-one-facility first.'
      );
    }

    const [roles] = await queryInterface.sequelize.query('SELECT id, name FROM roles');
    const passwordHash = await bcrypt.hash(DUMMY_PASSWORD, 10);
    const now = new Date();

    for (const spec of DUMMY_USERS) {
      const role = roles.find((r) => r.name === spec.role);
      if (!role?.id) {
        throw new Error(`seed-kay-one-dummy-accounts: role "${spec.role}" not found.`);
      }

      await deleteRefreshTokensForUserEmail(queryInterface, spec.email);
      await queryInterface.sequelize.query('DELETE FROM users WHERE email = :email', {
        replacements: { email: spec.email },
      });

      await queryInterface.bulkInsert('users', [
        {
          id: uuidv4(),
          facility_id: facility.id,
          role_id: role.id,
          employee_id: spec.employeeId,
          first_name: spec.firstName,
          last_name: spec.lastName,
          email: spec.email,
          password_hash: passwordHash,
          phone: '+26461000001',
          is_active: true,
          last_login: null,
          created_at: now,
        },
      ]);
    }

    console.log(
      'seed-kay-one-dummy-accounts: created front_office@kayone.demo, doctor@kayone.demo, admin@kayone.demo (Password123!)'
    );
  },

  async down(queryInterface) {
    for (const spec of DUMMY_USERS) {
      await deleteRefreshTokensForUserEmail(queryInterface, spec.email);
      await queryInterface.sequelize.query('DELETE FROM users WHERE email = :email', {
        replacements: { email: spec.email },
      });
    }
  },
};
