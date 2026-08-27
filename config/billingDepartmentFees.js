'use strict';

/** Kay One stub — hospital department visit fees not used. */
module.exports = {
  HOSPITAL_DEPARTMENT_VISIT_FEES: [],
  DEPARTMENT_VISIT_FEE_KEYS: [],
  feeKeyForDepartment: () => null,
  departmentVisitFeeKey: (slug) => `department_visit_${slug}`,
  parseDepartmentVisitFeeKey: () => null,
  departmentVisitLabel: (key) => key || '—',
};
