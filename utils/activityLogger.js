const ActivityLog = require('../models/ActivityLog');

/**
 * Create an activity log entry
 * @param {Object} params
 * @param {String} params.userId - ID of the user performing the action
 * @param {String} params.action - Action type
 * @param {String} params.entityType - Entity type (task, project, user)
 * @param {String} params.entityId - ID of the affected entity
 * @param {String} params.entityName - Name/title of the affected entity
 * @param {String} params.details - Human-readable description
 * @param {String} params.projectId - Optional project context
 */
const logActivity = async ({
  userId,
  action,
  entityType,
  entityId,
  entityName,
  details = '',
  projectId = null,
}) => {
  try {
    await ActivityLog.create({
      user: userId,
      action,
      entityType,
      entityId,
      entityName,
      details,
      project: projectId,
    });
  } catch (error) {
    // Don't throw — activity logging should never break the main flow
    console.error('Activity logging failed:', error.message);
  }
};

module.exports = logActivity;
