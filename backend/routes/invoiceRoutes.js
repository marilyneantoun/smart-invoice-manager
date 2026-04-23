// ============================================================
// routes/invoiceRoutes.js
//
// Invoice-related endpoints for the Upload Invoice workflow:
//
//   POST /api/ocr/extract          → proxy file to Python OCR
//   POST /api/invoices/upload      → save invoice + run fraud
//   PUT  /api/invoices/:id/status  → update invoice status
//
// All routes require JWT. Upload routes are Accountant-only.
// ============================================================

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const pool     = require('../config/db');
const { protect, allowRoles } = require('../middleware/authMiddleware');
const { runFraudAnalysis }    = require('../services/fraudEngine');

// ── File upload configuration via multer ──
// Store files in /uploads/invoices/ with unique timestamped names.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'invoices');

// Ensure the upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Organize by year/month
    const now = new Date();
    const subDir = path.join(
      UPLOAD_DIR,
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0')
    );
    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir, { recursive: true });
    }
    cb(null, subDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    cb(null, `inv_${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Allowed: PDF, JPG, JPEG, PNG.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});


// ================================================================
// POST /api/ocr/extract
// ----------------------------------------------------------------
// Phase 1 → 2: Receives the invoice file, proxies it to the
// Python OCR microservice (Tesseract), returns extracted fields.
//
// Accountant only.
// ================================================================
router.post(
  '/ocr/extract',
  protect,
  allowRoles('Accountant'),
  upload.single('invoice_file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    try {
      // Proxy the file to the Python OCR microservice
      const ocrUrl = process.env.OCR_SERVICE_URL || 'http://localhost:5001';

      // Use dynamic import for node-fetch (or use built-in fetch in Node 18+)
      const FormData = (await import('form-data')).default;
      const fetch    = (await import('node-fetch')).default;

      const form = new FormData();
      form.append('file', fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const ocrRes = await fetch(`${ocrUrl}/extract`, {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
      });

      if (!ocrRes.ok) {
        const errBody = await ocrRes.text();
        console.error('OCR service error:', errBody);
        return res.status(502).json({ message: 'OCR extraction failed.', detail: errBody });
      }

      const ocrData = await ocrRes.json();

      // Return OCR results + file info so the frontend can proceed
      return res.status(200).json({
        message: 'OCR extraction complete.',
        // File info (needed for phase 2 → 3)
        file_path:       req.file.path,
        original_name:   req.file.originalname,
        file_type:       req.file.mimetype === 'application/pdf' ? 'PDF' : 'IMAGE',
        // Extracted fields from OCR
        extracted_vendor_name:    ocrData.vendor_name    || null,
        extracted_invoice_number: ocrData.invoice_number || null,
        extracted_invoice_date:   ocrData.invoice_date   || null,
        extracted_amount:         ocrData.amount          || null,
        amount_display:           ocrData.amount_display  || null,
        extracted_currency:       ocrData.currency        || null,
        raw_text:                 ocrData.raw_text        || '',
      });
    } catch (err) {
      console.error('OCR proxy error:', err);
      return res.status(500).json({ message: 'Failed to process OCR extraction.' });
    }
  }
);


// ================================================================
// POST /api/invoices/upload
// ----------------------------------------------------------------
// Phase 2 → 3 → 4: Receives the reviewed form data, saves the
// invoice + OCR result, runs the fraud engine, returns results.
//
// This is the main "Confirm & Save" endpoint.
// Accountant only.
//
// Expects multipart/form-data with:
//   - invoice_file (the actual file, re-sent or reused)
//   - vendor_id, invoice_number, invoice_date, amount, currency
//   - was_corrected_at_review (true/false)
//   - extracted_* fields + raw_text (OCR data to store)
//
// Sequence (matches Phase 3 checklist):
//   1. Save invoice record (status = Pending)
//   2. Save OCR result
//   3. Create first invoice_history entry (Created → Pending)
//   4. Run fraud analysis engine
//   5. Save fraud_analysis + fraud_reasons
//   6. Return results to frontend
// ================================================================
router.post(
  '/invoices/upload',
  protect,
  allowRoles('Accountant'),
  upload.single('invoice_file'),
  async (req, res) => {
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const {
        vendor_id, invoice_number, invoice_date, amount, currency,
        was_corrected_at_review,
        extracted_vendor_name, extracted_invoice_number,
        extracted_invoice_date, extracted_amount, extracted_currency,
        raw_text,
      } = req.body;

      // ── Validation ──
      if (!vendor_id || !invoice_number || !invoice_date || !amount || !currency) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ message: 'All invoice fields are required.' });
      }

      // Determine file info — either from a newly uploaded file or from the
      // previously uploaded file path stored in the request body
      let filePath, originalName, fileType;

      if (req.file) {
        filePath     = req.file.path;
        originalName = req.file.originalname;
        fileType     = req.file.mimetype === 'application/pdf' ? 'PDF' : 'IMAGE';
      } else if (req.body.file_path) {
        filePath     = req.body.file_path;
        originalName = req.body.original_name || 'unknown';
        fileType     = req.body.file_type || 'PDF';
      } else {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ message: 'Invoice file is required.' });
      }

      // Make stored path relative for portability
      const storedPath = filePath.replace(/\\/g, '/');

      // ── Step 1: Save invoice record ──
      const [invoiceResult] = await conn.query(
        `INSERT INTO invoice
           (vendor_id, invoice_number, invoice_date, amount, currency,
            status, was_corrected_at_review, file_type,
            original_file_name, stored_file_path, uploaded_by)
         VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?)`,
        [
          vendor_id,
          invoice_number,
          invoice_date,
          parseFloat(amount),
          currency,
          was_corrected_at_review === 'true' || was_corrected_at_review === true ? 1 : 0,
          fileType,
          originalName,
          storedPath,
          req.user.user_id,
        ]
      );

      const invoiceId = invoiceResult.insertId;

      // ── Step 2: Save OCR result ──
      await conn.query(
        `INSERT INTO ocr_result
           (invoice_id, extracted_vendor_name, extracted_invoice_number,
            extracted_invoice_date, extracted_amount, extracted_currency,
            raw_text)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          extracted_vendor_name   || null,
          extracted_invoice_number || null,
          extracted_invoice_date   || null,
          extracted_amount ? parseFloat(extracted_amount) : null,
          extracted_currency       || null,
          raw_text                 || null,
        ]
      );

      // ── Step 3: Create first invoice_history entry ──
      await conn.query(
        `INSERT INTO invoice_history
           (invoice_id, old_status, new_status, action_type, reason, changed_by)
         VALUES (?, NULL, 'Pending', 'Created', 'Invoice uploaded and OCR processed.', ?)`,
        [invoiceId, req.user.user_id]
      );

      // ── Step 4: Run fraud analysis engine ──
      const fraudResults = await runFraudAnalysis(conn, invoiceId, {
        vendor_id:      parseInt(vendor_id),
        invoice_number,
        invoice_date,
        amount:         parseFloat(amount),
        currency,
        was_corrected:  was_corrected_at_review === 'true' || was_corrected_at_review === true,
        extracted_amount: extracted_amount ? parseFloat(extracted_amount) : null,
      });

      // ── Step 5: Save fraud_analysis + fraud_reasons ──
      const [analysisResult] = await conn.query(
        `INSERT INTO fraud_analysis (invoice_id, risk_score, risk_level)
         VALUES (?, ?, ?)`,
        [invoiceId, fraudResults.risk_score, fraudResults.risk_level]
      );

      const analysisId = analysisResult.insertId;

      // Save each triggered rule as a fraud_reason
      for (const rule of fraudResults.triggered_rules) {
        await conn.query(
          `INSERT INTO fraud_reason (analysis_id, rule_id, reason_text)
           VALUES (?, ?, ?)`,
          [analysisId, rule.rule_id, rule.reason_text]
        );
      }

      await conn.commit();
      conn.release();

      // ── Step 6: Return results ──
      return res.status(201).json({
        message:         'Invoice saved and fraud analysis complete.',
        invoice_id:      invoiceId,
        risk_score:      fraudResults.risk_score,
        risk_level:      fraudResults.risk_level,
        triggered_rules: fraudResults.triggered_rules,
      });

    } catch (err) {
      await conn.rollback();
      conn.release();

      // Handle duplicate invoice (vendor_id + invoice_number unique constraint)
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          message: 'An invoice with this number already exists for this vendor.',
        });
      }

      console.error('Invoice upload error:', err);
      return res.status(500).json({ message: 'Failed to save invoice.' });
    }
  }
);


