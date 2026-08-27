'use strict';

/** Kay One Dental — structured dental exam on consultations. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'consultations';
    const desc = await queryInterface.describeTable(table);
    if (!desc.dental_exam) {
      await queryInterface.addColumn(table, 'dental_exam', {
        type: Sequelize.JSON,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = 'consultations';
    const desc = await queryInterface.describeTable(table);
    if (desc.dental_exam) {
      await queryInterface.removeColumn(table, 'dental_exam');
    }
  },
};
