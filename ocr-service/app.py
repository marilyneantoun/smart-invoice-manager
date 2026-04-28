# ==============================================================
# ocr_service/app.py
#
# Python Flask microservice for OCR extraction using Tesseract.
# Receives an invoice file (PDF or image), runs Tesseract OCR,
# parses the raw text to extract structured fields, and returns
# them as JSON.
#
# Runs on port 5001 (configured in backend/.env as OCR_SERVICE_URL)
#
# Setup:
#   1. Install Tesseract on your machine:
#      - Windows: https://github.com/UB-Mannheim/tesseract/wiki
#      - macOS:   brew install tesseract
#      - Linux:   sudo apt install tesseract-ocr
#
#   2. Install Python dependencies:
#      cd ocr_service
#      pip install flask pytesseract Pillow pdf2image
#
#   3. Windows only — set Tesseract path:
#      Uncomment the pytesseract.tesseract_cmd line below
#      and set it to your Tesseract install path.
#
#   4. For pdf2image (PDF support), install poppler:
#      - Windows: download from https://github.com/oschwartz10612/poppler-windows
#        and add bin/ to PATH
#      - macOS:   brew install poppler
#      - Linux:   sudo apt install poppler-utils
#
#   5. Run:
#      python app.py
# ==============================================================

import os
import re
import tempfile
from datetime import datetime

from flask import Flask, request, jsonify
import pytesseract
from PIL import Image

# ── Windows: uncomment and set your Tesseract install path ──
# pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = Flask(__name__)

# Max file size: 10 MB
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text_from_image(image_path):
    """Run Tesseract OCR on a single image file."""
    img = Image.open(image_path)
    text = pytesseract.image_to_string(img)
    return text


def extract_text_from_pdf(pdf_path):
    """Convert PDF pages to images, then run Tesseract on each page."""
    try:
        from pdf2image import convert_from_path
        images = convert_from_path(pdf_path, dpi=300)
        full_text = ''
        for i, img in enumerate(images):
            page_text = pytesseract.image_to_string(img)
            full_text += page_text + '\n'
        return full_text.strip()
    except ImportError:
        return '[ERROR] pdf2image is not installed. Install it with: pip install pdf2image'
    except Exception as e:
        return f'[ERROR] PDF conversion failed: {str(e)}'

def parse_vendor_name(text):
    """
    Extract vendor name — typically the first non-empty line of the invoice.
    Strips common invoice header keywords (INVOICE, BILL, RECEIPT, etc.)
    that may appear next to the vendor name in styled headers.
    """
    # Keywords that often appear in invoice header banners next to the vendor name
    HEADER_KEYWORDS = [
        'TAX INVOICE',
        'COMMERCIAL INVOICE',
        'PROFORMA INVOICE',
        'CREDIT NOTE',
        'DEBIT NOTE',
        'INVOICE',
        'RECEIPT',
        'BILL',
        'STATEMENT',
        'QUOTATION',
    ]

    lines = [l.strip() for l in text.split('\n') if l.strip()]
    if not lines:
        return None

    for line in lines:
        cleaned = line

        # Strip header keywords (case-insensitive, longest first to catch
        # multi-word phrases like "TAX INVOICE" before "INVOICE")
        for kw in HEADER_KEYWORDS:
            cleaned = re.sub(
                rf'\b{re.escape(kw)}\b',
                '',
                cleaned,
                flags=re.IGNORECASE
            )

        # Collapse extra whitespace left behind by the removal
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()

        # Skip if the line was *only* a header keyword (now empty)
        if not cleaned:
            continue

        # Skip lines that are obviously not vendor names (numbers, dates, very short)
        if len(cleaned) < 2:
            continue

        return cleaned

    return None


