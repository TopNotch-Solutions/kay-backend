'use strict';

const { ROLES } = require('./roles');
const { AUTHORIZED_CLINIC_ROLES } = require('./clinicRoles');

/**
 * Kay One Dental — Front Office + Doctor only.
 */
const CLINIC_DEPARTMENT_DEFINITIONS = [
  { key: ROLES.FRONT_OFFICE, label: 'Front Office', queue_department: null, activity_mode: 'intake' },
  {
    key: ROLES.DOCTOR,
    label: 'Doctor',
    queue_department: 'doctor',
    activity_mode: 'queue',
    front_office_route: { value: 'doctor', label: 'Doctor' },
  },
];

const DEPARTMENT_BY_KEY = Object.fromEntries(
  CLINIC_DEPARTMENT_DEFINITIONS.map((d) => [d.key, d])
);

const VALID_DEPARTMENT_KEYS = new Set(CLINIC_DEPARTMENT_DEFINITIONS.map((d) => d.key));

const FOUNDATION_CLINIC_DEPARTMENT_KEYS = [ROLES.FRONT_OFFICE, ROLES.DOCTOR];

/** @deprecated use FOUNDATION_CLINIC_DEPARTMENT_KEYS */
const MINIMAL_CLINIC_TEMPLATE_KEYS = FOUNDATION_CLINIC_DEPARTMENT_KEYS;

const FOUNDATION_DEPARTMENT_SET = new Set(FOUNDATION_CLINIC_DEPARTMENT_KEYS);

const FULL_CLINIC_TEMPLATE_KEYS = CLINIC_DEPARTMENT_DEFINITIONS.map((d) => d.key);

const DEPARTMENT_REQUIRES = {};
const REMOVAL_CASCADE = {};

function getRequiredDepartment() {
  return null;
}

function getCascadeRemovals() {
  return [];
}

function isFoundationDepartment(key) {
  return FOUNDATION_DEPARTMENT_SET.has(key);
}

function ensureFoundationDepartments(keys) {
  return [...new Set([...FOUNDATION_CLINIC_DEPARTMENT_KEYS, ...keys.filter(isValidDepartmentKey)])];
}

function normalizeCustomDepartmentKeys(keys) {
  return ensureFoundationDepartments(keys);
}

function departmentLabel(key) {
  return DEPARTMENT_BY_KEY[key]?.label || AUTHORIZED_CLINIC_ROLES[key] || key;
}

function isValidDepartmentKey(key) {
  return VALID_DEPARTMENT_KEYS.has(key);
}

function resolveTemplateKeys(template, customKeys) {
  if (template === 'custom' && Array.isArray(customKeys)) {
    return normalizeCustomDepartmentKeys(customKeys);
  }
  return [...FULL_CLINIC_TEMPLATE_KEYS];
}

module.exports = {
  CLINIC_DEPARTMENT_DEFINITIONS,
  DEPARTMENT_BY_KEY,
  FOUNDATION_CLINIC_DEPARTMENT_KEYS,
  MINIMAL_CLINIC_TEMPLATE_KEYS,
  FULL_CLINIC_TEMPLATE_KEYS,
  FOUNDATION_DEPARTMENT_SET,
  VALID_DEPARTMENT_KEYS,
  departmentLabel,
  isValidDepartmentKey,
  isFoundationDepartment,
  ensureFoundationDepartments,
  normalizeCustomDepartmentKeys,
  resolveTemplateKeys,
  getRequiredDepartment,
  getCascadeRemovals,
};
