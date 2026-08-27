/**
 * Kay One Dental — queue destinations are doctor only.
 */

const EMERGENCY_UNIT_DEPARTMENT = 'emergency_unit';

const FRONT_OFFICE_ROUTING = [
  { value: 'doctor', label: 'Doctor' },
];

const ROUTING_VALUE_SET = new Set(FRONT_OFFICE_ROUTING.map((r) => r.value));

const DEPARTMENT_LABELS = {
  doctor: 'Doctor',
  front_office: 'Front Office',
};

const ALL_QUEUE_DEPARTMENTS = ['doctor'];

function isValidRoutingDestination(value) {
  return ROUTING_VALUE_SET.has(value);
}

function routingLabel(value) {
  return DEPARTMENT_LABELS[value] || value;
}

module.exports = {
  EMERGENCY_UNIT_DEPARTMENT,
  FRONT_OFFICE_ROUTING,
  DEPARTMENT_LABELS,
  ALL_QUEUE_DEPARTMENTS,
  isValidRoutingDestination,
  routingLabel,
};
