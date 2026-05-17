// ============================================================
// routes/fraudRuleRoutes.js
//
// Fraud Rules configuration API.
// Used by the System Configuration page → Fraud Rules tab.
//
// Endpoints:
//   GET   /api/fraud-rules               — list all rules (with search/filter)
//   GET   /api/fraud-rules/:id/history   — change history for one rule
//   PATCH /api/fraud-rules/:id/toggle    — enable / disable a rule
//   PATCH /api/fraud-rules/:id/weight    — update a rule's risk weight
//
// Access: Admin only for mutations; Admin + Accountant + Auditor for reads.
// ============================================================

const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { protect, allowRoles } = require('../middleware/authMiddleware');

// ── Helpers ────────────────────────────────────────────────

/**
 * Map a raw DB row into the shape the frontend expects.
 */
function formatRule(row) {
  return {
    rule_id:     row.rule_id,
    rule_name:   row.rule_name,
    description: row.description,
    is_active:   Boolean(row.is_active),
    risk_weight: row.risk_weight,
    created_at:  row.created_at,
    created_by:  row.created_by_name || null,
  };
}

/**
 * Map a history row into the shape the drawer expects.
 * The DB schema uses action_type/field_name/reason — we expose them
 * as the friendlier names the frontend already uses.
 */
function formatHistory(row) {
  // Normalise the action label for the frontend drawer:
  //   - 'Enabled'                              → 'enabled'
  //   - 'Disabled'                             → 'disabled'
  //   - 'Updated' on field 'risk_weight'       → 'weight_changed'
  //   - 'Updated' on anything else             → 'updated'
  let action = (row.action_type || '').toLowerCase();
  if (action === 'updated' && row.field_name === 'risk_weight') {
    action = 'weight_changed';
  }

  return {
    history_id:      row.history_id,
    rule_id:         row.rule_id,
    changed_at:      row.changed_at,
    action,
    field_name:      row.field_name,
    old_value:       row.old_value,
    new_value:       row.new_value,
    change_reason:   row.reason,
    changed_by_name: row.changed_by_name || 'System',
  };
}

