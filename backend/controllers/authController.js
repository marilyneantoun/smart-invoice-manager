// ============================================================
// controllers/authController.js
//
// Handles all authentication logic:
//
//   login  (POST /api/auth/login)
//   logout (POST /api/auth/logout)   — requires token
//   getMe  (GET  /api/auth/me)       — requires token
// ============================================================

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');
require('dotenv').config();

// ============================================================
// POST /api/auth/login
//
// Body: { email, password }
//
// Flow:
//  1. Look up user by email (must exist + be active)
//  2. Compare submitted password against stored bcrypt hash
//  3. Generate a JWT containing user info + role
//  4. Store a hash of the token in auth_token table
//  5. Return token + user info to the frontend
// ============================================================
async function login(req, res) {
  const { email, password } = req.body;

  // Basic input check
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    // 1. Find user + their role name in one query
    const [rows] = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.password_hash,
              u.is_active, r.role_name
       FROM \`user\` u
       JOIN role r ON u.role_id = r.role_id
       WHERE u.email = ?
       LIMIT 1`,
      [email]
    );

    const user = rows[0];

    // User not found
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Account is deactivated
    if (!user.is_active) {
      return res.status(403).json({ message: 'Your account has been deactivated. Contact an administrator.' });
    }

    // 2. Check password
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // 3. Create JWT — expires in 8 hours (set in .env)
    const payload = {
      user_id:   user.user_id,
      full_name: user.full_name,
      email:     user.email,
      role_name: user.role_name,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    // 4. Store a hash of the token in auth_token table
    //    (so we can revoke it on logout)
    const tokenHash   = await bcrypt.hash(token, 5); // low cost — just for storage
    const expiresAt   = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours from now

    await pool.query(
      `INSERT INTO auth_token (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [user.user_id, tokenHash, expiresAt]
    );

    // 5. Return token + safe user info (never return password_hash)
    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        user_id:   user.user_id,
        full_name: user.full_name,
        email:     user.email,
        role_name: user.role_name,
      },
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error. Please try again.' });
  }
}


// ============================================================
// POST /api/auth/logout
// Protected — requires valid JWT
//
// Marks ALL active tokens for this user as revoked.
// The frontend should also delete the token from localStorage.
// ============================================================
async function logout(req, res) {
  try {
    await pool.query(
      `UPDATE auth_token
       SET is_revoked = TRUE
       WHERE user_id = ? AND is_revoked = FALSE`,
      [req.user.user_id]
    );

    return res.status(200).json({ message: 'Logged out successfully.' });

  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ message: 'Server error during logout.' });
  }
}


// ============================================================
// GET /api/auth/me
// Protected — requires valid JWT
//
// Returns the currently logged-in user's profile.
// Useful for the frontend to re-hydrate user state on refresh.
// ============================================================
async function getMe(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.is_active,
              u.created_at, r.role_name
       FROM \`user\` u
       JOIN role r ON u.role_id = r.role_id
       WHERE u.user_id = ?
       LIMIT 1`,
      [req.user.user_id]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ user: rows[0] });

  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}


module.exports = { login, logout, getMe };
