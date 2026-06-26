const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Branch = require('../models/Branch');
const { createLog, withTransaction } = require('../utils/helpers');

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

const computeTotals = (items, discount = 0, tax = 0) => {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const totalCost = items.reduce((sum, item) => sum + item.cost * item.qty, 0);
  const totalAmount = Math.max(0, subtotal - discount + tax);
  const totalProfit = totalAmount - totalCost;
  const profitMargin = totalAmount > 0 ? (totalProfit / totalAmount) * 100 : 0;
  return { subtotal, totalCost, totalAmount, totalProfit, profitMargin };
};

const generateInvoiceNumber = async () => {
  const count = await Sale.countDocuments();
  return `INV-${String(count + 1).padStart(3, '0')}`;
};

// @desc Create sale
const createSale = async (req, res) => {
  try {
    const { branch: branchValue, items, discount = 0, tax = 0, paymentType = 'cash' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sale items are required'
      });
    }

    const branch = await resolveBranch(branchValue);
    if (!branch) {
      return res.status(400).json({
        success: false,
        message: `Branch "${branchValue}" not found`
      });
    }

    if (req.employee.role === 'sales' && String(req.employee.branch) !== String(branch._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Can only create sales for your branch.'
      });
    }

    const session = await mongoose.startSession();

    const sale = await withTransaction(session, async (session) => {
      const productIds = items.map((item) => item.productId || item.product);
      const products = await Product.find({
        _id: { $in: productIds },
        branch: branch._id,
        isDeleted: false
      }).session(session);

      const productMap = new Map(products.map((p) => [String(p._id), p]));

      const normalizedItems = [];
      for (const item of items) {
        const productId = String(item.productId || item.product || '');
        const qty = Number(item.qty || item.quantity || 0);
        if (!productId || qty <= 0) {
          throw new Error('Invalid product quantity');
        }

        const product = productMap.get(productId);
        if (!product) {
          throw new Error('Product not found for this branch');
        }

        if (product.quantity < qty) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }

        normalizedItems.push({
          product: product._id,
          name: product.name,
          qty,
          price: Number(item.price ?? product.sellingPrice ?? 0),
          cost: Number(item.cost ?? product.purchasePrice ?? 0)
        });
      }

      const totals = computeTotals(normalizedItems, Number(discount || 0), Number(tax || 0));
      const invoiceNumber = await generateInvoiceNumber();

      const createdSale = await Sale.create([{
        invoiceNumber,
        branch: branch._id,
        createdBy: req.employee._id,
        items: normalizedItems,
        discount: Number(discount || 0),
        tax: Number(tax || 0),
        paymentType,
        status: 'completed',
        ...totals
      }], { session });

      await Promise.all(
        normalizedItems.map((item) =>
          Product.findByIdAndUpdate(
            item.product,
            { $inc: { quantity: -item.qty } },
            { session }
          )
        )
      );

      return createdSale[0];
    });

    await createLog({
      action: 'create_sale',
      userId: req.employee._id,
      branchId: branch._id,
      message: `${req.employee.username} created sale ${sale.invoiceNumber}`
    });

    const populatedSale = await Sale.findById(sale._id)
      .populate('branch', 'name location')
      .populate('createdBy', 'username');

    res.status(201).json({
      success: true,
      sale: populatedSale
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// @desc Get sales
const getSales = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.employee.role === 'sales') {
      filter.branch = req.employee.branch;
    }
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const sales = await Sale.find(filter)
      .populate('branch', 'name location')
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Sale.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: sales.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: sales
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc Get sale by id or invoice
const getSaleById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("Sale ID:", id);

    let sale;

    if (mongoose.Types.ObjectId.isValid(id)) {
      console.log("Searching by ObjectId");
      sale = await Sale.findById(id)
        .populate("branch", "name location")
        .populate("createdBy", "username");
    } else {
      console.log("Searching by invoice");
      sale = await Sale.findOne({ invoiceNumber: id })
        .populate("branch", "name location")
        .populate("createdBy", "username");
    }

    console.log("Sale:", sale);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Sale not found"
      });
    }

    res.json({
      success: true,
      sale
    });

  } catch (err) {
    console.error(err);   // مهم جدًا
    res.status(500).json({
      success: false,
      message: err.message,
      stack: err.stack
    });
  }
};
// @desc Return full sale
let sale;

if (mongoose.Types.ObjectId.isValid(id)) {
  sale = await Sale.findById(id);
} else {
  sale = await Sale.findOne({ invoiceNumber: id });
}

// @desc Return sale item
let sale;

if (mongoose.Types.ObjectId.isValid(id)) {
  sale = await Sale.findById(id);
} else {
  sale = await Sale.findOne({ invoiceNumber: id });
}

module.exports = {
  createSale,
  getSales,
  getSaleById,
  returnFullSale,
  returnSaleItem
};
