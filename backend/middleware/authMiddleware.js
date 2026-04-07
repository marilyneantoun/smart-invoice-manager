// ============================================================
// middleware/authMiddleware.js
//
// Two middleware functions used to protect routes:
//
//   protect(req, res, next)
//     → Verifies the JWT from the Authorization header.
//     → Attaches the decoded user object to req.user.
//     → Returns 401 if token is missing, expired, or invalid.
//
//   allowRoles(...roles)
//     → Returns a middleware that checks req.user.role_name
//       against the list of allowed roles.
//     → Returns 403 if the user's role is not permitted.
//
// Usage in a route file:
//   const { protect, allowRoles } = require('../middleware/authMiddleware');
//   router.get('/admin-only', protect, allowRoles('Admin'), handler);
// ============================================================

const jwt = require('jsonwebtoken');
require('dotenv').config();

// ---- Verify JWT and attach user to request ----
function protect(req, res, next) {
  // Expect:  Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided. Please log in.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { user_id, full_name, email, role_name }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token is invalid or has expired.' });
  }
}

// ---- Check that the logged-in user has one of the allowed roles ----
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    if (!roles.includes(req.user.role_name)) {
      return res.status(403).json({
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }

    next();
  };
}

module.exports = { protect, allowRoles };
