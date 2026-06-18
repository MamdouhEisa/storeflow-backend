const Employee = require('../models/Employee');
const Branch = require('../models/Branch');
const { comparePassword, generateToken, hashPassword } = require('../utils/authhelper');
const { createLog } = require('../utils/helpers');
const bcrypt = require('bcryptjs');

const login = async (req, res) => {
  try {
      const { username, password } = req.body;
      const identifier = String(username || '').trim().toLowerCase();

      // 🔍 Find employee (username or email)
      const employee = await Employee.findOne({
        $or: [{ username: identifier }, { email: identifier }],
        isDeleted: false
      }).populate('branch');
      
      console.log(`👤 Employee found: ${!!employee}, username in DB: "${employee?.username}"`);

      // ❌ لو مش موجود
      if (!employee) {
        console.log(`⚠️ Failed login attempt for username: ${username}`);
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
  // 🔐 تحقق من الباسورد
      console.log('🔐 Testing password compare...');
      const isPasswordValid = await comparePassword(password, employee.password);
      console.log(`✅ Password valid: ${isPasswordValid}`);
      if (!isPasswordValid) {
        console.log(`⚠️ Failed login attempt for username wrong password: ${username}`);

    // ✅ إنشاء log للفشل لو تحب تسجل الـ userId ممكن تعمل شرط هنا
    await createLog({
      action: 'failed_login',
      userId: employee._id,
      branchId: employee.branch?._id,
      message: `Failed login attempt for ${username}`
    });

    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  // ✅ إنشاء log للنجاح
  await createLog({
    action: 'login',
    userId: employee._id,
    branchId: employee.branch?._id,
    message: `${employee.username} logged in successfully`
  });
      // ✅ Reset attempts on success
      employee.failedLoginAttempts = 0;
      employee.lockUntil = undefined;
      await employee.save();

      // 🔑 Generate token
      const token = generateToken(employee._id);

      // ✅ Success log
      await createLog({
        action: 'login',
        userId: employee._id,
        branchId: employee.branch?._id,
        message: `${employee.username} logged in successfully`
      });

      // 🎉 Response
      res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        employee: {
          id: employee._id,
          username: employee.username,
          fullName: employee.fullName,
          email: employee.email,
          phone: employee.phone,
          role: employee.role,
          branch: employee.branch?._id,
          branchName: employee.branch?.name
        }
      });

    } catch (error) {
      console.error('❌ Login error:', error.message);

      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  };

  const registerAdmin = async (req, res) => {
    try {
      const { username, password, name, email, phone } = req.body;
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedName = String(name || '').trim();
      const normalizedPhone = String(phone || '').trim();
      const adminUsername = normalizedEmail || String(username || '').trim().toLowerCase();

      if (!adminUsername || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      // ✅ Check if admin already exists
      const existingAdmin = await Employee.findOne({ role: 'admin', isDeleted: false });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: 'Admin already exists. Use /login instead.'
        });
      }

      // ✅ Create Main Branch if not exists
      let mainBranch = await Branch.findOne({ name: 'Main Branch' });
      if (!mainBranch) {
        mainBranch = await Branch.create({
          name: 'Main Branch',
          location: 'Headquarters'
        });
        console.log('✅ Created Main Branch:', mainBranch._id);
      }

      // ✅ Force Main Branch for all admins
      const branchId = mainBranch._id;

      // ✅ Create first admin (password hashed by model pre-save hook)
      const admin = await Employee.create({
        username: adminUsername,
        fullName: normalizedName,
        email: normalizedEmail || undefined,
        phone: normalizedPhone,
        password,
        role: 'admin',
        branch: branchId,
        createdBy: null
      });

      // ✅ Generate token
      const token = generateToken(admin._id);

      // 🎉 Populate and return
      const populatedAdmin = await Employee.findById(admin._id)
        .populate('branch')
        .select('-password -failedLoginAttempts -lockUntil');

      console.log('✅ First admin created:', adminUsername);

      res.status(201).json({
        success: true,
        message: 'Admin registered successfully! Use this token to access admin features.',
        token,
        admin: {
          id: populatedAdmin._id,
          username: populatedAdmin.username,
          fullName: populatedAdmin.fullName,
          email: populatedAdmin.email,
          phone: populatedAdmin.phone,
          role: populatedAdmin.role,
          branch: populatedAdmin.branch?._id,
          branchName: populatedAdmin.branch?.name
        }
      });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }
    console.error('❌ Register admin error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }
    const employee = req.employee;
    const isMatch = await comparePassword(currentPassword, employee.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }
    employee.password = newPassword;
    await employee.save();
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { 
  login,
  registerAdmin,
  changePassword,
  me: async (req, res) => {
    try {
      const employee = req.employee;
      if (!employee) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token.'
        });
      }

      res.status(200).json({
        success: true,
        employee: {
          id: employee._id,
          username: employee.username,
          fullName: employee.fullName,
          email: employee.email,
          phone: employee.phone,
          role: employee.role,
          roleLabel: employee.roleLabel,
          branch: employee.branch?._id,
          branchName: employee.branch?.name
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};