// ================================================================
// PUT /api/invoices/:id/status
// ----------------------------------------------------------------
// Phase 4 action: Update invoice status.
//
// Body: { new_status: 'Approved'|'Rejected'|'Flagged'|'Pending', reason: '' }
//
// Reason logic:
//   - First change from Pending → reason is optional
//   - All subsequent changes → reason is mandatory
//   - Reject and Flag always require a reason
//
// Accountant only.
// ================================================================
router.put(
  '/invoices/:id/status',
  protect,
  allowRoles('Accountant'),
  async (req, res) => {
    const invoiceId = req.params.id;
    const { new_status, reason } = req.body;

    // Validate new_status
    const validStatuses = ['Pending', 'Approved', 'Rejected', 'Flagged'];
    if (!validStatuses.includes(new_status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    try {
      // Get current invoice
      const [invoiceRows] = await pool.query(
        'SELECT invoice_id, status FROM invoice WHERE invoice_id = ? LIMIT 1',
        [invoiceId]
      );

      if (!invoiceRows[0]) {
        return res.status(404).json({ message: 'Invoice not found.' });
      }

      const currentStatus = invoiceRows[0].status;

      // Cannot set to the same status
      if (currentStatus === new_status) {
        return res.status(400).json({ message: `Invoice is already ${new_status}.` });
      }

      // Check if this is the first status change from Pending
      const [historyRows] = await pool.query(
        `SELECT COUNT(*) AS change_count
         FROM invoice_history
         WHERE invoice_id = ? AND action_type != 'Created'`,
        [invoiceId]
      );
      const isFirstChange = historyRows[0].change_count === 0;

      // Reason enforcement:
      //   - Reject / Flag → always mandatory
      //   - First change from Pending (Approve/Leave Pending) → optional
      //   - Subsequent changes → mandatory
      if ((new_status === 'Rejected' || new_status === 'Flagged') && !reason) {
        return res.status(400).json({
          message: `A reason is required when ${new_status.toLowerCase()} an invoice.`,
        });
      }

      if (!isFirstChange && !reason) {
        return res.status(400).json({
          message: 'A reason is required for all status changes after the first decision.',
        });
      }

      // Determine action_type from new_status
      const actionType = new_status === 'Pending' ? 'Updated' : new_status;

      // Update invoice status
      await pool.query(
        'UPDATE invoice SET status = ? WHERE invoice_id = ?',
        [new_status, invoiceId]
      );

      // Create invoice_history entry
      await pool.query(
        `INSERT INTO invoice_history
           (invoice_id, old_status, new_status, action_type, reason, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, currentStatus, new_status, actionType, reason || null, req.user.user_id]
      );

      return res.status(200).json({
        message: `Invoice ${new_status.toLowerCase()} successfully.`,
        invoice_id: parseInt(invoiceId),
        old_status: currentStatus,
        new_status,
      });

    } catch (err) {
      console.error('Status update error:', err);
      return res.status(500).json({ message: 'Failed to update invoice status.' });
    }
  }
);


module.exports = router;
