const express = require('express');
const {
    createEmployee,
    getEmployees,
    getEmployeeById,
    updateEmployee,
    disableEmployee,
    updateEmployeeStatus,
    deleteEmployee
} = require('../controllers/employeeController');

const authMiddleware = require('../middleware/auth');
const { adminOnly } = require('../middleware/roles'); 
const { validate, schemas } = require('../middleware/validate'); 

const router = express.Router();

router.use(authMiddleware);

// Admin only
router.use(adminOnly);

router
    .route('/')
    .post(validate(schemas.employeeCreate), createEmployee)
    .get(getEmployees);

router
    .route('/:id')
    .get(getEmployeeById)
    .put(validate(schemas.employeeUpdate), updateEmployee)
    .delete(deleteEmployee);

router.patch('/:id/disable', disableEmployee);
router.patch('/:id/status', updateEmployeeStatus);

module.exports = router;