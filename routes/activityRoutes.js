const express = require('express');
const router = express.Router();
const { getActivities, getProjectActivities } = require('../controllers/activityController');
const { protect } = require('../middleware/authMiddleware');
const { checkProjectAccess } = require('../middleware/ownershipMiddleware');

router.get('/', protect, getActivities);
router.get('/project/:projectId', protect, checkProjectAccess, getProjectActivities);

module.exports = router;
