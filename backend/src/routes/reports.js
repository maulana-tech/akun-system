const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/trial-balance', reportController.trialBalance.bind(reportController));
router.get('/income-statement', reportController.incomeStatement.bind(reportController));
router.get('/balance-sheet', reportController.balanceSheet.bind(reportController));

module.exports = router;
