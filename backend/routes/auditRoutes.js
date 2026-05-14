// ============================================================
// routes/auditRoutes.js
//
// Audit Trail endpoints — global history across invoices & rules.
//
//   GET /api/audit/invoice-history    → paged invoice_history rows
//   GET /api/audit/rule-history       → paged fraud_rule_history rows
//   GET /api/audit/users              → distinct users that appear
//   GET /api/audit/stats              → KPI counts (today, status changes)
//
// All routes require JWT. Admin + Viewer only.
// ============================================================

const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { protect, allowRoles } = require('../middleware/authMiddleware');

router.use(protect, allowRoles('Admin', 'Viewer'));

/* ================================================================
   GET /api/audit/stats
   ================================================================ */
router.get('/stats', async (req, res) => {
  try {
    const [[todayRow]] = await pool.query(`
      SELECT COUNT(*) AS cnt
      FROM invoice_history
      WHERE DATE(changed_at) = CURDATE()
    `);

    const [[statusRow]] = await pool.query(`
      SELECT COUNT(*) AS cnt
      FROM invoice_history
      WHERE action_type IN ('Approved', 'Rejected', 'Flagged')
    `);

    return res.status(200).json({
      events_today:   todayRow.cnt  || 0,
      status_changes: statusRow.cnt || 0,
    });
  } catch (err) {
    console.error('GET /audit/stats error:', err);
    return res.status(500).json({ message: 'Failed to fetch audit stats.' });
  }
});

/* ================================================================
   GET /api/audit/users
   ================================================================ */
router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT u.user_id, u.full_name, r.role_name
      FROM user u
      INNER JOIN role r ON r.role_id = u.role_id
      WHERE u.user_id IN (
        SELECT changed_by FROM invoice_history
        UNION
        SELECT changed_by FROM fraud_rule_history
      )
      ORDER BY u.full_name ASC
    `);

    return res.status(200).json({ users: rows });
  } catch (err) {
    console.error('GET /audit/users error:', err);
    return res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

/* ================================================================
   GET /api/audit/invoice-history
   ================================================================ */
router.get('/invoice-history', async (req, res) => {
  try {
    const {
      search    = '',
      action    = '',
      user_id   = '',
      date_from = '',
      date_to   = '',
      page      = 1,
      limit     = 10,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const offset   = (pageNum - 1) * limitNum;

    const where  = [];
    const params = [];

    if (search) {
      where.push(`(
        i.invoice_number LIKE ?
        OR u.full_name LIKE ?
        OR ih.action_type LIKE ?
        OR ih.reason LIKE ?
      )`);
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    if (action) {
      where.push(`ih.action_type = ?`);
      params.push(action);
    }

    if (user_id) {
      where.push(`ih.changed_by = ?`);
      params.push(user_id);
    }

    if (date_from) {
      where.push(`DATE(ih.changed_at) >= ?`);
      params.push(date_from);
    }

    if (date_to) {
      where.push(`DATE(ih.changed_at) <= ?`);
      params.push(date_to);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM invoice_history ih
       INNER JOIN invoice i ON i.invoice_id = ih.invoice_id
       LEFT  JOIN vendor  v ON v.vendor_id  = i.vendor_id
       LEFT  JOIN user    u ON u.user_id    = ih.changed_by
       ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT
          ih.history_id,
          ih.invoice_id,
          i.invoice_number,
          v.vendor_name,
          ih.action_type,
          ih.old_status,
          ih.new_status,
          ih.reason,
          ih.changed_at,
          u.full_name AS changed_by_name,
          r.role_name AS changed_by_role
       FROM invoice_history ih
       INNER JOIN invoice i ON i.invoice_id = ih.invoice_id
       LEFT  JOIN vendor  v ON v.vendor_id  = i.vendor_id
       LEFT  JOIN user    u ON u.user_id    = ih.changed_by
       LEFT  JOIN role    r ON r.role_id    = u.role_id
       ${whereSql}
       ORDER BY ih.changed_at DESC, ih.history_id DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    return res.status(200).json({
      events: rows,
      total:  countRow.total || 0,
      page:   pageNum,
      limit:  limitNum,
    });
  } catch (err) {
    console.error('GET /audit/invoice-history error:', err);
    return res.status(500).json({ message: 'Failed to fetch invoice history.' });
  }
});

/* ================================================================
   GET /api/audit/rule-history
   ================================================================ */
router.get('/rule-history', async (req, res) => {
  try {
    const {
      search    = '',
      action    = '',
      rule_id   = '',
      user_id   = '',
      date_from = '',
      date_to   = '',
      page      = 1,
      limit     = 10,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const offset   = (pageNum - 1) * limitNum;

    const where  = [];
    const params = [];

    if (search) {
      where.push(`(
        fr.rule_name LIKE ?
        OR u.full_name LIKE ?
        OR frh.action_type LIKE ?
        OR frh.reason LIKE ?
      )`);
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    if (action) {
      where.push(`frh.action_type = ?`);
      params.push(action);
    }

    if (rule_id) {
      where.push(`frh.rule_id = ?`);
      params.push(rule_id);
    }

    if (user_id) {
      where.push(`frh.changed_by = ?`);
      params.push(user_id);
    }

    if (date_from) {
      where.push(`DATE(frh.changed_at) >= ?`);
      params.push(date_from);
    }

    if (date_to) {
      where.push(`DATE(frh.changed_at) <= ?`);
      params.push(date_to);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM fraud_rule_history frh
       INNER JOIN fraud_rule fr ON fr.rule_id = frh.rule_id
       LEFT  JOIN user       u  ON u.user_id  = frh.changed_by
       ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT
          frh.history_id,
          frh.rule_id,
          fr.rule_name,
          frh.action_type,
          frh.field_name,
          frh.old_value,
          frh.new_value,
          frh.reason,
          frh.changed_at,
          u.full_name AS changed_by_name,
          r.role_name AS changed_by_role
       FROM fraud_rule_history frh
       INNER JOIN fraud_rule fr ON fr.rule_id = frh.rule_id
       LEFT  JOIN user       u  ON u.user_id  = frh.changed_by
       LEFT  JOIN role       r  ON r.role_id  = u.role_id
       ${whereSql}
       ORDER BY frh.changed_at DESC, frh.history_id DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const [ruleList] = await pool.query(`
      SELECT rule_id, rule_name
      FROM fraud_rule
      ORDER BY rule_name ASC
    `);

    return res.status(200).json({
      events: rows,
      rules:  ruleList,
      total:  countRow.total || 0,
      page:   pageNum,
      limit:  limitNum,
    });
  } catch (err) {
    console.error('GET /audit/rule-history error:', err);
    return res.status(500).json({ message: 'Failed to fetch rule history.' });
  }
});

module.exports = router;
