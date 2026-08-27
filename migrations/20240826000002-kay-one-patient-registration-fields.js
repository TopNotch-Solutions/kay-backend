'use strict';

/** Kay One Dental — structured patient registration fields. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'patients';
    const desc = await queryInterface.describeTable(table);

    const addIfMissing = async (column, definition) => {
      if (!desc[column]) {
        await queryInterface.addColumn(table, column, definition);
      }
    };

    await addIfMissing('telephone', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
    await addIfMissing('cell_phone', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
    await addIfMissing('postal_address', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await addIfMissing('email', {
      type: Sequelize.STRING(150),
      allowNull: true,
    });
    await addIfMissing('medical_aid_name', {
      type: Sequelize.STRING(150),
      allowNull: true,
    });
    await addIfMissing('membership_number', {
      type: Sequelize.STRING(80),
      allowNull: true,
    });
    await addIfMissing('medical_history', {
      type: Sequelize.JSON,
      allowNull: true,
    });
    await addIfMissing('consent', {
      type: Sequelize.JSON,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const table = 'patients';
    const desc = await queryInterface.describeTable(table);
    const columns = [
      'telephone',
      'cell_phone',
      'postal_address',
      'email',
      'medical_aid_name',
      'membership_number',
      'medical_history',
      'consent',
    ];
    for (const column of columns) {
      if (desc[column]) {
        await queryInterface.removeColumn(table, column);
      }
    }
  },
};
