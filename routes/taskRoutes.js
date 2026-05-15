const express = require('express');
const router = express.Router();
const {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  getTaskStats,
} = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { checkTaskAccess } = require('../middleware/ownershipMiddleware');
const { taskValidator, updateTaskValidator } = require('../validators/taskValidator');

// Stats route must come before /:id to avoid conflict
router.get('/stats', protect, getTaskStats);

router
  .route('/')
  .get(protect, getTasks)
  .post(protect, authorize('admin'), taskValidator, createTask);

router
  .route('/:id')
  .get(protect, checkTaskAccess, getTask)
  .put(protect, checkTaskAccess, updateTaskValidator, updateTask)
  .delete(protect, authorize('admin'), deleteTask);

module.exports = router;
