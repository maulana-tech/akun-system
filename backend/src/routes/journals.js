const express = require('express');
const router = express.Router();
const journalController = require('../controllers/journalController');

router.post('/', journalController.create.bind(journalController));
router.get('/', journalController.list.bind(journalController));
router.post('/:id/post', journalController.post.bind(journalController));
router.get('/ledger/:accountId', journalController.getLedger.bind(journalController));

module.exports = router;
