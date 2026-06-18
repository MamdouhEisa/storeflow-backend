const express = require('express');
const {
    createBranch,
    getBranches,
    getBranchById,
    updateBranch,
    deleteBranch
} = require('../controllers/branchController');

const authMiddleware = require('../middleware/auth');
const { adminOnly } = require('../middleware/roles'); // ✅
const { validate } = require('../middleware/validate'); // ✅

const Joi = require('joi');

const router = express.Router({ mergeParams: true });

const branchSchema = Joi.object({
    name: Joi.string().required().max(50),
    location: Joi.string().required(),
    address: Joi.string().optional().allow('', null),
    city: Joi.string().optional().allow('', null),
    email: Joi.string().email().optional().allow('', null),
    phone: Joi.string().optional().allow('', null),
    manager: Joi.string().optional().allow('', null),
    status: Joi.string().valid('Active', 'Inactive').optional()
});

router.use(authMiddleware);
router.use(adminOnly);

router
    .route('/')
    .post(validate(branchSchema), createBranch)
    .get(getBranches);

router
    .route('/:id')
    .get(getBranchById)
    .put(validate(branchSchema), updateBranch)
    .delete(deleteBranch);

module.exports = router;