// ── GET /api/fraud-rules ───────────────────────────────────
// Returns all rules, optional ?search= ?status= ?weight= filters.
//   status: 'enabled' | 'disabled' | '' (all)
//   weight: 'low' (1–15) | 'medium' (16–40) | 'high' (41+) | '' (all)
router.get(
  '/',
  protect,
  allowRoles('Admin', 'Accountant', 'Auditor'),
  async (req, res) => {
    try {
      const { search = '', status = '', weight = '' } = req.query;

      const conditions = [];
      const params     = [];

      if (search.trim()) {
        conditions.push('(fr.rule_name LIKE ? OR fr.description LIKE ?)');
        params.push(`%${search.trim()}%`, `%${search.trim()}%`);
      }

      if (status === 'enabled') {
        conditions.push('fr.is_active = TRUE');
      } else if (status === 'disabled') {
        conditions.push('fr.is_active = FALSE');
      }

      if (weight === 'low') {
        conditions.push('fr.risk_weight BETWEEN 1 AND 15');
      } else if (weight === 'medium') {
        conditions.push('fr.risk_weight BETWEEN 16 AND 40');
      } else if (weight === 'high') {
        conditions.push('fr.risk_weight >= 41');
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const [rows] = await pool.query(
        `SELECT
           fr.rule_id,
           fr.rule_name,
           fr.description,
           fr.is_active,
           fr.risk_weight,
           fr.created_at,
           u.full_name AS created_by_name
         FROM fraud_rule fr
         LEFT JOIN \`user\` u ON u.user_id = fr.created_by
         ${where}
         ORDER BY fr.rule_id ASC`,
        params
      );

      res.json({
        total: rows.length,
        rules: rows.map(formatRule),
      });
    } catch (err) {
      console.error('[GET /api/fraud-rules]', err);
      res.status(500).json({ message: 'Failed to load fraud rules.' });
    }
  }
);

// ── GET /api/fraud-rules/:id/history ──────────────────────
router.get(
  '/:id/history',
  protect,
  allowRoles('Admin', 'Accountant', 'Auditor'),
  async (req, res) => {
    const { id } = req.params;
    try {
      const [rows] = await pool.query(
        `SELECT
           h.history_id,
           h.rule_id,
           h.changed_at,
           h.action_type,
           h.field_name,
           h.old_value,
           h.new_value,
           h.reason,
           u.full_name AS changed_by_name
         FROM fraud_rule_history h
         LEFT JOIN \`user\` u ON u.user_id = h.changed_by
         WHERE h.rule_id = ?
         ORDER BY h.changed_at DESC`,
        [id]
      );

      res.json({ history: rows.map(formatHistory) });
    } catch (err) {
      console.error('[GET /api/fraud-rules/:id/history]', err);
      res.status(500).json({ message: 'Failed to load rule history.' });
    }
  }
);

// ── PATCH /api/fraud-rules/:id/toggle ─────────────────────
// Body: { is_active: true | false }
router.patch(
  '/:id/toggle',
  protect,
  allowRoles('Admin'),
  async (req, res) => {
    const { id }        = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'is_active must be a boolean.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[rule]] = await conn.query(
        'SELECT rule_id, rule_name, is_active FROM fraud_rule WHERE rule_id = ?',
        [id]
      );
      if (!rule) {
        await conn.rollback();
        return res.status(404).json({ message: 'Rule not found.' });
      }

      if (Boolean(rule.is_active) === is_active) {
        await conn.rollback();
        return res.json({ message: 'No change — rule is already in that state.' });
      }

      // Update the rule
      await conn.query(
        'UPDATE fraud_rule SET is_active = ? WHERE rule_id = ?',
        [is_active, id]
      );

      // Write audit entry using REAL column names
      await conn.query(
        `INSERT INTO fraud_rule_history
           (rule_id, action_type, field_name, old_value, new_value, reason, changed_by, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          id,
          is_active ? 'Enabled' : 'Disabled',
          'is_active',
          is_active ? 'false' : 'true',
          is_active ? 'true'  : 'false',
          is_active ? 'Rule enabled by admin.' : 'Rule disabled by admin.',
          req.user.user_id,
        ]
      );

      await conn.commit();

      res.json({
        message:   `Rule "${rule.rule_name}" ${is_active ? 'enabled' : 'disabled'} successfully.`,
        rule_id:   Number(id),
        is_active,
      });
    } catch (err) {
      await conn.rollback();
      console.error('[PATCH /api/fraud-rules/:id/toggle]', err);
      res.status(500).json({ message: 'Failed to toggle rule.' });
    } finally {
      conn.release();
    }
  }
);

// ── PATCH /api/fraud-rules/:id/weight ─────────────────────
// Body: { risk_weight: number }
router.patch(
  '/:id/weight',
  protect,
  allowRoles('Admin'),
  async (req, res) => {
    const { id }          = req.params;
    const { risk_weight } = req.body;

    const w = Number(risk_weight);
    if (!Number.isInteger(w) || w < 1 || w > 100) {
      return res
        .status(400)
        .json({ message: 'risk_weight must be an integer between 1 and 100.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[rule]] = await conn.query(
        'SELECT rule_id, rule_name, risk_weight FROM fraud_rule WHERE rule_id = ?',
        [id]
      );
      if (!rule) {
        await conn.rollback();
        return res.status(404).json({ message: 'Rule not found.' });
      }

      if (rule.risk_weight === w) {
        await conn.rollback();
        return res.json({ message: 'No change — weight is already that value.' });
      }

      await conn.query(
        'UPDATE fraud_rule SET risk_weight = ? WHERE rule_id = ?',
        [w, id]
      );

      await conn.query(
        `INSERT INTO fraud_rule_history
           (rule_id, action_type, field_name, old_value, new_value, reason, changed_by, changed_at)
         VALUES (?, 'Updated', 'risk_weight', ?, ?, ?, ?, NOW())`,
        [
          id,
          String(rule.risk_weight),
          String(w),
          `Risk weight updated from ${rule.risk_weight} to ${w} by admin.`,
          req.user.user_id,
        ]
      );

      await conn.commit();

      res.json({
        message:     `Weight for "${rule.rule_name}" updated to ${w}.`,
        rule_id:     Number(id),
        risk_weight: w,
      });
    } catch (err) {
      await conn.rollback();
      console.error('[PATCH /api/fraud-rules/:id/weight]', err);
      res.status(500).json({ message: 'Failed to update risk weight.' });
    } finally {
      conn.release();
    }
  }
);

module.exports = router;
