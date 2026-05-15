const { validationResult } = require('express-validator');
const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const logActivity = require('../utils/activityLogger');

// @desc    Get tasks (admin: all, member: only tasks in their projects or assigned to them)
// @route   GET /api/tasks
// @access  Protected
const getTasks = async (req, res, next) => {
  try {
    let query = {};

    // Members can only see tasks in their projects or assigned to them
    if (req.user.role === 'member') {
      const memberProjects = await Project.find({
        members: req.user._id,
      }).select('_id');
      const projectIds = memberProjects.map((p) => p._id);

      query = {
        $or: [
          { project: { $in: projectIds } },
          { assignedTo: req.user._id },
        ],
      };
    }

    // Apply filters from query params
    const { status, priority, project, search, sortBy, order } = req.query;

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (project) query.project = project;
    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
        ],
      });
    }

    // Build sort
    let sort = { createdAt: -1 };
    if (sortBy === 'dueDate') sort = { dueDate: order === 'desc' ? -1 : 1 };
    if (sortBy === 'priority') {
      sort = { priority: order === 'desc' ? -1 : 1 };
    }
    if (sortBy === 'status') sort = { status: order === 'desc' ? -1 : 1 };

    const tasks = await Task.find(query)
      .populate('assignedTo', 'name email avatar')
      .populate('project', 'name')
      .populate('createdBy', 'name email avatar')
      .sort(sort);

    res.json(tasks);
  } catch (error) {
    next(error);
  }
};

// @desc    Get single task
// @route   GET /api/tasks/:id
// @access  Protected + checkTaskAccess
const getTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email avatar')
      .populate('project', 'name members')
      .populate('createdBy', 'name email avatar');

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Admin
const createTask = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { title, description, priority, status, dueDate, assignedTo, project } = req.body;

    // Verify project exists
    const projectDoc = await Project.findById(project);
    if (!projectDoc) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // If assigning a user, verify they are a member of the project
    if (assignedTo) {
      const isMember = projectDoc.members.some(
        (m) => m.toString() === assignedTo
      );
      if (!isMember) {
        return res.status(400).json({
          message: 'Assigned user must be a member of the project',
        });
      }
    }

    const task = await Task.create({
      title,
      description,
      priority,
      status,
      dueDate,
      assignedTo: assignedTo || null,
      project,
      createdBy: req.user._id,
    });

    await task.populate('assignedTo', 'name email avatar');
    await task.populate('project', 'name');
    await task.populate('createdBy', 'name email avatar');

    const assignedUser = assignedTo ? await User.findById(assignedTo) : null;

    await logActivity({
      userId: req.user._id,
      action: 'created',
      entityType: 'task',
      entityId: task._id,
      entityName: task.title,
      details: `Created task "${task.title}"${assignedUser ? ` and assigned to ${assignedUser.name}` : ''}`,
      projectId: project,
    });

    if (assignedTo) {
      await logActivity({
        userId: req.user._id,
        action: 'assigned',
        entityType: 'task',
        entityId: task._id,
        entityName: task.title,
        details: `Assigned "${task.title}" to ${assignedUser.name}`,
        projectId: project,
      });
    }

    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a task
// @route   PUT /api/tasks/:id
// @access  Protected + checkTaskAccess (admin: all fields, member: status only)
const updateTask = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const oldStatus = task.status;
    const changes = [];

    if (req.user.role === 'member') {
      // Members can only update status
      if (req.body.status && req.body.status !== task.status) {
        task.status = req.body.status;
        changes.push(`Changed status from "${oldStatus}" to "${req.body.status}"`);
      }
    } else {
      // Admin can update all fields
      const { title, description, priority, status, dueDate, assignedTo } = req.body;

      if (title && title !== task.title) {
        changes.push(`Changed title to "${title}"`);
        task.title = title;
      }
      if (description !== undefined) task.description = description;
      if (priority && priority !== task.priority) {
        changes.push(`Changed priority from "${task.priority}" to "${priority}"`);
        task.priority = priority;
      }
      if (status && status !== task.status) {
        changes.push(`Changed status from "${oldStatus}" to "${status}"`);
        task.status = status;
      }
      if (dueDate) task.dueDate = dueDate;
      if (assignedTo !== undefined) {
        if (assignedTo && assignedTo !== (task.assignedTo ? task.assignedTo.toString() : null)) {
          const newAssignee = await User.findById(assignedTo);
          if (newAssignee) {
            changes.push(`Reassigned to ${newAssignee.name}`);
          }
        }
        task.assignedTo = assignedTo || null;
      }
    }

    await task.save();
    await task.populate('assignedTo', 'name email avatar');
    await task.populate('project', 'name');
    await task.populate('createdBy', 'name email avatar');

    // Log status change specifically
    if (oldStatus !== task.status) {
      await logActivity({
        userId: req.user._id,
        action: 'status_changed',
        entityType: 'task',
        entityId: task._id,
        entityName: task.title,
        details: `Changed status from "${oldStatus}" to "${task.status}"`,
        projectId: task.project._id || task.project,
      });
    } else if (changes.length > 0) {
      await logActivity({
        userId: req.user._id,
        action: 'updated',
        entityType: 'task',
        entityId: task._id,
        entityName: task.title,
        details: changes.join(', '),
        projectId: task.project._id || task.project,
      });
    }

    res.json(task);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Admin
const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const taskTitle = task.title;
    const projectId = task.project;

    await task.deleteOne();

    await logActivity({
      userId: req.user._id,
      action: 'deleted',
      entityType: 'task',
      entityId: req.params.id,
      entityName: taskTitle,
      details: `Deleted task "${taskTitle}"`,
      projectId,
    });

    res.json({ message: 'Task deleted' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get task statistics
// @route   GET /api/tasks/stats
// @access  Protected
const getTaskStats = async (req, res, next) => {
  try {
    let matchQuery = {};

    // Scope stats to accessible projects for members
    if (req.user.role === 'member') {
      const memberProjects = await Project.find({
        members: req.user._id,
      }).select('_id');
      const projectIds = memberProjects.map((p) => p._id);
      matchQuery = {
        $or: [
          { project: { $in: projectIds } },
          { assignedTo: req.user._id },
        ],
      };
    }

    const [total, completed, inProgress, todo] = await Promise.all([
      Task.countDocuments(matchQuery),
      Task.countDocuments({ ...matchQuery, status: 'completed' }),
      Task.countDocuments({ ...matchQuery, status: 'in-progress' }),
      Task.countDocuments({ ...matchQuery, status: 'todo' }),
    ]);

    // Overdue: tasks not completed with dueDate before now
    const overdue = await Task.countDocuments({
      ...matchQuery,
      status: { $ne: 'completed' },
      dueDate: { $lt: new Date() },
    });

    // Tasks by priority
    const byPriority = await Task.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]);

    // Tasks by status
    const byStatus = await Task.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    res.json({
      total,
      completed,
      inProgress,
      todo,
      overdue,
      byPriority,
      byStatus,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  getTaskStats,
};
