const Product = require('../models/Product');
const Branch = require('../models/Branch');
const Employee = require('../models/Employee');
const { createLog, checkLowQuantityAlert } = require('../utils/helpers');
const mongoose = require('mongoose');

const resolveBranch = async (branchValue) => {
  if (!branchValue) return null;

  if (mongoose.Types.ObjectId.isValid(branchValue)) {
    const byId = await Branch.findById(branchValue);
    if (byId && !byId.isDeleted) return byId;
  }

  return Branch.findOne({
    $or: [{ location: branchValue }, { name: branchValue }],
    isDeleted: false
  });
};

// @desc    Get products (paginated, branch-filtered for sales)
const getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const branchFilter = req.employee.role === 'sales' 
      ? { branch: req.employee.branch }
      : {};

    const products = await Product.find({ 
      ...branchFilter, 
      isDeleted: false 
    })
    .populate('branch', 'name location')
    .populate('createdBy', 'username')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Product.countDocuments({ ...branchFilter, isDeleted: false });

    // Check alerts for low stock products
    const alerts = [];
    for (const product of products) {
      const alert = await checkLowQuantityAlert(product._id, product.branch._id, req.employee._id);
      if (alert.alert) {
        alerts.push(alert.message);
      }
    }

    res.status(200).json({
      success: true,
      count: products.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: products,
      alerts: alerts.length ? alerts : undefined
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create product (admin only)
const createProduct = async (req, res) => {
  try {
    const { branch: branchLocation, ...productData } = req.body;
    productData.createdBy = req.employee._id;

    // Find branch by location or name
    const branch = await resolveBranch(branchLocation);
    if (!branch) {
      return res.status(400).json({
        success: false,
        message: `Branch "${branchLocation}" not found`
      });
    }

    productData.branch = branch._id;

    const product = await Product.create(productData);
    const populatedProduct = await Product.findById(product._id)
      .populate('branch', 'name')
      .populate('createdBy', 'username');

    await createLog('create_product', req.employee._id, product._id, productData.branch, null, `${req.employee.username} created product ${product.name}`);

    // Check initial alert
    await checkLowQuantityAlert(product._id, productData.branch, req.employee._id);

    res.status(201).json({
      success: true,
      product: populatedProduct
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update product (admin + sales can reduce qty)
const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const updates = req.body;
    const updaterId = req.employee._id;

    const product = await Product.findById(productId);
    if (!product || product.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const updateKeys = Object.keys(updates || {});

    // Sales can only reduce quantity of their branch products
    if (req.employee.role === 'sales' && product.branch.toString() !== req.employee.branch.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Can only modify products from your branch.'
      });
    }

    // Sales can only reduce quantity (not increase or change other fields)
    if (req.employee.role === 'sales' && updateKeys.some((key) => key !== 'quantity')) {
      return res.status(403).json({
        success: false,
        message: 'Sales can only reduce product quantity.'
      });
    }

    if (req.employee.role === 'sales') {
      const nextQty = Number(updates.quantity);
      if (Number.isFinite(nextQty) && nextQty > product.quantity) {
        return res.status(403).json({
          success: false,
          message: 'Sales can only reduce product quantity.'
        });
      }
    }

    if (updates.branch) {
      const branch = await resolveBranch(updates.branch);
      if (!branch) {
        return res.status(400).json({
          success: false,
          message: `Branch "${updates.branch}" not found`
        });
      }
      updates.branch = branch._id;
    }

    const oldQuantity = product.quantity;
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      updates,
      { new: true, runValidators: true }
    ).populate('branch', 'name').populate('createdBy', 'username');

    await createLog('update_product', updaterId, productId, product.branch, null, 
      `${req.employee.username} updated product ${product.name} (qty: ${oldQuantity} → ${updates.quantity ?? oldQuantity})`);

    // Check alert after update
    await checkLowQuantityAlert(productId, product.branch, updaterId);

    res.status(200).json({
      success: true,
      product: updatedProduct
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Soft delete product (admin)
const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const deleterId = req.employee._id;

    const product = await Product.findById(productId);
    if (!product || product.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.isDeleted = true;
    product.deletedAt = new Date();
    product.deletedBy = deleterId;
    await product.save();

    await createLog('delete_product', deleterId, productId, product.branch, null, `${req.employee.username} soft-deleted product ${product.name}`);

    res.status(200).json({
      success: true,
      message: 'Product soft-deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get product by ID
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('branch', 'name location')
      .populate('createdBy', 'username');

    if (!product || product.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};

