'use strict';

const { Op } = require('sequelize');
const { Facility, Visit, Patient, QueueEntry } = require('../models');
const { isClinicFacility, isHospitalFacility } = require('../config/clinicRoles');

const ACTIVE_QUEUE_STATUSES = ['waiting', 'in_progress'];

async function loadFacility(facilityId, transaction) {
  if (!facilityId) return null;
  return Facility.findByPk(facilityId, { transaction });
}

async function isClinicFacilityId(facilityId, transaction) {
  const facility = await loadFacility(facilityId, transaction);
  return isClinicFacility(facility);
}

async function isBillableFacilityId(facilityId, transaction) {
  const facility = await loadFacility(facilityId, transaction);
  return isClinicFacility(facility) || isHospitalFacility(facility);
}

async function countActiveClinicalQueues(visitId, transaction) {
  return QueueEntry.count({
    where: {
      visit_id: visitId,
      department: { [Op.ne]: 'billing' },
      status: { [Op.in]: ACTIVE_QUEUE_STATUSES },
    },
    transaction,
  });
}

/**
 * Kay One has no billing department — never route patients to billing.
 */
async function routePrivatePatientToBilling() {
  return { routed: false, reason: 'billing_not_used' };
}

async function completeAnyBillingQueueEntries(visitId, transaction) {
  await QueueEntry.update(
    {
      status: 'completed',
      completed_at: new Date(),
      notes: 'Closed — Kay One has no billing department',
    },
    {
      where: {
        visit_id: visitId,
        department: 'billing',
        status: { [Op.in]: ACTIVE_QUEUE_STATUSES },
      },
      transaction,
    }
  );
}

/**
 * After clinical work ends, complete the visit (no billing handoff).
 */
async function applyVisitEndState({ visitId, transaction }) {
  const activeClinical = await countActiveClinicalQueues(visitId, transaction);
  if (activeClinical > 0) {
    return {
      routedToBilling: false,
      holdVisitOpen: true,
      reason: 'clinical_queues_active',
    };
  }

  await completeAnyBillingQueueEntries(visitId, transaction);

  await Visit.update(
    {
      status: 'completed',
      completed_at: new Date(),
      current_department: null,
      current_queue_position: null,
    },
    { where: { id: visitId }, transaction }
  );

  return { routedToBilling: false, visitCompleted: true };
}

module.exports = {
  isClinicFacilityId,
  isBillableFacilityId,
  routePrivatePatientToBilling,
  applyVisitEndState,
  countActiveClinicalQueues,
};
