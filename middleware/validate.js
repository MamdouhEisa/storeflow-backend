const Joi = require('joi');

// Reusable validation schemas
const schemas = {
  login: Joi.object({
    username: Joi.string().min(3).max(100).required(),
    password: Joi.string().min(6).required()
  }),

  employeeCreate: Joi.object({
    username: Joi.string().min(3).max(100).required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('admin', 'sales').required(),
    roleLabel: Joi.string().optional().allow('', null),
    fullName: Joi.string().optional().allow('', null),
    email: Joi.string().email().optional().allow('', null),
    phone: Joi.string().optional().allow('', null),
    branch: Joi.string().optional().allow(null, '')
  }),

  employeeUpdate: Joi.object({
    username: Joi.string().min(3).max(100).optional(),
    password: Joi.string().min(6).optional(),
    role: Joi.string().valid('admin', 'sales').optional(),
    roleLabel: Joi.string().optional().allow('', null),
    fullName: Joi.string().optional().allow('', null),
    email: Joi.string().email().optional().allow('', null),
    phone: Joi.string().optional().allow('', null),
    branch: Joi.string().optional().allow(null, '')
  }),

  product: Joi.object({
    name: Joi.string().max(100).required(),
    quantity: Joi.number().min(0).required(),
    branch: Joi.string().required().label('branch location'),
    code: Joi.string().max(50).optional().allow('', null),
    purchasePrice: Joi.number().min(0).optional(),
    sellingPrice: Joi.number().min(0).optional(),
    imageUrl: Joi.string().optional().allow('', null),
    minStock: Joi.number().min(0).optional()
  }),

  transfer: Joi.object({
    fromBranch: Joi.string().required().label('from branch location'),
    toBranch: Joi.string().required().label('to branch location'),
    product: Joi.string().required(),
    quantity: Joi.number().min(1).required()
  }),

  saleCreate: Joi.object({
    branch: Joi.string().required(),
    items: Joi.array().items(
      Joi.object({
        productId: Joi.string().required(),
        qty: Joi.number().min(1).required(),
        price: Joi.number().min(0).optional(),
        cost: Joi.number().min(0).optional()
      })
    ).min(1).required(),
    discount: Joi.number().min(0).optional(),
    tax: Joi.number().min(0).optional(),
    paymentType: Joi.string().valid('cash', 'card').optional()
  }),

  saleReturnItem: Joi.object({
    productId: Joi.string().required()
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().min(1).required(),
    newPassword: Joi.string().min(8).required()
  }),

  updateSetting: Joi.object({
    value: Joi.any().required()
  }),

  bulkUpdateSettings: Joi.array().items(
    Joi.object({
      key: Joi.string().required(),
      value: Joi.any().required()
    })
  ).min(1).required()
};

// Validation middleware factory
const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }
  next();
};

module.exports = { validate, schemas };

