const express = require('express');
const {
  createSale,
  getSales,
  getSaleById,
  returnFullSale,
  returnSaleItem
} = require('../controllers/saleController');
const authMiddleware = require('../middleware/auth');
const { adminOrSales } = require('../middleware/roles');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

router.use(authMiddleware);

router
  .route('/')
  .post(adminOrSales, validate(schemas.saleCreate), createSale)
  .get(adminOrSales, getSales);

router.get('/:id', adminOrSales, getSaleById);
router.patch('/:id/return', adminOrSales, returnFullSale);
router.patch('/:id/return-item', adminOrSales, validate(schemas.saleReturnItem), returnSaleItem);

module.exports = router;
