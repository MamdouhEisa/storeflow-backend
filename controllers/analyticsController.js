const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Branch = require('../models/Branch');
const Employee = require('../models/Employee');
const mongoose = require('mongoose');

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const monthStart = startOfMonth(now);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const branchFilter = req.employee.role === 'sales' ? { branch: req.employee.branch } : {};

    const sales = await Sale.find({ ...branchFilter }).populate('items.product', 'name');
    const products = await Product.find({ ...branchFilter, isDeleted: false }).populate('branch', 'name location');

    const completed = sales.filter((s) => s.status === 'completed');

    const todaySales = completed.filter((s) => s.createdAt >= todayStart);
    const yesterdaySales = completed.filter((s) => s.createdAt >= yesterdayStart && s.createdAt < todayStart);
    const monthSales = completed.filter((s) => s.createdAt >= monthStart);
    const prevMonthSales = completed.filter((s) => s.createdAt >= prevMonthStart && s.createdAt < monthStart);

    const sumTotal = (arr) => arr.reduce((a, s) => a + (s.totalAmount || 0), 0);
    const sumProfit = (arr) => arr.reduce((a, s) => a + (s.totalProfit || 0), 0);

    const todayTotal = sumTotal(todaySales);
    const yesterdayTotal = sumTotal(yesterdaySales);
    const todayProfit = sumProfit(todaySales);
    const yesterdayProfit = sumProfit(yesterdaySales);

    const monthTotal = sumTotal(monthSales);
    const prevMonthTotal = sumTotal(prevMonthSales);
    const monthProfit = sumProfit(monthSales);
    const prevMonthProfit = sumProfit(prevMonthSales);

    const todayPerformance = [
      { title: 'Sales Today', value: todayTotal, badge: yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100 : 0 },
      { title: 'Profit Today', value: todayProfit, badge: yesterdayProfit > 0 ? ((todayProfit - yesterdayProfit) / yesterdayProfit) * 100 : 0 },
      { title: 'Transactions', value: todaySales.length },
      { title: 'Active Users', value: new Set(todaySales.map((s) => String(s.createdBy))).size },
    ];

    const monthPerformance = [
      { title: 'Monthly Sales', value: monthTotal, previous: prevMonthTotal },
      { title: 'Monthly Profit', value: monthProfit, previous: prevMonthProfit },
      { title: 'Transactions', value: monthSales.length, previous: prevMonthSales.length },
      {
        title: 'Avg Transaction',
        value: monthSales.length ? monthTotal / monthSales.length : 0,
        previous: prevMonthSales.length ? prevMonthTotal / prevMonthSales.length : 0,
      },
    ];

    const alerts = products
      .filter((p) => (p.quantity || 0) <= (p.minStock || 10))
      .sort((a, b) => (a.quantity / (a.minStock || 10)) - (b.quantity / (b.minStock || 10)))
      .slice(0, 3)
      .map((p) => ({
        name: p.name,
        stock: p.quantity,
        min: p.minStock || 10,
        branch: p.branch?.name || '',
        level: p.quantity <= (p.minStock || 10) * 0.5 ? 'Critical' : 'Low',
      }));

    const branchSet = new Set();
    [...products, ...monthSales].forEach((item) => {
      const name = item.branch?.name || item.branch || '';
      if (name) branchSet.add(name);
    });

    const branchPerformance = Array.from(branchSet).slice(0, 3).map((branchName) => {
      const branchProducts = products.filter((p) => (p.branch?.name || '') === branchName);
      const stockValue = branchProducts.reduce((a, p) => a + (p.quantity || 0) * (p.purchasePrice || 0), 0);
      const mSales = monthSales.filter((s) => (s.branch?.name || '') === branchName);
      const pSales = prevMonthSales.filter((s) => (s.branch?.name || '') === branchName);
      const mProfit = sumProfit(mSales);
      const pProfit = sumProfit(pSales);
      return { branch: branchName, stock: stockValue, profit: mProfit, orders: mSales.length, trend: mProfit >= pProfit ? 'up' : 'down' };
    });

    const topMap = new Map();
    monthSales.forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const name = item.name || 'Product';
        if (!topMap.has(name)) {
          topMap.set(name, { name, sold: 0, revenue: 0, profit: 0 });
        }
        const row = topMap.get(name);
        row.sold += item.qty || 0;
        row.revenue += (item.price || 0) * (item.qty || 0);
        row.profit += ((item.price || 0) - (item.cost || 0)) * (item.qty || 0);
      });
    });

    const topProducts = Array.from(topMap.values())
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 4);

    const recentActivity = [...sales]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .map((s) => ({
        text: s.status === 'returned' ? `Returned Sale #${s.invoiceNumber || s._id}` : `New Sale #${s.invoiceNumber || s._id}`,
        meta: s.createdAt,
        kind: s.status === 'returned' ? 'alert' : 'sale',
      }));

    res.json({
      success: true,
      data: { todayPerformance, monthPerformance, alerts, branchPerformance, topProducts, recentActivity },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getProfit = async (req, res) => {
  try {
    const now = new Date();
    const period = req.query.period || 'today';

    let start;
    if (period === 'today') start = startOfDay(now);
    else if (period === 'week') start = startOfWeek(now);
    else start = startOfMonth(now);

    const branchFilter = req.employee.role === 'sales' ? { branch: req.employee.branch } : {};

    const sales = await Sale.find({
      ...branchFilter,
      createdAt: { $gte: start },
      status: { $nin: ['returned', 'cancelled'] },
    });

    const products = await Product.find({ ...branchFilter, isDeleted: false });

    let totalSales = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let transactions = sales.length;

    const productMap = new Map();
    for (const sale of sales) {
      totalSales += sale.totalAmount || 0;
      totalCost += sale.totalCost || 0;
      totalProfit += sale.totalProfit || 0;
      for (const item of sale.items || []) {
        const key = String(item.product || item.name || 'unknown');
        if (!productMap.has(key)) {
          productMap.set(key, { name: item.name || 'Product', productId: item.product, sold: 0, revenue: 0, profit: 0, cost: 0 });
        }
        const row = productMap.get(key);
        row.sold += item.qty || 0;
        row.revenue += (item.price || 0) * (item.qty || 0);
        row.profit += ((item.price || 0) - (item.cost || 0)) * (item.qty || 0);
        row.cost += (item.cost || 0) * (item.qty || 0);
      }
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.profit - a.profit || b.revenue - a.revenue)
      .slice(0, 6)
      .map((p) => {
        const matched = products.find((pr) => String(pr._id) === String(p.productId));
        return { ...p, stock: matched?.quantity || 0, margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0 };
      });

    const lowProfitProducts = [...topProducts]
      .sort((a, b) => a.margin - b.margin || a.profit - b.profit)
      .slice(0, 6);

    res.json({
      success: true,
      data: {
        stats: { totalSales, totalCost, totalProfit, transactions },
        topProducts,
        lowProfitProducts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getDashboard, getProfit };
