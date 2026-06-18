const Transfer = require('../models/Transfer');
const Product = require('../models/Product');
const Branch = require('../models/Branch');
const { createLog, withTransaction } = require('../utils/helpers');
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

// @desc    Create transfer request (admin/sales)
const createTransfer = async (req, res) => {
  try {
    const { fromBranch: fromLocation, toBranch: toLocation, product, quantity } = req.body;
    const transferData = {
      product,
      quantity,
      createdBy: req.employee._id
    };

    // Find branches by location
    const [fromBranch, toBranch] = await Promise.all([
      resolveBranch(fromLocation),
      resolveBranch(toLocation)
    ]);

    if (!fromBranch || !toBranch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch locations'
      });
    }

    if (req.employee.role === 'sales' && String(req.employee.branch) !== String(fromBranch._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Can only transfer from your branch.'
      });
    }

    transferData.fromBranch = fromBranch._id;
    transferData.toBranch = toBranch._id;

    // Check product exists in source branch
    const sourceProduct = await Product.findOne({
      _id: product,
      branch: fromBranch._id,
      isDeleted: false
    });

    if (!sourceProduct) {
      return res.status(400).json({
        success: false,
        message: 'Product not found in source branch'
      });
    }

    if (sourceProduct.quantity < transferData.quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient quantity. Available: ${sourceProduct.quantity}, requested: ${transferData.quantity}`
      });
    }

    const transfer = await Transfer.create(transferData);

    await createLog('transfer', req.employee._id, transferData.product, transferData.fromBranch, transfer._id,
      `${req.employee.username} created transfer request for ${transferData.quantity} units of product ${sourceProduct.name} from ${fromBranch.name} to ${toBranch.name}`);

    const populatedTransfer = await Transfer.findById(transfer._id)
      .populate('fromBranch', 'name')
      .populate('toBranch', 'name')
      .populate('product')
      .populate('createdBy', 'username');

    res.status(201).json({
      success: true,
      transfer: populatedTransfer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get transfers (admin, paginated)
const getTransfers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const transfers = await Transfer.find()
      .populate('fromBranch', 'name location')
      .populate('toBranch', 'name location')
      .populate('product', 'name')
      .populate('createdBy', 'username')
      .populate('approvedBy', 'username')
      .populate('rejectedBy', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transfer.countDocuments();

    res.status(200).json({
      success: true,
      count: transfers.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: transfers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Approve transfer (admin only)
const approveTransfer = async (req, res) => {
  try {
    const transferId = req.params.id;
    const approverId = req.employee._id;

    const session = await mongoose.startSession();

    const result = await withTransaction(session, async (session) => {
      const transfer = await Transfer.findById(transferId).session(session);
      if (!transfer || transfer.status !== 'pending') {
        throw new Error('Transfer not found or not pending');
      }

      // Update transfer status
      transfer.status = 'approved';
      transfer.approvedBy = approverId;
      await transfer.save({ session });

      // Deduct from source branch
      await Product.findByIdAndUpdate(
        transfer.product,
        { $inc: { quantity: -transfer.quantity } },
        { session }
      );

      // Add to destination branch (create product copy if needed)
      const destProduct = await Product.findOne({
        _id: transfer.product,
        branch: transfer.toBranch,
        isDeleted: false
      }).session(session);

      if (destProduct) {
        await Product.findByIdAndUpdate(
          destProduct._id,
          { $inc: { quantity: transfer.quantity } },
          { session }
        );
      } else {
        // Create new product entry in destination branch
        const source = await Product.findById(transfer.product).session(session);
        await Product.create([{
          name: source.name,
          code: source.code,
          quantity: transfer.quantity,
          purchasePrice: source.purchasePrice,
          sellingPrice: source.sellingPrice,
          imageUrl: source.imageUrl,
          minStock: source.minStock,
          branch: transfer.toBranch,
          createdBy: transfer.createdBy
        }], { session });
      }

      return transfer;
    });

    const populatedTransfer = await Transfer.findById(result._id)
      .populate('fromBranch toBranch product createdBy approvedBy', 'name username');

    await createLog('approve_transfer', approverId, result.product, result.fromBranch, result._id,
      `${req.employee.username} approved transfer of ${result.quantity} units of ${populatedTransfer.product.name}`);

    res.status(200).json({
      success: true,
      transfer: populatedTransfer,
      message: 'Transfer approved successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Reject transfer (admin only)
const rejectTransfer = async (req, res) => {
  try {
    const transferId = req.params.id;
    const rejecterId = req.employee._id;

    const transfer = await Transfer.findById(transferId);
    if (!transfer || transfer.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Transfer not found or not pending'
      });
    }

    transfer.status = 'rejected';
    transfer.rejectedBy = rejecterId;
    await transfer.save();

    const populatedTransfer = await Transfer.findById(transfer._id)
      .populate('fromBranch toBranch product createdBy rejectedBy', 'name username');

    await createLog('reject_transfer', rejecterId, transfer.product, transfer.fromBranch, transfer._id,
      `${req.employee.username} rejected transfer of ${transfer.quantity} units of ${populatedTransfer.product.name}`);

    res.status(200).json({
      success: true,
      transfer: populatedTransfer,
      message: 'Transfer rejected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  createTransfer,
  getTransfers,
  approveTransfer,
  rejectTransfer
};

