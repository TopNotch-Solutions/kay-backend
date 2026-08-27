'use strict';

/** Kay One doctor queue department (matches facility department queue_department). */
const CLINIC_DOCTOR_DEPARTMENT = 'doctor';

/** Completing consultation is the only disposition — no pharmacy / booking / emergency. */
const CLINIC_DISPOSITIONS = [
  { value: 'complete', label: 'Complete consultation' },
];

const DISPOSITION_VALUE_SET = new Set(CLINIC_DISPOSITIONS.map((d) => d.value));

function isValidDisposition(value) {
  return DISPOSITION_VALUE_SET.has(value);
}

function dispositionLabel(value) {
  return CLINIC_DISPOSITIONS.find((d) => d.value === value)?.label || value;
}

function validateDiagnosis(diagnosis) {
  if (!diagnosis || !String(diagnosis).trim()) {
    return 'Diagnosis is required before disposition.';
  }
  return null;
}

module.exports = {
  CLINIC_DOCTOR_DEPARTMENT,
  CLINIC_DISPOSITIONS,
  isValidDisposition,
  dispositionLabel,
  validateDiagnosis,
};