def parse_invoice_number(text):
    """
    Extract invoice number from patterns like:
      Invoice: INV-2025-001
      Invoice No: 12345
      Invoice #: ABC-123
      Invoice Number: XYZ
    """
    patterns = [
        r'[Ii]nvoice\s*(?:[Nn]o\.?|[Nn]umber|#|:)\s*[:\s]*([A-Za-z0-9\-_/]+)',
        r'[Ii]nv[.\s\-#:]*([A-Za-z0-9\-_/]+)',
        r'(?:No|Number|Ref)[\s.:]*([A-Za-z]*\-?\d{4,}[\-\d]*)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip()
    return None


def parse_invoice_date(text):
    """
    Extract invoice date from various formats:
      Date: 20/01/2025, Date: 2025-01-20, Date: Jan 20, 2025
      Invoice Date: ...
    """
    # First try to find a line with "Date:" or "Invoice Date:"
    date_line_patterns = [
        r'(?:[Ii]nvoice\s+)?[Dd]ate\s*[:\s]\s*([\d/\-\.\s\w,]+)',
    ]

    date_text = None
    for pattern in date_line_patterns:
        match = re.search(pattern, text)
        if match:
            date_text = match.group(1).strip()
            break

    if not date_text:
        return None

    # Try parsing various date formats
    date_formats = [
        '%d/%m/%Y',      # 20/01/2025
        '%m/%d/%Y',      # 01/20/2025
        '%Y-%m-%d',      # 2025-01-20
        '%d-%m-%Y',      # 20-01-2025
        '%d.%m.%Y',      # 20.01.2025
        '%B %d, %Y',     # January 20, 2025
        '%b %d, %Y',     # Jan 20, 2025
        '%d %B %Y',      # 20 January 2025
        '%d %b %Y',      # 20 Jan 2025
    ]

    # Clean the date text (remove extra whitespace, trailing punctuation)
    date_text = re.sub(r'[^\d/\-\.\w,\s]', '', date_text).strip()
    # Take only the first date-like chunk (stop at newline or next word)
    date_text = date_text.split('\n')[0].strip()

    for fmt in date_formats:
        try:
            dt = datetime.strptime(date_text[:len(date_text)], fmt)
            return dt.strftime('%Y-%m-%d')  # Return ISO format
        except ValueError:
            continue

    return None


def parse_amount(text):
    """
    Extract total/amount from patterns like:
      Total: $3,500.00
      Total: EUR 15,340.57
      Amount Due: 7,250.50
      Grand Total: 8200.00

    Returns a tuple (display_str, numeric_value):
      - display_str:   the amount as it appeared in the document (e.g. "3,500.00")
      - numeric_value: the parsed float for database storage (e.g. 3500.0)
    """
    patterns = [
        r'(?:[Tt]otal|[Aa]mount\s*[Dd]ue|[Gg]rand\s*[Tt]otal|[Bb]alance\s*[Dd]ue)\s*[:\s]*[€$£]?\s*([\d,]+\.?\d*)',
        r'(?:Total|TOTAL)\s*[:\s]*(?:USD|EUR|GBP|CHF)?\s*([\d,]+\.?\d*)',
    ]

    results = []
    for pattern in patterns:
        matches = re.finditer(pattern, text)
        for match in matches:
            original_str = match.group(1).strip()
            numeric_str = original_str.replace(',', '')
            try:
                numeric_val = float(numeric_str)
                results.append((original_str, numeric_val))
            except ValueError:
                continue

    # Return the largest amount found (usually the grand total)
    if results:
        best = max(results, key=lambda x: x[1])
        return best  # (display_str, numeric_value)
    return None


def parse_currency(text):
    """
    Detect currency from symbols or codes in the text.
    """
    # Check for explicit currency codes
    currency_patterns = [
        (r'\bUSD\b', 'USD'),
        (r'\bEUR\b', 'EUR'),
        (r'\bGBP\b', 'GBP'),
        (r'\bCHF\b', 'CHF'),
        (r'\$',      'USD'),
        (r'€',       'EUR'),
        (r'£',       'GBP'),
    ]

    for pattern, currency in currency_patterns:
        if re.search(pattern, text):
            return currency

    # Default to USD if nothing found
    return 'USD'



# ==============================================================
# POST /extract
#
# Accepts a file upload (field name: "file")
# Returns JSON with extracted fields + raw text
# ==============================================================
@app.route('/extract', methods=['POST'])
def extract():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided. Send as "file" field.'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'Empty filename.'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': f'Unsupported file type. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

    # Save to a temporary file
    ext = file.filename.rsplit('.', 1)[1].lower()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f'.{ext}')
    file.save(tmp.name)
    tmp.close()

    try:
        # Run OCR
        if ext == 'pdf':
            raw_text = extract_text_from_pdf(tmp.name)
        else:
            raw_text = extract_text_from_image(tmp.name)

        # Check for OCR errors
        if raw_text.startswith('[ERROR]'):
            return jsonify({'error': raw_text}), 500

        # Parse structured fields from raw text
        vendor_name    = parse_vendor_name(raw_text)
        invoice_number = parse_invoice_number(raw_text)
        invoice_date   = parse_invoice_date(raw_text)
        amount_result  = parse_amount(raw_text)
        currency       = parse_currency(raw_text)

        # amount_result is a tuple (display_str, numeric_value) or None
        amount_display = amount_result[0] if amount_result else None
        amount_numeric = amount_result[1] if amount_result else None

        return jsonify({
            'vendor_name':    vendor_name,
            'invoice_number': invoice_number,
            'invoice_date':   invoice_date,
            'amount':         amount_numeric,          # numeric for DB / form field
            'amount_display': amount_display,          # original string as in document
            'currency':       currency,
            'raw_text':       raw_text,
        }), 200

    except Exception as e:
        return jsonify({'error': f'OCR processing failed: {str(e)}'}), 500

    finally:
        # Clean up temp file
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


# ==============================================================
# GET /health — quick health check
# ==============================================================
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status':  'ok',
        'service': 'InvoiceShield OCR (Tesseract)',
    }), 200


# ==============================================================
# Run the Flask server
# ==============================================================
if __name__ == '__main__':
    print('🔍 InvoiceShield OCR service starting on http://localhost:5001')
    app.run(host='0.0.0.0', port=5001, debug=True)
