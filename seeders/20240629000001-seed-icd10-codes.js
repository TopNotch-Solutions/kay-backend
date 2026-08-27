'use strict';

const { v4: uuidv4 } = require('uuid');
const { ICD10_CODES } = require('../constants/icd10Seed');

module.exports = {
  async up(queryInterface) {
    const [existingRows] = await queryInterface.sequelize.query(
      'SELECT icd10_code FROM icd10_codes'
    );
    const existing = new Set(
      (existingRows || []).map((r) => String(r.icd10_code || '').toUpperCase())
    );

    const now = new Date();
    const rows = ICD10_CODES
      .filter((row) => !existing.has(String(row.code).toUpperCase()))
      .map((row) => ({
        id: uuidv4(),
        icd10_code: row.code,
        description: row.description,
        is_active: true,
        created_at: now,
        updated_at: now,
      }));

    if (!rows.length) {
      console.log('seed-icd10-codes: all catalog codes already present, skipping.');
      return;
    }

    await queryInterface.bulkInsert('icd10_codes', rows);
    console.log(`seed-icd10-codes: inserted ${rows.length} ICD-10 codes.`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('icd10_codes', {});
  },
};
