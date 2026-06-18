const Log = require('../models/Log');
const Product = require('../models/Product');

// ✅ Create Log (Professional Version)
const createLog = async (...args) => {
  const payload =
    args.length === 1 && typeof args[0] === 'object'
      ? args[0]
      : {
          action: args[0],
          userId: args[1],
          productId: args[2] || null,
          branchId: args[3] || null,
          transferId: args[4] || null,
          message: args[5],
          details: args[6] || {}
        };

  const {
    action,
    userId,
    productId = null,
    branchId = null,
    transferId = null,
    message,
    details = {}
  } = payload;
  try {
    // 🛡️ حماية من الخطأ
    if (!userId) {
      console.log("⚠️ Log skipped: userId is missing");
      return;
    }

    await Log.create({
      action,
      user: userId,
      product: productId,
      branch: branchId,
      transfer: transferId,
      message,
      details
    });

  } catch (error) {
    console.error('❌ Failed to create log:', error.message);
  }
};

// ✅ Low Stock Alert
const checkLowQuantityAlert = async (productId, branchId, userId) => {
  try {
    const product = await Product.findOne({
      _id: productId,
      branch: branchId,
      isDeleted: false
    });

    const minStock = Number.isFinite(product?.minStock) ? product.minStock : 10;

    if (product && product.quantity <= minStock) {
      const message = `Low stock alert: ${product.name} has ${product.quantity} units remaining`;

      await createLog({
        action: 'low_stock',
        userId,
        productId,
        branchId,
        message
      });

      console.log(message);
      return { alert: true, message };
    }

    return { alert: false };

  } catch (error) {
    console.error('❌ Alert error:', error.message);
    return { alert: false };
  }
};

module.exports = {
  createLog,
  checkLowQuantityAlert,
  withTransaction: async (session, work) => {
    let result;
    try {
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      session.endSession();
    }
  }
};