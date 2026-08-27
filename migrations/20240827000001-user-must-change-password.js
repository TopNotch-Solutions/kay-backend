'use strict';

/** Force password change on first login after admin-provisioned accounts. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('users');
    if (!desc.must_change_password) {
      await queryInterface.addColumn('users', 'must_change_password', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable('users');
    if (desc.must_change_password) {
      await queryInterface.removeColumn('users', 'must_change_password');
    }
  },
};
