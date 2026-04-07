// ============================================================
// routes/authRoutes.js
//
// Registers all /api/auth/* endpoints.
//
//   POST /api/auth/login    — public
//   POST /api/auth/logout   — protected (needs JWT)
//   GET  /api/auth/me       — protected (needs JWT)
// ============================================================

const express    = require('express');
const router     = express.Router();
const { login, logout, getMe } = require('../controllers/authController');
const { protect }              = require('../middleware/authMiddleware');

// Public route — no token needed
router.post('/login',  login);

// Protected routes — must send Authorization: Bearer <token>
router.post('/logout', protect, logout);
router.get('/me',      protect, getMe);

module.exports = router;
