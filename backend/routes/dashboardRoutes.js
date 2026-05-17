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
    /* ──────────────────────────────────────────────
       1) KPI counts
       ────────────────────────────────────────────── */
    const [[kpiRow]] = await pool.query(`
      SELECT
        COUNT(*)                                                  AS total_invoices,
        SUM(CASE WHEN status = 'Pending'  THEN 1 ELSE 0 END)      AS pending_review,
        SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END)      AS rejected_count
      FROM invoice
    `);

    const totalInvoices  = kpiRow.total_invoices  || 0;
    const pendingReview  = kpiRow.pending_review  || 0;
    const rejectedCount  = kpiRow.rejected_count  || 0;

    /* ──────────────────────────────────────────────
       2) Status distribution (donut chart)
       ────────────────────────────────────────────── */
    const [statusRows] = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM invoice
      GROUP BY status
    `);
    const statusMap = { Approved: 0, Rejected: 0, Flagged: 0, Pending: 0 };
    statusRows.forEach(r => { statusMap[r.status] = r.count; });

    /* ──────────────────────────────────────────────
       3) Risk level distribution
          Bands are DERIVED LIVE from fa.risk_score and current
          system_setting thresholds — single source of truth.
          Uses conditional aggregation (SUM(CASE)) instead of
          GROUP BY on a CASE expression, which avoids any collation
          quirks where the same label could be grouped into multiple
          buckets.
       ────────────────────────────────────────────── */
    const [[riskRow]] = await pool.query(`
      SELECT
        SUM(CASE WHEN fa.risk_score <= s.low_risk_max                                        THEN 1 ELSE 0 END) AS low_count,
        SUM(CASE WHEN fa.risk_score >  s.low_risk_max
                  AND fa.risk_score <= s.medium_risk_max                                     THEN 1 ELSE 0 END) AS medium_count,
        SUM(CASE WHEN fa.risk_score >  s.medium_risk_max                                     THEN 1 ELSE 0 END) AS high_count
      FROM fraud_analysis fa
      CROSS JOIN system_setting s
    `);
    const riskBreakdown = {
      Low:    Number(riskRow.low_count)    || 0,
      Medium: Number(riskRow.medium_count) || 0,
      High:   Number(riskRow.high_count)   || 0,
    };

    /* ──────────────────────────────────────────────
       4) Monthly volume — every month that has invoices,
          ordered chronologically. Frontend filters to
          last 12 / last 6 months in-memory.
          month_key (YYYY-MM) is included so different
          years can be distinguished (e.g. Dec '24 vs Dec '25).
       ────────────────────────────────────────────── */
    const [monthlyRows] = await pool.query(`
      SELECT
        DATE_FORMAT(invoice_date, '%Y-%m')                                AS month_key,
        CONCAT(DATE_FORMAT(invoice_date, '%b'), ' ', DATE_FORMAT(invoice_date, '%y')) AS month_label,
        SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'Flagged'  THEN 1 ELSE 0 END) AS flagged,
        SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status = 'Pending'  THEN 1 ELSE 0 END) AS pending
      FROM invoice
      GROUP BY month_key, month_label
      ORDER BY month_key ASC
    `);

    const monthlyVolume = monthlyRows.map(r => ({
      month_key: r.month_key,
      month:     r.month_label,
      approved:  Number(r.approved),
      flagged:   Number(r.flagged),
      rejected:  Number(r.rejected),
      pending:   Number(r.pending),
    }));

    /* ──────────────────────────────────────────────
       5) Fraud rate trend — % flagged + rejected per month
       ────────────────────────────────────────────── */
    const fraudTrend = monthlyRows.map(r => {
      const total = Number(r.approved) + Number(r.flagged) + Number(r.rejected) + Number(r.pending);
      const bad   = Number(r.flagged)  + Number(r.rejected);
      return {
        month_key: r.month_key,
        month:     r.month_label,
        rate:      total > 0 ? Math.round((bad / total) * 100) : 0,
      };
    });

    /* ──────────────────────────────────────────────
       6) Top vendors by volume (5)
       ────────────────────────────────────────────── */
    const [vendorRows] = await pool.query(`
      SELECT
        v.vendor_name,
        COUNT(*)                AS invoice_count,
        SUM(i.amount)           AS total_amount,
        MIN(i.currency)         AS currency
      FROM invoice i
      JOIN vendor  v ON i.vendor_id = v.vendor_id
      GROUP BY v.vendor_id, v.vendor_name
      ORDER BY invoice_count DESC
      LIMIT 5
    `);

    /* ──────────────────────────────────────────────
       7) Top flagged vendors — flagged + rejected count
       ────────────────────────────────────────────── */
    const [flaggedVendorRows] = await pool.query(`
      SELECT
        v.vendor_name,
        COUNT(*) AS bad_count
      FROM invoice i
      JOIN vendor v ON i.vendor_id = v.vendor_id
      WHERE i.status IN ('Flagged', 'Rejected')
      GROUP BY v.vendor_id, v.vendor_name
      ORDER BY bad_count DESC
      LIMIT 5
    `);

    /* ──────────────────────────────────────────────
       8) Top fraud rules
       ────────────────────────────────────────────── */
    const [ruleRows] = await pool.query(`
      SELECT
        fr.rule_name,
        fr.risk_weight,
        COUNT(*) AS trigger_count
      FROM fraud_reason frs
      JOIN fraud_rule   fr ON frs.rule_id = fr.rule_id
      GROUP BY fr.rule_id, fr.rule_name, fr.risk_weight
      ORDER BY trigger_count DESC
      LIMIT 5
    `);

    /* ──────────────────────────────────────────────
       9) Oldest pending invoices waiting for review
       ────────────────────────────────────────────── */
    const [pendingRows] = await pool.query(`
      SELECT
        i.invoice_id,
        i.invoice_number,
        v.vendor_name,
        i.amount,
        i.currency,
        i.uploaded_at,
        fa.risk_score,
        CASE
          WHEN fa.risk_score IS NULL              THEN NULL
          WHEN fa.risk_score <= s.low_risk_max    THEN 'Low'
          WHEN fa.risk_score <= s.medium_risk_max THEN 'Medium'
          ELSE 'High'
        END AS risk_level
      FROM invoice i
      JOIN vendor          v  ON i.vendor_id  = v.vendor_id
      LEFT JOIN fraud_analysis fa ON i.invoice_id = fa.invoice_id
      CROSS JOIN system_setting s
      WHERE i.status = 'Pending'
      ORDER BY i.uploaded_at ASC
      LIMIT 10
    `);

    const pendingQueue = pendingRows.map(r => ({
      invoice_id:     r.invoice_id,
      invoice_number: r.invoice_number,
      vendor_name:    r.vendor_name,
      amount:         Number(r.amount),
      currency:       r.currency,
      uploaded_at:    r.uploaded_at,
      risk_score:     r.risk_score !== null ? Number(r.risk_score) : 0,
      risk_level:     r.risk_level || 'Low',
    }));

    /* ──────────────────────────────────────────────
       10) OCR correction rate
       ────────────────────────────────────────────── */
    const [[ocrRow]] = await pool.query(`
      SELECT
        COUNT(*)                                                       AS total,
        SUM(CASE WHEN was_corrected_at_review = 1 THEN 1 ELSE 0 END)   AS corrected
      FROM invoice
    `);

    const ocrTotal     = ocrRow.total     || 0;
    const ocrCorrected = ocrRow.corrected || 0;
    const ocrRate      = ocrTotal > 0 ? Math.round((ocrCorrected / ocrTotal) * 100) : 0;

    /* ──────────────────────────────────────────────
       Final payload
       ────────────────────────────────────────────── */
    res.json({
      kpis: {
        total_invoices: totalInvoices,
        pending_review: pendingReview,
        rejected_count: rejectedCount,
      },
      status_distribution: statusMap,
      risk_breakdown:      riskBreakdown,
      monthly_volume:      monthlyVolume,
      fraud_trend:         fraudTrend,
      top_vendors: vendorRows.map(r => ({
        name:     r.vendor_name,
        count:    Number(r.invoice_count),
        amount:   Number(r.total_amount) || 0,
        currency: r.currency || 'USD',
      })),
      top_flagged_vendors: flaggedVendorRows.map(r => ({
        name:  r.vendor_name,
        count: Number(r.bad_count),
      })),
      top_rules: ruleRows.map(r => ({
        name:   r.rule_name,
        weight: r.risk_weight,
        count:  Number(r.trigger_count),
      })),
      pending_queue: pendingQueue,
      ocr_correction: {
        corrected: ocrCorrected,
        total:     ocrTotal,
        rate:      ocrRate,
      },
    });
  } catch (err) {
    console.error('Dashboard query error:', err);
    res.status(500).json({ message: 'Failed to load dashboard data.' });
  }
});

module.exports = router;
