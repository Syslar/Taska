import { body } from 'express-validator';

/**
 * Auth route validators — using express-validator.
 * Applied before every route handler. Errors are checked with validationResult().
 */

// POST /auth/send-otp
export const sendOtpValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('A valid email address is required.')
    .normalizeEmail(),
];

// POST /auth/verify-otp
export const verifyOtpValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('A valid email address is required.')
    .normalizeEmail(),
  body('token')
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be exactly 6 digits.')
    .isNumeric()
    .withMessage('OTP must be numeric.'),
];

// POST /auth/register  (called after verify-otp succeeds)
export const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters.')
    .matches(/^[a-z0-9_]+$/i)
    .withMessage('Username may only contain letters, numbers, and underscores.'),
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required.')
    .escape(),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required.')
    .escape(),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required.'),
  body('role')
    .isIn(['POSTER', 'TASKER'])
    .withMessage('Role must be POSTER or TASKER.'),
];

// POST /auth/refresh
export const refreshValidation = [
  body('refresh_token')
    .notEmpty()
    .withMessage('refresh_token is required.'),
];
