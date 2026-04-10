// ============================================================
// routes/dashboardRoutes.js
// Dashboard API — serves all data needed by the Dashboard page.
// All routes require authentication (any role can view).
// ============================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { protect } = require('../middleware/authMiddleware');

// ---- GET /api/dashboard ----
// Returns every piece of data the Dashboard page needs in one call.
router.get('/', protect, async (req, res) => {
  try {
    // 1) KPI Cards
    const [[kpiRow]] = await pool.query(`
      SELECT
        COUNT(*)                                                          AS total_invoices,
        SUM(CASE WHEN i.status = 'Pending'  THEN 1 ELSE 0 END)           AS pending_review,
        SUM(CASE WHEN i.status = 'Approved' THEN i.amount ELSE 0 END)    AS approved_total
      FROM invoice i
    `);

    // Fraud rate = invoices with Medium or High risk / total × 100
    const [[fraudRow]] = await pool.query(`
      SELECT COUNT(*) AS flagged_count
      FROM fraud_analysis fa
      WHERE fa.risk_level IN ('Medium', 'High')
    `);

    const totalInvoices = kpiRow.total_invoices || 0;
    const fraudRate = totalInvoices > 0
      ? Math.round((fraudRow.flagged_count / totalInvoices) * 100)
      : 0;

    // 2) Monthly Invoice Volume (stacked bar chart)
    //    Group by month of invoice_date, then pivot by status
    const [monthlyRows] = await pool.query(`
      SELECT
        DATE_FORMAT(i.invoice_date, '%Y-%m')                              AS month_key,
        DATE_FORMAT(i.invoice_date, '%b')                                 AS month_label,
        SUM(CASE WHEN i.status = 'Approved' THEN 1 ELSE 0 END)           AS approved,
        SUM(CASE WHEN i.status = 'Flagged'  THEN 1 ELSE 0 END)           AS flagged,
        SUM(CASE WHEN i.status = 'Rejected' THEN 1 ELSE 0 END)           AS rejected,
        SUM(CASE WHEN i.status = 'Pending'  THEN 1 ELSE 0 END)           AS pending
      FROM invoice i
      GROUP BY month_key, month_label
      ORDER BY month_key ASC
    `);

    // 3) Invoice Status Distribution (donut chart)
    const [statusRows] = await pool.query(`
      SELECT i.status, COUNT(*) AS count
      FROM invoice i
      GROUP BY i.status
    `);

    // 4) Top 5 Vendors by invoice count
    const [vendorRows] = await pool.query(`
      SELECT v.vendor_name, COUNT(*) AS invoice_count
      FROM invoice i
      JOIN vendor v ON i.vendor_id = v.vendor_id
      GROUP BY v.vendor_id, v.vendor_name
      ORDER BY invoice_count DESC
      LIMIT 5
    `);

    // 5) Top 5 Most Triggered Fraud Rules
    const [ruleRows] = await pool.query(`
      SELECT fr.rule_name, fr.risk_weight, COUNT(*) AS trigger_count
      FROM fraud_reason frs
      JOIN fraud_rule fr ON frs.rule_id = fr.rule_id
      GROUP BY fr.rule_id, fr.rule_name, fr.risk_weight
      ORDER BY trigger_count DESC
      LIMIT 5
    `);

    // 6) Risk Level Breakdown
    const [riskRows] = await pool.query(`
      SELECT
        fa.risk_level,
        COUNT(*) AS count
      FROM fraud_analysis fa
      GROUP BY fa.risk_level
    `);

    // Build risk map
    const riskBreakdown = { Low: 0, Medium: 0, High: 0 };
    riskRows.forEach(r => { riskBreakdown[r.risk_level] = r.count; });

    // Build status map
    const statusMap = { Approved: 0, Rejected: 0, Flagged: 0, Pending: 0 };
    statusRows.forEach(r => { statusMap[r.status] = r.count; });

    // Human review rate: always 100% by design
    const humanReviewRate = 100;

    res.json({
      kpis: {
        total_invoices: totalInvoices,
        pending_review: kpiRow.pending_review || 0,
        fraud_rate: fraudRate,
        approved_total: parseFloat(kpiRow.approved_total) || 0,
      },
      monthly_volume: monthlyRows.map(r => ({
        month: r.month_label,
        approved: r.approved,
        flagged: r.flagged,
        rejected: r.rejected,
        pending: r.pending,
      })),
      status_distribution: statusMap,
      top_vendors: vendorRows.map(r => ({
        name: r.vendor_name,
        count: r.invoice_count,
      })),
      top_rules: ruleRows.map(r => ({
        name: r.rule_name,
        weight: r.risk_weight,
        count: r.trigger_count,
      })),
      risk_breakdown: riskBreakdown,
      human_review_rate: humanReviewRate,
    });
  } catch (err) {
    console.error('Dashboard query error:', err);
    res.status(500).json({ message: 'Failed to load dashboard data.' });
  }
});

module.exports = router;
