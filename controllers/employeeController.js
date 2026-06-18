const Employee = require('../models/Employee');
const Branch = require('../models/Branch');
const { createLog } = require('../utils/helpers');
const { hashPassword } = require('../utils/authhelper');
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

// @desc    Create employee (admin only)
const createEmployee = async (req, res) => {
  try {
    let { username, password, role, roleLabel, fullName, email, phone, branch: branchLocation } = req.body;
    const createdBy = req.employee._id;

    if (!username || !password || !role || !branchLocation) {
      return res.status(400).json({
        success: false,
        message: 'username, password, role, and branch are required'
      });
    }

    // ✅ Force lowercase username
    username = username.toLowerCase();

    // ✅ Find branch by location or name
    const branch = await resolveBranch(branchLocation);
    if (!branch) {
      return res.status(400).json({
        success: false,
        message: `Branch "${branchLocation}" not found`
      });
    }

    // ✅ Auto-assign Main Branch for admins (Headquarters)
    const finalBranchId =
      role === 'admin'
        ? (await Branch.findOne({ location: 'Headquarters', isDeleted: false }) || branch)._id
        : branch._id;

    // ✅ Create employee (password hashed by model pre-save hook)
    const employee = await Employee.create({
      username,
      fullName: fullName || undefined,
      email: email ? String(email).toLowerCase() : undefined,
      phone: phone || undefined,
      password,
      role,
      roleLabel,
      branch: finalBranchId,
      createdBy
    });

    // ✅ Create log
    await createLog({
      action: 'create_employee',
      userId: createdBy,
      branchId: finalBranchId,
      message: `${req.employee.username} created employee ${username} at ${branchLocation}`
    });

    const populatedEmployee = await Employee.findById(employee._id)
      .populate('branch')
      .select('-password');

    res.status(201).json({
      success: true,
      employee: populatedEmployee
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all employees (admin only, paginated)
const getEmployees = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { isDeleted: false };

    const employees = await Employee.find(filter)
      .populate('branch', 'name location')
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Employee.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: employees.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: employees
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get employee by ID (admin only)
const getEmployeeById = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id)
      .populate('branch', 'name location')
      .select('-password');

    if (!employee || employee.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.status(200).json({
      success: true,
      employee
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update employee (admin only)
const updateEmployee = async (req, res) => {
  try {
    const updates = req.body;
    const updaterId = req.employee._id;
    const employeeId = req.params.id;

    const employee = await Employee.findById(employeeId);
    if (!employee || employee.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // ✅ Hash password if provided
    if (updates.password) {
      updates.password = await hashPassword(updates.password);
    }

    // ✅ Force lowercase username if updated
    if (updates.username) {
      updates.username = updates.username.toLowerCase();
    }

    if (updates.email) {
      updates.email = String(updates.email).toLowerCase();
    }

    // ✅ Handle branch update
    if (updates.branch) {
      const branch = await resolveBranch(updates.branch);
      if (!branch) {
        return res.status(400).json({
          success: false,
          message: `Branch "${updates.branch}" not found`
        });
      }
      updates.branch =
        updates.role === 'admin' || employee.role === 'admin'
          ? (await Branch.findOne({ location: 'Headquarters', isDeleted: false }) || branch)._id
          : branch._id;
    }

    const updatedEmployee = await Employee.findByIdAndUpdate(employeeId, updates, {
      new: true,
      runValidators: true
    }).populate('branch');

    await createLog({
      action: 'update_employee',
      userId: updaterId,
      branchId: employee.branch,
      message: `${req.employee.username} updated employee ${employee.username}`
    });

    res.status(200).json({
      success: true,
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Disable employee (admin only)
const disableEmployee = async (req, res) => {
  try {
    const employeeId = req.params.id;
    const updaterId = req.employee._id;

    const employee = await Employee.findById(employeeId);
    if (!employee || employee.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    employee.isActive = false;
    await employee.save();

    await createLog({
      action: 'disable_employee',
      userId: updaterId,
      branchId: employee.branch,
      message: `${req.employee.username} disabled employee ${employee.username}`
    });

    res.status(200).json({
      success: true,
      message: 'Employee disabled successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update employee status (admin only)
const updateEmployeeStatus = async (req, res) => {
  try {
    const employeeId = req.params.id;
    const updaterId = req.employee._id;
    const status = String(req.body.status || '').toLowerCase();

    const employee = await Employee.findById(employeeId);
    if (!employee || employee.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    employee.isActive = status !== 'inactive';
    await employee.save();

    await createLog({
      action: employee.isActive ? 'update_employee' : 'disable_employee',
      userId: updaterId,
      branchId: employee.branch,
      message: `${req.employee.username} set employee ${employee.username} to ${employee.isActive ? 'active' : 'inactive'}`
    });

    const populatedEmployee = await Employee.findById(employeeId)
      .populate('branch');

    res.status(200).json({
      success: true,
      employee: populatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Soft delete employee (admin only)
const deleteEmployee = async (req, res) => {
  try {
    const employeeId = req.params.id;
    const deleterId = req.employee._id;

    const employee = await Employee.findById(employeeId);
    if (!employee || employee.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    employee.isDeleted = true;
    employee.deletedAt = new Date();
    employee.deletedBy = deleterId;
    employee.isActive = false;
    await employee.save();

    await createLog({
      action: 'disable_employee',
      userId: deleterId,
      branchId: employee.branch,
      message: `${req.employee.username} deleted employee ${employee.username}`
    });

    res.status(200).json({
      success: true,
      message: 'Employee deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  disableEmployee,
  updateEmployeeStatus,
  deleteEmployee
};