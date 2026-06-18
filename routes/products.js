const express = require('express');
const {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
} = require('../controllers/productController');

const authMiddleware = require('../middleware/auth');
const { adminOnly, adminOrSales } = require('../middleware/roles'); // ✅
const { validate, schemas } = require('../middleware/validate');   // ✅

const Joi = require('joi');

const router = express.Router();

const productUpdateSchema = Joi.object({
    name: Joi.string().max(100).optional(),
    code: Joi.string().max(50).optional().allow('', null),
    quantity: Joi.number().min(0).optional(),
    branch: Joi.string().optional(),
    purchasePrice: Joi.number().min(0).optional(),
    sellingPrice: Joi.number().min(0).optional(),
    imageUrl: Joi.string().optional().allow('', null),
    minStock: Joi.number().min(0).optional()
});

router.use(authMiddleware);

// ✅ كل الناس (admin + sales)
router.get('/', getProducts);

// ✅ admin بس
router.post('/', adminOnly, validate(schemas.product), createProduct);

// ✅ admin + sales (view details)
router.get('/:id', adminOrSales, getProductById);

// ✅ admin + sales (تقليل الكمية)
router.put('/:id', adminOrSales, validate(productUpdateSchema), updateProduct);

// ✅ admin بس
router.delete('/:id', adminOnly, deleteProduct);

module.exports = router;