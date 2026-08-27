'use strict';

const { sequelize } = require('../models');

/**
 * Ensure user_reports exists even when migrations never completed
 * (common on Kay One deploys with truncated role migrations).
 * Idempotent — safe on every boot.
 */
async function ensureUserReportsSchema() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS user_reports (
      id CHAR(36) NOT NULL PRIMARY KEY,
      reported_by CHAR(36) NOT NULL,
      issue_type ENUM('enquiry','issue','improvement') NOT NULL,
      description VARCHAR(360) NOT NULL,
      image_path VARCHAR(500) NULL,
      status ENUM('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
      admin_response TEXT NULL,
      responded_by CHAR(36) NULL,
      responded_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY user_reports_reported_by (reported_by),
      KEY user_reports_status (status),
      KEY user_reports_created_at (created_at),
      CONSTRAINT user_reports_reported_by_fk FOREIGN KEY (reported_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT user_reports_responded_by_fk FOREIGN KEY (responded_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL
    )
  `);

  const actions = ['create', 'read', 'update'];
  for (const action of actions) {
    await sequelize.query(
      `INSERT INTO permissions (resource, action)
       SELECT 'user_report', :action FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM permissions WHERE resource = 'user_report' AND action = :action
       )`,
      { replacements: { action } }
    );
  }
}

module.exports = { ensureUserReportsSchema };
