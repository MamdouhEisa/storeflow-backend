const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  qty: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1']
  },
  price: {
    type: Number,
    required: true,
    min: [0, 'Price cannot be negative']
  },
  cost: {
    type: Number,
    required: true,
    min: [0, 'Cost cannot be negative']
  }
}, { _id: false });

const saleSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  items: {
    type: [saleItemSchema],
    required: true
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative']
  },
  tax: {
    type: Number,
    default: 0,
    min: [0, 'Tax cannot be negative']
  },
  paymentType: {
    type: String,
    enum: ['cash', 'card'],
    default: 'cash'
  },
  status: {
    type: String,
    enum: ['completed', 'returned', 'partial_return'],
    default: 'completed'
  },
  returnType: {
    type: String,
    enum: ['full', 'partial', null],
    default: null
  },
  returnedAt: {
    type: Date
  },
  subtotal: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    default: 0
  },
  totalCost: {
    type: Number,
    default: 0
  },
  totalProfit: {
    type: Number,
    default: 0
  },
  profitMargin: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

saleSchema.index({ invoiceNumber: 1 });
saleSchema.index({ branch: 1, status: 1 });

module.exports = mongoose.model('Sale', saleSchema);
