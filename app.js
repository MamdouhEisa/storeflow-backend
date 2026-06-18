const express = require('express');
const errorHandler = require('./middleware/error');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());

// Rate limiting for login (5 attempts per 15 min)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Infinity, // 🔓 Rate limiting DISABLED - unlimited attempts
  message: {
    success: false,
    message: 'Too many login attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// API Routes
app.use('/api/auth', loginLimiter, require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/products', require('./routes/products'));
app.use('/api/transfers', require('./routes/transfers'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/settings', require('./routes/settings'));

// Global error handler (after all routes)
app.use(errorHandler);

module.exports = app;

