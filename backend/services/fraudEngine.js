// ============================================================
// services/fraudEngine.js
//
// Rule-based fraud analysis engine.
// Runs all active fraud rules against a submitted invoice
// and returns a risk score, risk level, and triggered rules
// with auto-generated reason text.
//
// Rules (from fraud_rule table):
//   1  Repeat Submission Risk            (25 pts)
//   2  Unapproved Vendor                 (50 pts)
//   3  Unusual Invoice Amount            (30 pts)
//   4  High Submission Frequency         (20 pts)
//   5  Invoice Date in the Future        (60 pts)
//   6  Unexpected Invoice Currency       (20 pts)
//   7  Weekend or Holiday Invoice         (5 pts)
//   8  Amount Just Below Approval Limit  (15 pts)
//   9  Unusual Round-Number Invoice      (10 pts) — disabled by default
//
// Note: Exact duplicates (same vendor + invoice number) are handled
// as a database UNIQUE constraint, NOT as a fraud rule. They are
// rejected before fraud analysis runs.
// Likewise, "Line Items Sum Mismatch" and "VAT Inconsistency" are
// now treated as OCR/validation concerns and live outside this engine.
//
// Risk thresholds (from system_setting):
//   Low:    0–30
//   Medium: 31–60
//   High:   61+
//
// Score is additive, capped at 100.
// ============================================================

/**
 * Run the fraud analysis engine against a single invoice.
 *
 * @param {Object} conn       - MySQL connection (within a transaction)
 * @param {number} invoiceId  - The newly inserted invoice_id
 * @param {Object} invoice    - Invoice data for rule evaluation:
 *   { vendor_id, invoice_number, invoice_date, amount, currency,
 *     was_corrected, extracted_amount }
 *
 * @returns {Object} { risk_score, risk_level, triggered_rules[] }
 *   where each triggered_rule = { rule_id, rule_name, risk_weight, reason_text }
 */
