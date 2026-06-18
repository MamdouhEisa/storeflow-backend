const express = require('express');
const { getDashboard, getProfit } = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/auth');
const { adminOrSales } = require('../middleware/roles');

const router = express.Router();

router.use(authMiddleware);
router.use(adminOrSales);

router.get('/dashboard', getDashboard);
router.get('/profit', getProfit);

module.exports = router;
