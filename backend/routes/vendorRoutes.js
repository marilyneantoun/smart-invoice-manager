// ============================================================
// routes/vendorRoutes.js
//
// Vendor-related endpoints (Administration page + invoice flows).
//
//   GET    /api/vendors            — list vendors (filterable)
//   GET    /api/vendors/:id        — single vendor detail
//   POST   /api/vendors            — create vendor   (Admin)
//   PUT    /api/vendors/:id        — update vendor   (Admin)
//   PATCH  /api/vendors/:id/status — toggle is_active (Admin)
//   PATCH  /api/vendors/:id/approve — toggle is_approved (Admin)
//
// Columns are aliased so the frontend can read:
//   v.currency      (DB: default_currency)
//   v.created_at    (DB: registration_date)
// ...without any changes on the client.
//
// All routes are protected (require JWT).
// ============================================================

const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { protect, allowRoles } = require('../middleware/authMiddleware');

// Reusable SELECT projection (single source of truth for shape)
const VENDOR_COLUMNS = `
  vendor_id,
  vendor_name,
  vendor_code,
  email,
  phone_number,
  address,
  country,
  default_currency               AS currency,
  default_currency,
  is_active,
  is_approved,
  registration_date              AS created_at,
  registration_date,
  created_by
`;

// ── GET /api/vendors ──
// Query params:
//   ?approved=true   → only is_approved = TRUE
//   ?active=true     → only is_active   = TRUE
router.get('/', protect, async (req, res) => {
  try {
    let sql = `SELECT ${VENDOR_COLUMNS} FROM vendor WHERE 1=1`;
    const params = [];

    if (req.query.approved === 'true') sql += ' AND is_approved = TRUE';
    if (req.query.active   === 'true') sql += ' AND is_active   = TRUE';

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
      `SELECT ${VENDOR_COLUMNS} FROM vendor WHERE vendor_id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Vendor not found.' });
    return res.status(200).json({ vendor: rows[0] });
  } catch (err) {
    console.error('GET /vendors/:id error:', err);
    return res.status(500).json({ message: 'Failed to fetch vendor.' });
  }
});

// ── POST /api/vendors ──  (Admin only)
// Body:
//   { vendor_name, vendor_code, email, phone_number?, address?,
//     country?, default_currency?, is_approved? }
router.post('/', protect, allowRoles('Admin'), async (req, res) => {
  try {
    const {
      vendor_name,
      vendor_code,
      email,
      phone_number     = null,
      address          = null,
      country          = null,
      default_currency = 'USD',
      is_approved      = false,
    } = req.body || {};

    if (!vendor_name || !vendor_code || !email) {
      return res.status(400).json({
        message: 'vendor_name, vendor_code, and email are required.',
      });
    }

    // Reject duplicates up front for friendlier errors
    const [dup] = await pool.query(
      'SELECT vendor_id FROM vendor WHERE vendor_code = ? OR email = ? LIMIT 1',
      [vendor_code, email]
    );
    if (dup.length) {
      return res.status(409).json({
        message: 'A vendor with that code or email already exists.',
      });
    }

    const [result] = await pool.query(
      `INSERT INTO vendor
         (vendor_name, vendor_code, email, phone_number, address,
          country, default_currency, is_active, is_approved, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
      [
        vendor_name, vendor_code, email, phone_number, address,
        country, default_currency, !!is_approved, req.user.user_id,
      ]
    );

    const [rows] = await pool.query(
      `SELECT ${VENDOR_COLUMNS} FROM vendor WHERE vendor_id = ? LIMIT 1`,
      [result.insertId]
    );
    return res.status(201).json({ vendor: rows[0] });
  } catch (err) {
    console.error('POST /vendors error:', err);
    return res.status(500).json({ message: 'Failed to create vendor.' });
  }
});

// ── PUT /api/vendors/:id ──  (Admin only)
router.put('/:id', protect, allowRoles('Admin'), async (req, res) => {
  try {
    const id = req.params.id;

    // Only the columns we actually allow to be patched
    const allowed = [
      'vendor_name', 'vendor_code', 'email', 'phone_number',
      'address', 'country', 'default_currency', 'is_approved', 'is_active',
    ];
    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        sets.push(`${key} = ?`);
        params.push(req.body[key]);
      }
    }
    if (!sets.length) {
      return res.status(400).json({ message: 'No updatable fields supplied.' });
    }

    params.push(id);
    const [result] = await pool.query(
      `UPDATE vendor SET ${sets.join(', ')} WHERE vendor_id = ?`,
      params
    );
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Vendor not found.' });
    }

    const [rows] = await pool.query(
      `SELECT ${VENDOR_COLUMNS} FROM vendor WHERE vendor_id = ? LIMIT 1`,
      [id]
    );
    return res.status(200).json({ vendor: rows[0] });
  } catch (err) {
    console.error('PUT /vendors/:id error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'Vendor code or email already in use.',
      });
    }
    return res.status(500).json({ message: 'Failed to update vendor.' });
  }
});

// ── PATCH /api/vendors/:id/status ──  (Admin only)
// Body: { is_active: true|false }   — soft activate / deactivate.
// Falls back to a toggle if no body is supplied.
router.patch('/:id/status', protect, allowRoles('Admin'), async (req, res) => {
  try {
    const id = req.params.id;

    const [rows] = await pool.query(
      'SELECT is_active FROM vendor WHERE vendor_id = ? LIMIT 1',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Vendor not found.' });

    const next = (req.body && typeof req.body.is_active === 'boolean')
      ? req.body.is_active
      : !rows[0].is_active;

    await pool.query(
      'UPDATE vendor SET is_active = ? WHERE vendor_id = ?',
      [next, id]
    );

    const [updated] = await pool.query(
      `SELECT ${VENDOR_COLUMNS} FROM vendor WHERE vendor_id = ? LIMIT 1`,
      [id]
    );
    return res.status(200).json({ vendor: updated[0] });
  } catch (err) {
    console.error('PATCH /vendors/:id/status error:', err);
    return res.status(500).json({ message: 'Failed to update vendor status.' });
  }
});

// ── PATCH /api/vendors/:id/approve ──  (Admin only)
// Body: { is_approved: true|false }  — approve / unapprove.
router.patch('/:id/approve', protect, allowRoles('Admin'), async (req, res) => {
  try {
    const id = req.params.id;

    const [rows] = await pool.query(
      'SELECT is_approved FROM vendor WHERE vendor_id = ? LIMIT 1',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Vendor not found.' });

    const next = (req.body && typeof req.body.is_approved === 'boolean')
      ? req.body.is_approved
      : !rows[0].is_approved;

    await pool.query(
      'UPDATE vendor SET is_approved = ? WHERE vendor_id = ?',
      [next, id]
    );

    const [updated] = await pool.query(
      `SELECT ${VENDOR_COLUMNS} FROM vendor WHERE vendor_id = ? LIMIT 1`,
      [id]
    );
    return res.status(200).json({ vendor: updated[0] });
  } catch (err) {
    console.error('PATCH /vendors/:id/approve error:', err);
    return res.status(500).json({ message: 'Failed to update approval status.' });
  }
});

module.exports = router;