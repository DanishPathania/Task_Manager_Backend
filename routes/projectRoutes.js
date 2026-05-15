const express = require('express');
const router = express.Router();
const {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  addMember,
  removeMember,
} = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { checkProjectAccess } = require('../middleware/ownershipMiddleware');
const { projectValidator, addMemberValidator } = require('../validators/projectValidator');

router
  .route('/')
  .get(protect, getProjects)
  .post(protect, authorize('admin'), projectValidator, createProject);

router
  .route('/:id')
  .get(protect, checkProjectAccess, getProject)
  .put(protect, authorize('admin'), projectValidator, updateProject)
  .delete(protect, authorize('admin'), deleteProject);

router
  .route('/:id/members')
  .post(protect, authorize('admin'), addMemberValidator, addMember);

router
  .route('/:id/members/:userId')
  .delete(protect, authorize('admin'), removeMember);

module.exports = router;