async function runFraudAnalysis(conn, invoiceId, invoice) {
  // ── 1. Fetch all active fraud rules ──
  const [activeRules] = await conn.query(
    'SELECT rule_id, rule_name, risk_weight FROM fraud_rule WHERE is_active = TRUE ORDER BY rule_id'
  );

  // Build a lookup map: rule_id → { rule_name, risk_weight }
  const ruleMap = {};
  for (const r of activeRules) {
    ruleMap[r.rule_id] = r;
  }

  // ── 2. Fetch system settings for thresholds ──
  const [settingsRows] = await conn.query(
    'SELECT low_risk_max, medium_risk_max, approval_threshold FROM system_setting LIMIT 1'
  );
  const settings = settingsRows[0] || { low_risk_max: 30, medium_risk_max: 60, approval_threshold: 5000 };

  // ── 3. Fetch vendor info ──
  const [vendorRows] = await conn.query(
    'SELECT vendor_name, default_currency, is_approved FROM vendor WHERE vendor_id = ? LIMIT 1',
    [invoice.vendor_id]
  );
  const vendor = vendorRows[0];

  // ── 4. Run each rule ──
  const triggered = [];

  // Helper to add a triggered rule
  const trigger = (ruleId, reasonText) => {
    if (ruleMap[ruleId]) {
      triggered.push({
        rule_id:     ruleId,
        rule_name:   ruleMap[ruleId].rule_name,
        risk_weight: ruleMap[ruleId].risk_weight,
        reason_text: reasonText,
      });
    }
  };

  // ── Rule 1: Repeat Submission Risk ──
  // Same vendor, similar amount (within 5%), within 7 days.
  // (Exact duplicates — same invoice_number — are blocked by the DB
  // UNIQUE(vendor_id, invoice_number) constraint and never reach this point.)
  if (ruleMap[1]) {
    const [nearDupes] = await conn.query(
      `SELECT invoice_id, invoice_number, amount, invoice_date
       FROM invoice
       WHERE vendor_id = ?
         AND invoice_id != ?
         AND ABS(DATEDIFF(invoice_date, ?)) <= 7
         AND ABS(amount - ?) / GREATEST(amount, 1) <= 0.05
       LIMIT 1`,
      [invoice.vendor_id, invoiceId, invoice.invoice_date, invoice.amount]
    );
    if (nearDupes.length > 0) {
      const nd = nearDupes[0];
      trigger(1,
        `A very similar invoice (${nd.invoice_number}, ${invoice.currency} ${parseFloat(nd.amount).toLocaleString()}, dated ${nd.invoice_date}) was submitted recently. Please confirm this is not a duplicate billing.`
      );
    }
  }

  // ── Rule 2: Unapproved Vendor ──
  if (ruleMap[2] && vendor) {
    if (!vendor.is_approved) {
      trigger(2,
        `Vendor ${vendor.vendor_name} is not on the approved vendor list. This supplier must be reviewed and approved by an administrator before any invoice can be paid.`
      );
    }
  }

  // ── Rule 3: Unusual Invoice Amount ──
  if (ruleMap[3] && vendor) {
    // Calculate vendor's average and std dev from previous invoices
    const [stats] = await conn.query(
      `SELECT AVG(amount) AS avg_amount, STDDEV(amount) AS std_amount, COUNT(*) AS inv_count
       FROM invoice
       WHERE vendor_id = ? AND invoice_id != ?`,
      [invoice.vendor_id, invoiceId]
    );
    const s = stats[0];
    if (s && s.inv_count >= 2) {
      const avg = parseFloat(s.avg_amount);
      const std = parseFloat(s.std_amount) || 1;
      const zScore = Math.abs(invoice.amount - avg) / std;

      if (zScore > 2) {
        const ratio = (invoice.amount / avg).toFixed(1);
        trigger(3,
          `Invoice amount of ${invoice.currency} ${invoice.amount.toLocaleString()} is significantly outside ${vendor.vendor_name}'s usual range (vendor average: ${invoice.currency} ${avg.toFixed(2)}, approximately ${ratio}x the typical amount).`
        );
      }
    }
  }

  // ── Rule 4: High Submission Frequency ──
  if (ruleMap[4]) {
    // Count invoices from same vendor in last 30 days
    const [velRows] = await conn.query(
      `SELECT COUNT(*) AS recent_count
       FROM invoice
       WHERE vendor_id = ?
         AND invoice_id != ?
         AND uploaded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [invoice.vendor_id, invoiceId]
    );
    // If 3+ invoices from same vendor in 30 days, flag high submission frequency
    if (velRows[0].recent_count >= 3) {
      trigger(4,
        `${vendor?.vendor_name || 'This vendor'} has submitted ${velRows[0].recent_count + 1} invoices in the last 30 days, which is higher than the normal billing cadence.`
      );
    }
  }

  // ── Rule 5: Invoice Date in the Future ──
  if (ruleMap[5]) {
    const invoiceDate = new Date(invoice.invoice_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (invoiceDate > today) {
      const formattedDate = invoiceDate.toISOString().split('T')[0];
      const todayFormatted = today.toISOString().split('T')[0];
      trigger(5,
        `Invoice is dated ${formattedDate}, which is later than today's processing date (${todayFormatted}). Please confirm the date with the vendor before approving.`
      );
    }
  }

  // ── Rule 6: Unexpected Invoice Currency ──
  if (ruleMap[6] && vendor) {
    if (vendor.default_currency && invoice.currency !== vendor.default_currency) {
      trigger(6,
        `Invoice currency is ${invoice.currency}, but ${vendor.vendor_name} normally bills in ${vendor.default_currency}. Please confirm whether this currency change was agreed with the vendor.`
      );
    }
  }

  // ── Rule 7: Weekend or Holiday Invoice ──
  if (ruleMap[7]) {
    const invoiceDate = new Date(invoice.invoice_date);
    const dayOfWeek = invoiceDate.getDay(); // 0=Sun, 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const dayName = dayOfWeek === 0 ? 'Sunday' : 'Saturday';
      trigger(7,
        `Invoice dated ${invoice.invoice_date} (${dayName}). Weekend-issued invoices are uncommon and may warrant a quick verification with the vendor.`
      );
    }
  }

  // ── Rule 8: Amount Just Below Approval Limit ──
  if (ruleMap[8]) {
    const threshold = parseFloat(settings.approval_threshold) || 5000;
    // "Just below" = within 5% below threshold
    const lowerBound = threshold * 0.95;
    if (invoice.amount >= lowerBound && invoice.amount < threshold) {
      trigger(8,
        `Invoice total of ${invoice.currency} ${invoice.amount.toLocaleString()} sits just below the ${invoice.currency} ${threshold.toLocaleString()} approval threshold. Amounts deliberately placed below approval limits are a known control-bypass pattern and should be verified.`
      );
    }
  }

  // ── Rule 9: Unusual Round-Number Invoice ── (disabled by default)
  if (ruleMap[9]) {
    if (invoice.amount % 1000 === 0 && invoice.amount >= 1000) {
      trigger(9,
        `Invoice total ${invoice.currency} ${invoice.amount.toLocaleString()} is a round number with no itemized supporting detail.`
      );
    }
  }

  // ── OCR Correction note ──
  // Not stored as a formal fraud_reason — see invoice_history for the
  // correction event. The 'was_corrected_at_review' flag on the invoice
  // record is the source of truth for whether OCR was corrected.

  // ── 5. Calculate total score ──
  let totalScore = 0;
  for (const t of triggered) {
    totalScore += t.risk_weight;
  }
  // Cap at 100
  totalScore = Math.min(totalScore, 100);

  // ── 6. Determine risk level ──
  let riskLevel;
  if (totalScore <= settings.low_risk_max) {
    riskLevel = 'Low';
  } else if (totalScore <= settings.medium_risk_max) {
    riskLevel = 'Medium';
  } else {
    riskLevel = 'High';
  }

  return {
    risk_score:      totalScore,
    risk_level:      riskLevel,
    triggered_rules: triggered,
  };
}

module.exports = { runFraudAnalysis };
