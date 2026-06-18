const express = require('express');
const { getSettings, updateSetting, bulkUpdateSettings } = require('../controllers/settingsController');
const authMiddleware = require('../middleware/auth');
const { adminOnly } = require('../middleware/roles');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);

router.get('/', getSettings);
router.patch('/:key', validate(schemas.updateSetting), updateSetting);
router.put('/bulk', validate(schemas.bulkUpdateSettings), bulkUpdateSettings);

module.exports = router;
