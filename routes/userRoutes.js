const express = require('express');
const router = express.Router();
const { getUsers, getUser } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.get('/', protect, authorize('admin'), getUsers);
router.get('/:id', protect, getUser);

module.exports = router;
