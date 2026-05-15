const ActivityLog = require('../models/ActivityLog');
const Project = require('../models/Project');

// @desc    Get activity logs (admin: all, member: only from their projects)
// @route   GET /api/activities
// @access  Protected
const getActivities = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    let query = {};

    if (req.user.role === 'member') {
      // Get projects the member belongs to
      const memberProjects = await Project.find({
        members: req.user._id,
      }).select('_id');
      const projectIds = memberProjects.map((p) => p._id);

      query = {
        $or: [{ project: { $in: projectIds } }, { user: req.user._id }],
      };
    }

    const activities = await ActivityLog.find(query)
      .populate('user', 'name email avatar')
      .populate('project', 'name')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(activities);
  } catch (error) {
    next(error);
  }
};

// @desc    Get activity logs for a specific project
// @route   GET /api/activities/project/:projectId
// @access  Protected + checkProjectAccess
const getProjectActivities = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 30;

    const activities = await ActivityLog.find({
      project: req.params.projectId,
    })
      .populate('user', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(activities);
  } catch (error) {
    next(error);
  }
};

module.exports = { getActivities, getProjectActivities };
