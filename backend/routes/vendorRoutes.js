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

// ── POST /api/vendors/request ──
// Accountant requests approval for a new vendor that doesn't yet exist
// in the approved list. Creates a vendor row with is_approved = FALSE,
// is_active = TRUE, and created_by = current user. The admin will see
// it in Vendor Management (filterable by is_approved = FALSE) and can
// fill in the remaining details before approving.
router.post('/request', protect, async (req, res) => {
  try {
    const { vendor_name, country, default_currency } = req.body;

    // Basic validation
    if (!vendor_name || !vendor_name.trim()) {
      return res.status(400).json({ message: 'Vendor name is required.' });
    }
    if (!default_currency || !['USD', 'EUR'].includes(default_currency)) {
      return res.status(400).json({ message: 'A valid default currency (USD or EUR) is required.' });
    }

    const cleanName = vendor_name.trim();

    // Check if a vendor with this name already exists (case-insensitive)
    const [existing] = await pool.query(
      'SELECT vendor_id, vendor_name, is_approved FROM vendor WHERE LOWER(vendor_name) = LOWER(?) LIMIT 1',
      [cleanName]
    );
    if (existing.length > 0) {
      const v = existing[0];
      return res.status(409).json({
        message: v.is_approved
          ? `A vendor named "${v.vendor_name}" already exists and is approved. Please refresh the page and select it from the dropdown.`
          : `A request for "${v.vendor_name}" has already been submitted and is awaiting admin approval.`,
        existing_vendor_id: v.vendor_id,
        already_approved: !!v.is_approved,
      });
    }

    // Generate placeholder unique values for vendor_code and email
    // (schema requires them NOT NULL + UNIQUE; admin will fill in real values on approval)
    const ts = Date.now();
    const placeholderCode  = `REQ-${ts}`;
    const placeholderEmail = `pending+${ts}@invoiceshield.local`;

    const [result] = await pool.query(
      `INSERT INTO vendor
        (vendor_name, vendor_code, email, country, default_currency,
         is_active, is_approved, registration_date, created_by)
       VALUES (?, ?, ?, ?, ?, TRUE, FALSE, NOW(), ?)`,
      [
        cleanName,
        placeholderCode,
        placeholderEmail,
        country?.trim() || null,
        default_currency,
        req.user.user_id,
      ]
    );

    return res.status(201).json({
      message: 'Vendor approval request submitted.',
      vendor_id: result.insertId,
      vendor_name: cleanName,
    });
  } catch (err) {
    console.error('POST /vendors/request error:', err);
    return res.status(500).json({ message: 'Failed to submit vendor request.' });
  }
});

module.exports = router;
