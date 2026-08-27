'use strict';

/** Kay One stub — hospital departments are not used. */
module.exports = {
  HOSPITAL_DEPARTMENT_DEFINITIONS: [],
  HOSPITAL_DEPARTMENT_BY_KEY: {},
  hospitalDepartmentLabel: (key) => key || '—',
  isValidHospitalDepartmentKey: () => false,
  isFoundationHospitalDepartment: () => false,
  resolveHospitalTemplateKeys: () => [],
  getHospitalRequiredDepartment: () => null,
  getHospitalCascadeRemovals: () => [],
  FOUNDATION_HOSPITAL_DEPARTMENT_KEYS: [],
  FULL_HOSPITAL_TEMPLATE_KEYS: [],
  buildHospitalFrontOfficeRouting: () => [],
};
