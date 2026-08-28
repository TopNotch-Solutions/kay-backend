'use strict';

const { ROLES } = require('./roles');

/** Default temporary password for new employees. */
const CLINIC_DEFAULT_PASSWORD = 'Demo123!';
/** @deprecated alias — same as CLINIC_DEFAULT_PASSWORD */
const DEFAULT_DEMO_PASSWORD = CLINIC_DEFAULT_PASSWORD;

const SHARED_ROLE_SLUGS = [ROLES.FRONT_OFFICE, ROLES.DOCTOR];

/** Kay One: same assignable roles at every facility type. */
const HOSPITAL_ROLE_SLUGS = [ROLES.DOCTOR];
const CLINIC_ONLY_ROLE_SLUGS = [ROLES.DOCTOR];

const CLINIC_ROLE_SLUGS = [...SHARED_ROLE_SLUGS];
const HOSPITAL_ASSIGNABLE_ROLE_SLUGS = [...SHARED_ROLE_SLUGS];

const AUTHORIZED_CLINIC_ROLES = {
  [ROLES.FRONT_OFFICE]: 'Front Office / Reception',
  [ROLES.DOCTOR]: 'Doctor',
};

const HOSPITAL_ROLE_LABELS = {
  [ROLES.FRONT_OFFICE]: 'Front Office / Reception',
  [ROLES.DOCTOR]: 'Doctor',
  [ROLES.SYSTEM_ADMIN]: 'System Administrator',
};

function isAuthorizedClinicRole(roleName) {
  return CLINIC_ROLE_SLUGS.includes(roleName);
}

function isSharedRole(roleName) {
  return SHARED_ROLE_SLUGS.includes(roleName);
}

function isClinicFacility(facility) {
  return facility?.type === 'clinic';
}

/** Kay One outpatient sites — daily visit window (clinic + health_center). */
function isOutpatientDayBoundFacility(facility) {
  return facility?.type === 'clinic' || facility?.type === 'health_center';
}

function isHospitalFacility(facility) {
  return facility?.type === 'hospital';
}

function getAllowedRoleSlugsForFacility(facility) {
  if (isOutpatientDayBoundFacility(facility) || isHospitalFacility(facility)) {
    return CLINIC_ROLE_SLUGS;
  }
  return [];
}

function isRoleAllowedAtFacility(roleName, facility) {
  if (!roleName || !facility) return false;
  return getAllowedRoleSlugsForFacility(facility).includes(roleName);
}

module.exports = {
  CLINIC_DEFAULT_PASSWORD,
  DEFAULT_DEMO_PASSWORD,
  SHARED_ROLE_SLUGS,
  HOSPITAL_ROLE_SLUGS,
  HOSPITAL_ASSIGNABLE_ROLE_SLUGS,
  HOSPITAL_ROLE_LABELS,
  AUTHORIZED_CLINIC_ROLES,
  CLINIC_ROLE_SLUGS,
  CLINIC_ONLY_ROLE_SLUGS,
  isAuthorizedClinicRole,
  isSharedRole,
  isClinicFacility,
  isOutpatientDayBoundFacility,
  isHospitalFacility,
  getAllowedRoleSlugsForFacility,
  isRoleAllowedAtFacility,
};
