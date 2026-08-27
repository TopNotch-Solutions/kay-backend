'use strict';

/** Kay One — scheduled SMS reminders for dental follow-ups. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t).toLowerCase());
    if (normalized.includes('follow_up_reminders')) return;

    await queryInterface.createTable('follow_up_reminders', {
      id: {
        type: Sequelize.CHAR(36),
        primaryKey: true,
        allowNull: false,
      },
      consultation_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: 'consultations', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      visit_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: 'visits', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      patient_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: 'patients', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      reminder_type: {
        type: Sequelize.ENUM('day_before', 'three_hours_before'),
        allowNull: false,
      },
      follow_up_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      scheduled_for: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('pending', 'sent', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('follow_up_reminders', ['consultation_id', 'reminder_type'], {
      unique: true,
      name: 'follow_up_reminders_consultation_type_uq',
    });
    await queryInterface.addIndex('follow_up_reminders', ['status', 'scheduled_for'], {
      name: 'follow_up_reminders_status_scheduled_idx',
    });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t).toLowerCase());
    if (!normalized.includes('follow_up_reminders')) return;
    await queryInterface.dropTable('follow_up_reminders');
  },
};
