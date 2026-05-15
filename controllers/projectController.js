const { validationResult } = require('express-validator');
const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const logActivity = require('../utils/activityLogger');

// @desc    Get all projects (admin: all, member: only their projects)
// @route   GET /api/projects
// @access  Protected
const getProjects = async (req, res, next) => {
  try {
    let query = {};

    // Members can only see projects they belong to
    if (req.user.role === 'member') {
      query = { members: req.user._id };
    }

    const projects = await Project.find(query)
      .populate('owner', 'name email avatar')
      .populate('members', 'name email avatar role')
      .sort({ createdAt: -1 });

    // Add task counts for each project
    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        const taskCount = await Task.countDocuments({ project: project._id });
        const completedCount = await Task.countDocuments({
          project: project._id,
          status: 'completed',
        });
        return {
          ...project.toObject(),
          taskCount,
          completedCount,
        };
      })
    );

    res.json(projectsWithCounts);
  } catch (error) {
    next(error);
  }
};

// @desc    Get single project
// @route   GET /api/projects/:id
// @access  Protected + checkProjectAccess
const getProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('owner', 'name email avatar')
      .populate('members', 'name email avatar role');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Get task counts
    const taskCount = await Task.countDocuments({ project: project._id });
    const completedCount = await Task.countDocuments({
      project: project._id,
      status: 'completed',
    });

    res.json({
      ...project.toObject(),
      taskCount,
      completedCount,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new project
// @route   POST /api/projects
// @access  Admin
const createProject = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { name, description, status, members } = req.body;

    const project = await Project.create({
      name,
      description,
      status,
      owner: req.user._id,
      members: members || [req.user._id],
    });

    await project.populate('owner', 'name email avatar');
    await project.populate('members', 'name email avatar role');

    await logActivity({
      userId: req.user._id,
      action: 'created',
      entityType: 'project',
      entityId: project._id,
      entityName: project.name,
      details: `Created project "${project.name}"`,
      projectId: project._id,
    });

    res.status(201).json({ ...project.toObject(), taskCount: 0, completedCount: 0 });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a project
// @route   PUT /api/projects/:id
// @access  Admin
const updateProject = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const { name, description, status } = req.body;

    if (name) project.name = name;
    if (description !== undefined) project.description = description;
    if (status) project.status = status;

    await project.save();
    await project.populate('owner', 'name email avatar');
    await project.populate('members', 'name email avatar role');

    await logActivity({
      userId: req.user._id,
      action: 'updated',
      entityType: 'project',
      entityId: project._id,
      entityName: project.name,
      details: `Updated project "${project.name}"`,
      projectId: project._id,
    });

    res.json(project);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a project
// @route   DELETE /api/projects/:id
// @access  Admin
const deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const projectName = project.name;

    // Delete all tasks associated with this project
    await Task.deleteMany({ project: project._id });
    await project.deleteOne();

    await logActivity({
      userId: req.user._id,
      action: 'deleted',
      entityType: 'project',
      entityId: req.params.id,
      entityName: projectName,
      details: `Deleted project "${projectName}" and all associated tasks`,
    });

    res.json({ message: 'Project and associated tasks deleted' });
  } catch (error) {
    next(error);
  }
};

// @desc    Add a member to a project
// @route   POST /api/projects/:id/members
// @access  Admin
const addMember = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const { userId } = req.body;

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already a member
    if (project.members.includes(userId)) {
      return res.status(400).json({ message: 'User is already a member of this project' });
    }

    project.members.push(userId);
    await project.save();
    await project.populate('owner', 'name email avatar');
    await project.populate('members', 'name email avatar role');

    await logActivity({
      userId: req.user._id,
      action: 'member_added',
      entityType: 'project',
      entityId: project._id,
      entityName: project.name,
      details: `Added ${user.name} to project "${project.name}"`,
      projectId: project._id,
    });

    res.json(project);
  } catch (error) {
    next(error);
  }
};

// @desc    Remove a member from a project
// @route   DELETE /api/projects/:id/members/:userId
// @access  Admin
const removeMember = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const { userId } = req.params;

    // Cannot remove the owner
    if (project.owner.toString() === userId) {
      return res.status(400).json({ message: 'Cannot remove the project owner' });
    }

    // Check if user is a member
    if (!project.members.some((m) => m.toString() === userId)) {
      return res.status(400).json({ message: 'User is not a member of this project' });
    }

    const user = await User.findById(userId);

    project.members = project.members.filter(
      (m) => m.toString() !== userId
    );
    await project.save();
    await project.populate('owner', 'name email avatar');
    await project.populate('members', 'name email avatar role');

    await logActivity({
      userId: req.user._id,
      action: 'member_removed',
      entityType: 'project',
      entityId: project._id,
      entityName: project.name,
      details: `Removed ${user ? user.name : 'a user'} from project "${project.name}"`,
      projectId: project._id,
    });

    res.json(project);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  addMember,
  removeMember,
};
