const Project = require('../models/Project');
const Task = require('../models/Task');

/**
 * Check if the current user has access to a project.
 * Admins bypass all checks. Members must be in the project's member list.
 */
const checkProjectAccess = async (req, res, next) => {
  try {
    // Admins can access everything
    if (req.user.role === 'admin') return next();

    const projectId = req.params.id || req.params.projectId;
    if (!projectId) {
      return res.status(400).json({ message: 'Project ID is required' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if user is the owner or a member
    const isMember = project.members.some(
      (memberId) => memberId.toString() === req.user._id.toString()
    );
    const isOwner = project.owner.toString() === req.user._id.toString();

    if (!isMember && !isOwner) {
      return res.status(403).json({
        message: 'Access denied — you are not a member of this project',
      });
    }

    req.project = project;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if the current user has access to a task.
 * Admins bypass. Members must be assigned to the task OR be a member of the task's project.
 */
const checkTaskAccess = async (req, res, next) => {
  try {
    // Admins can access everything
    if (req.user.role === 'admin') return next();

    const taskId = req.params.id;
    if (!taskId) {
      return res.status(400).json({ message: 'Task ID is required' });
    }

    const task = await Task.findById(taskId).populate('project');
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const userId = req.user._id.toString();

    // Check if user is assigned to the task
    const isAssigned =
      task.assignedTo && task.assignedTo.toString() === userId;

    // Check if user is a member of the task's project
    const isProjectMember = task.project.members.some(
      (memberId) => memberId.toString() === userId
    );

    if (!isAssigned && !isProjectMember) {
      return res.status(403).json({
        message: 'Access denied — you do not have access to this task',
      });
    }

    req.task = task;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { checkProjectAccess, checkTaskAccess };
