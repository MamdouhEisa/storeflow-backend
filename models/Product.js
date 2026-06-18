const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  code: {
    type: String,
    trim: true,
    maxlength: [50, 'Product code cannot exceed 50 characters']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0, 'Quantity cannot be negative']
  },
  purchasePrice: {
    type: Number,
    min: [0, 'Purchase price cannot be negative'],
    default: 0
  },
  sellingPrice: {
    type: Number,
    min: [0, 'Selling price cannot be negative'],
    default: 0
  },
  imageUrl: {
    type: String,
    trim: true,
    default: ''
  },
  minStock: {
    type: Number,
    min: [0, 'Minimum stock cannot be negative'],
    default: 10
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
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  }
}, {
  timestamps: true
});

// Index for low quantity alerts and branch queries
productSchema.index({ branch: 1, quantity: 1 });
productSchema.index({ isDeleted: 1, deletedAt: 1 });

module.exports = mongoose.model('Product', productSchema);

