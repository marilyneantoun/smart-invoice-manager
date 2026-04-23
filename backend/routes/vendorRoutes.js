// ============================================================
// routes/vendorRoutes.js
//
// Vendor-related endpoints.
//
//   GET /api/vendors          — list vendors (filterable)
//   GET /api/vendors/:id      — single vendor detail
//
// All routes are protected (require JWT).
// ============================================================

const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { protect } = require('../middleware/authMiddleware');

// ── GET /api/vendors ──
// Query params:
//   ?approved=true   → only is_approved = TRUE
//   ?active=true     → only is_active   = TRUE
//   (both default to no filter if omitted)
router.get('/', protect, async (req, res) => {
  try {
    let sql = 'SELECT * FROM vendor WHERE 1=1';
    const params = [];

    if (req.query.approved === 'true') {
      sql += ' AND is_approved = TRUE';
    }
    if (req.query.active === 'true') {
      sql += ' AND is_active = TRUE';
    }

    sql += ' ORDER BY vendor_name ASC';

    const [rows] = await pool.query(sql, params);

    return res.status(200).json({ vendors: rows });
  } catch (err) {
    console.error('GET /vendors error:', err);
    return res.status(500).json({ message: 'Failed to fetch vendors.' });
  }
});

// ── GET /api/vendors/:id ──
router.get('/:id', protect, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM vendor WHERE vendor_id = ? LIMIT 1',
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: 'Vendor not found.' });
    }

    return res.status(200).json({ vendor: rows[0] });
  } catch (err) {
    console.error('GET /vendors/:id error:', err);
    return res.status(500).json({ message: 'Failed to fetch vendor.' });
  }
});

module.exports = router;
