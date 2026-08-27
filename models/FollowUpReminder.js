'use strict';

module.exports = (sequelize, DataTypes) => {
  const FollowUpReminder = sequelize.define('FollowUpReminder', {
    id: { type: DataTypes.CHAR(36), primaryKey: true },
    consultation_id: { type: DataTypes.CHAR(36), allowNull: false },
    visit_id: { type: DataTypes.CHAR(36), allowNull: false },
    patient_id: { type: DataTypes.CHAR(36), allowNull: false },
    phone: { type: DataTypes.STRING(20), allowNull: false },
    reminder_type: {
      type: DataTypes.ENUM('day_before', 'three_hours_before'),
      allowNull: false,
    },
    follow_up_at: { type: DataTypes.DATE, allowNull: false },
    scheduled_for: { type: DataTypes.DATE, allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    message: { type: DataTypes.TEXT },
    sent_at: { type: DataTypes.DATE },
    last_error: { type: DataTypes.TEXT },
  }, {
    tableName: 'follow_up_reminders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  FollowUpReminder.associate = (models) => {
    FollowUpReminder.belongsTo(models.Consultation, { foreignKey: 'consultation_id', as: 'consultation' });
    FollowUpReminder.belongsTo(models.Visit, { foreignKey: 'visit_id', as: 'visit' });
    FollowUpReminder.belongsTo(models.Patient, { foreignKey: 'patient_id', as: 'patient' });
  };

  return FollowUpReminder;
};
