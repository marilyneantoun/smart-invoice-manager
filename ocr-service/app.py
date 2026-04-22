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

# ── Parsing functions and routes will be added in next commits ──