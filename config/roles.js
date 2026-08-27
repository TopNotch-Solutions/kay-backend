'use strict';

/** Kay One Dental — only front office, doctor, and system admin. */
const ROLES = {
  FRONT_OFFICE: 'front_office',
  DOCTOR: 'doctor',
  SYSTEM_ADMIN: 'system_admin',
};

const PERMISSIONS = {
  patient: ['create', 'read', 'update', 'delete'],
  vitals: ['create', 'read', 'update', 'delete'],
  consultation: ['create', 'read', 'update', 'delete'],
  prescription: ['create', 'read', 'update'],
  inventory: ['create', 'read', 'update', 'delete'],
  queue: ['create', 'read', 'update', 'push'],
  audit_log: ['read'],
  user: ['create', 'read', 'update', 'delete'],
  facility: ['create', 'read', 'update'],
  analytics: ['read'],
  user_report: ['create', 'read', 'update'],
  billing: ['create', 'read', 'update'],
  referral: ['create', 'read', 'update'],
};

const ROLE_PERMISSIONS = {
  [ROLES.SYSTEM_ADMIN]: {
    patient: ['create', 'read', 'update', 'delete'],
    vitals: ['read'],
    consultation: ['read'],
    prescription: ['read'],
    inventory: ['create', 'read', 'update', 'delete'],
    queue: ['create', 'read', 'update', 'push'],
    audit_log: ['read'],
    user: ['create', 'read', 'update', 'delete'],
    facility: ['create', 'read', 'update'],
    analytics: ['read'],
    billing: ['create', 'read', 'update'],
    referral: ['read'],
    user_report: ['create', 'read', 'update'],
  },
  [ROLES.FRONT_OFFICE]: {
    patient: ['create', 'read', 'update'],
    queue: ['create', 'read', 'push'],
    referral: ['read'],
    user_report: ['create', 'read'],
  },
  [ROLES.DOCTOR]: {
    patient: ['read', 'update'],
    vitals: ['create', 'read', 'update'],
    consultation: ['create', 'read', 'update'],
    prescription: ['create', 'read', 'update'],
    inventory: ['read'],
    queue: ['read', 'push', 'update'],
    user_report: ['create', 'read'],
  },
};

module.exports = { ROLES, PERMISSIONS, ROLE_PERMISSIONS };
