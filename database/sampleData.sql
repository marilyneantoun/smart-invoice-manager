-- ============================================================
-- Invoice Fraud Detection & Management System
-- SAMPLE DATA  (v3 — Final)
-- Run AFTER importing Db_final_v2.sql
--
-- Currencies: USD, EUR only
-- Risk weights: research-backed (see fraud_rule comments)
-- Thresholds: Low 0-30, Medium 31-60, High 61+
-- Approval threshold: $5,000.00 USD
-- ============================================================

USE invoice_fraud_db;


-- ============================================================
-- 1. ROLES  (3 rows)
-- ============================================================
INSERT INTO role (role_id, role_name) VALUES
(1, 'Admin'),
(2, 'Accountant'),
(3, 'Viewer');


-- ============================================================
-- 2. USERS  (7 rows — 2 admins, 3 accountants, 2 viewers)
-- ============================================================
INSERT INTO `user` (user_id, full_name, email, password_hash, is_active, created_at, role_id) VALUES
(1, 'Nadia Khoury',     'nadia.khoury@company.com',     '$2a$10$pbE5CYML4JaqhDbFCJhxaejVKuHS4m2AM9bijhm9v1SeyNOHtwAay', TRUE,  '2025-01-05 09:00:00', 1),
(2, 'Omar Haddad',      'omar.haddad@company.com',      '$2a$10$pbE5CYML4JaqhDbFCJhxaejVKuHS4m2AM9bijhm9v1SeyNOHtwAay', TRUE,  '2025-01-05 09:30:00', 1),
(3, 'Sara Mansour',     'sara.mansour@company.com',     '$2a$10$pbE5CYML4JaqhDbFCJhxaejVKuHS4m2AM9bijhm9v1SeyNOHtwAay', TRUE,  '2025-01-10 08:00:00', 2),
(4, 'Karim Bazzi',      'karim.bazzi@company.com',      '$2a$10$pbE5CYML4JaqhDbFCJhxaejVKuHS4m2AM9bijhm9v1SeyNOHtwAay', TRUE,  '2025-01-10 08:30:00', 2),
(5, 'Tanya El-Amine',   'tanya.elamine@company.com',    '$2a$10$pbE5CYML4JaqhDbFCJhxaejVKuHS4m2AM9bijhm9v1SeyNOHtwAay', TRUE,  '2025-01-12 09:00:00', 2),
(6, 'Lina Farah',       'lina.farah@company.com',       '$2a$10$pbE5CYML4JaqhDbFCJhxaejVKuHS4m2AM9bijhm9v1SeyNOHtwAay', TRUE,  '2025-01-15 10:00:00', 3),
(7, 'Rami Saleh',       'rami.saleh@company.com',       '$2a$10$pbE5CYML4JaqhDbFCJhxaejVKuHS4m2AM9bijhm9v1SeyNOHtwAay', TRUE,  '2025-01-15 10:30:00', 3);


-- ============================================================
-- 3. VENDORS  (8 rows)
--    Currencies: USD or EUR only
-- ============================================================
INSERT INTO vendor (vendor_id, vendor_name, vendor_code, email, phone_number, address, country, default_currency, is_active, is_approved, registration_date, created_by) VALUES
(1, 'Cedar Tech Solutions',    'VND-001', 'billing@cedartech.com',     '+961-1-234567',  '123 Hamra St, Beirut',          'Lebanon',        'USD', TRUE,  TRUE,  '2025-01-15 10:00:00', 1),
(2, 'Gulf Office Supplies',    'VND-002', 'accounts@gulfoffice.com',   '+971-4-5678901', '45 Sheikh Zayed Rd, Dubai',     'UAE',            'USD', TRUE,  TRUE,  '2025-01-20 11:00:00', 1),
(3, 'MediPharma SARL',         'VND-003', 'finance@medipharma.com',    '+961-9-876543',  '78 Jounieh Hwy, Jounieh',       'Lebanon',        'USD', TRUE,  TRUE,  '2025-02-01 09:00:00', 2),
(4, 'EuroLogistics GmbH',      'VND-004', 'invoices@eurologistics.de', '+49-30-1234567', '12 Berliner Str, Berlin',       'Germany',        'EUR', TRUE,  TRUE,  '2025-02-10 14:00:00', 2),
(5, 'Pacific Trade Corp',      'VND-005', 'billing@pacifictrade.jp',   '+81-3-9876543',  '5-2 Chiyoda, Tokyo',            'Japan',          'USD', TRUE,  TRUE,  '2025-02-20 08:00:00', 1),
(6, 'Apex Marketing Ltd',      'VND-006', 'pay@apexmarketing.com',     '+44-20-9876543', '90 Oxford St, London',          'United Kingdom', 'USD', FALSE, TRUE,  '2025-02-15 16:00:00', 1),
(7, 'Shadow Supplies Co',      'VND-007', 'info@shadowsupplies.com',   NULL,              NULL,                            NULL,             'USD', TRUE,  FALSE, '2025-03-01 08:00:00', 1),
(8, 'Beirut Print House',      'VND-008', 'orders@beirutprint.com',    '+961-1-555888',  '200 Verdun St, Beirut',         'Lebanon',        'USD', TRUE,  TRUE,  '2025-03-10 09:00:00', 2);


-- ============================================================
-- 4. FRAUD RULES  (12 rows)
--    10 active, 2 disabled
--    Research-backed risk weights (0-100 additive scale)
-- ============================================================
INSERT INTO fraud_rule (rule_id, rule_name, description, is_active, risk_weight, created_at, created_by) VALUES
(1,  'Exact Duplicate Invoice',      'Detects invoices with the same vendor and invoice number, indicating duplicate submission or fraud.',                                                          TRUE,  80, '2025-01-15 12:00:00', 1),
(2,  'Near Duplicate Invoice',       'Identifies invoices from the same vendor with similar amounts and close dates, suggesting possible repeated or altered submissions.',                           TRUE,  25, '2025-01-15 12:05:00', 1),
(3,  'Unapproved Vendor',            'Flags invoices where the vendor is not found in the system or is not approved.',                                                                               TRUE,  50, '2025-01-15 12:10:00', 1),
(4,  'Amount Anomaly Detection',     'Detects invoices with amounts significantly different from the vendor usual pattern, indicating abnormal or suspicious values.',                                TRUE,  30, '2025-01-15 12:15:00', 1),
(5,  'Velocity Spike Detection',     'Identifies an unusual number of invoices from the same vendor within a short time period, which may indicate suspicious activity.',                             TRUE,  20, '2025-01-15 12:20:00', 1),
(6,  'Future-Dated Invoice',         'Flags invoices where the invoice date is set in the future, which is logically inconsistent and potentially fraudulent.',                                       TRUE,  60, '2025-01-15 12:25:00', 1),
(7,  'Currency Mismatch',            'Detects when the invoice currency differs from the vendor typical currency, which may indicate manipulation or inconsistency.',                                 TRUE,  20, '2025-01-15 12:30:00', 1),
(8,  'Weekend or Holiday Invoice',   'Flags invoices issued on weekends or public holidays, which may be unusual for normal business operations.',                                                    TRUE,   5, '2025-01-20 09:00:00', 2),
(9,  'Amount Below Approval Threshold','Detects invoices with amounts slightly below a defined approval limit, which may indicate attempts to bypass authorization controls.',                        TRUE,  10, '2025-01-20 09:05:00', 2),
(10, 'Round Number No Itemization',  'Flags invoices with a perfectly round total and no clear itemized amounts, which may indicate a simplified or suspicious invoice.',                              FALSE, 10, '2025-01-20 09:10:00', 2),
(11, 'Line Items Sum Mismatch',      'Checks whether the sum of individual line item amounts differs significantly from the invoice total, indicating possible inconsistencies or manipulation.',      TRUE,  25, '2025-01-20 09:15:00', 2),
(12, 'VAT Inconsistency',            'Verifies that the VAT amount correctly matches the subtotal and VAT rate, helping detect incorrect or altered tax values.',                                     FALSE, 25, '2025-01-20 09:20:00', 2);


-- ============================================================
-- 5. INVOICES  (25 rows)
--    15 Approved (60%), 4 Rejected (16%), 4 Flagged (16%), 2 Pending (8%)
--    All amounts in USD or EUR
-- ============================================================
INSERT INTO invoice (invoice_id, vendor_id, invoice_number, invoice_date, amount, currency, status, was_corrected_at_review, file_type, original_file_name, stored_file_path, uploaded_at, uploaded_by) VALUES
-- ===== APPROVED (15) =====
(1,  1, 'INV-2025-001', '2025-01-20',  3500.00,  'USD', 'Approved', FALSE, 'PDF',   'cedar_jan.pdf',               '/uploads/invoices/2025/01/inv_001.pdf', '2025-01-21 08:30:00', 3),
(2,  2, 'INV-2025-010', '2025-01-25',  7250.50,  'USD', 'Approved', FALSE, 'PDF',   'gulf_jan.pdf',                '/uploads/invoices/2025/01/inv_002.pdf', '2025-01-26 09:00:00', 3),
(3,  3, 'INV-2025-020', '2025-02-05',  8200.00,  'USD', 'Approved', FALSE, 'IMAGE', 'medipharma_feb.jpg',          '/uploads/invoices/2025/02/inv_003.jpg', '2025-02-06 10:15:00', 4),
(4,  4, 'INV-2025-030', '2025-02-14', 15340.75,  'EUR', 'Approved', TRUE,  'PDF',   'euro_logistics_feb.pdf',      '/uploads/invoices/2025/02/inv_004.pdf', '2025-02-15 11:00:00', 3),
(5,  1, 'INV-2025-002', '2025-03-10',  4100.00,  'USD', 'Approved', FALSE, 'PDF',   'cedar_mar.pdf',               '/uploads/invoices/2025/03/inv_005.pdf', '2025-03-11 08:45:00', 5),
(6,  5, 'INV-2025-040', '2025-03-05',  6200.00,  'USD', 'Approved', FALSE, 'PDF',   'pacific_mar.pdf',             '/uploads/invoices/2025/03/inv_006.pdf', '2025-03-06 07:00:00', 4),
(7,  2, 'INV-2025-011', '2025-03-15',  5800.00,  'USD', 'Approved', FALSE, 'IMAGE', 'gulf_mar.jpg',                '/uploads/invoices/2025/03/inv_007.jpg', '2025-03-16 09:30:00', 5),
(8,  3, 'INV-2025-021', '2025-04-02',  7650.00,  'USD', 'Approved', FALSE, 'PDF',   'medipharma_apr.pdf',          '/uploads/invoices/2025/04/inv_008.pdf', '2025-04-03 10:00:00', 3),
(9,  4, 'INV-2025-031', '2025-04-10', 11200.00,  'EUR', 'Approved', FALSE, 'PDF',   'euro_logistics_apr.pdf',      '/uploads/invoices/2025/04/inv_009.pdf', '2025-04-11 11:00:00', 4),
(10, 5, 'INV-2025-041', '2025-04-15',  5400.00,  'USD', 'Approved', FALSE, 'IMAGE', 'pacific_apr.jpg',             '/uploads/invoices/2025/04/inv_010.jpg', '2025-04-16 07:30:00', 5),
(11, 1, 'INV-2025-003', '2025-04-20',  3800.00,  'USD', 'Approved', FALSE, 'PDF',   'cedar_apr.pdf',               '/uploads/invoices/2025/04/inv_011.pdf', '2025-04-21 08:00:00', 3),
(12, 2, 'INV-2025-012', '2025-04-25',  6500.00,  'USD', 'Approved', FALSE, 'PDF',   'gulf_apr.pdf',                '/uploads/invoices/2025/04/inv_012.pdf', '2025-04-26 09:00:00', 4),
(13, 3, 'INV-2025-022', '2025-05-05',  6900.00,  'USD', 'Approved', FALSE, 'IMAGE', 'medipharma_may.jpg',          '/uploads/invoices/2025/05/inv_013.jpg', '2025-05-06 10:00:00', 5),
(14, 4, 'INV-2025-032', '2025-05-08', 13600.00,  'EUR', 'Approved', FALSE, 'PDF',   'euro_logistics_may.pdf',      '/uploads/invoices/2025/05/inv_014.pdf', '2025-05-09 11:00:00', 3),
(15, 8, 'INV-2025-060', '2025-05-12',  2200.00,  'USD', 'Approved', FALSE, 'PDF',   'beirut_print_may.pdf',        '/uploads/invoices/2025/05/inv_015.pdf', '2025-05-13 09:00:00', 4),

-- ===== REJECTED (4) =====
-- Future-dated (rule 6: weight 60)
(16, 2, 'INV-2025-013', '2025-12-31',  5000.00,  'USD', 'Rejected', FALSE, 'PDF',   'gulf_future_date.pdf',        '/uploads/invoices/2025/03/inv_016.pdf', '2025-03-18 14:00:00', 3),
-- Amount anomaly: vendor 1 avg ~3800, this is 45000 (rule 4: weight 30)
(17, 1, 'INV-2025-004', '2025-03-20', 45000.00,  'USD', 'Rejected', FALSE, 'IMAGE', 'cedar_anomaly.png',           '/uploads/invoices/2025/03/inv_017.png', '2025-03-21 09:30:00', 4),
-- Unapproved vendor (rule 3: weight 50)
(18, 7, 'INV-2025-050', '2025-03-25',  2300.00,  'USD', 'Rejected', FALSE, 'IMAGE', 'shadow_supplies.png',         '/uploads/invoices/2025/03/inv_018.png', '2025-03-26 11:30:00', 4),
-- Currency mismatch EUR→USD (rule 7: 20) + amount anomaly (rule 4: 30) = 50
(19, 4, 'INV-2025-033', '2025-03-22', 78000.00,  'USD', 'Rejected', FALSE, 'PDF',   'euro_currency_wrong.pdf',     '/uploads/invoices/2025/03/inv_019.pdf', '2025-03-23 10:00:00', 3),

-- ===== FLAGGED (4) =====
-- Currency mismatch EUR→USD on vendor 4 (rule 7: weight 20)
(20, 4, 'INV-2025-034', '2025-04-18',  9500.00,  'USD', 'Flagged',  FALSE, 'PDF',   'euro_usd_mismatch.pdf',       '/uploads/invoices/2025/04/inv_020.pdf', '2025-04-19 10:00:00', 4),
-- Weekend Saturday (rule 8: 5) + round number (rule 10: 10) = 15
(21, 3, 'INV-2025-023', '2025-04-19', 10000.00,  'USD', 'Flagged',  FALSE, 'IMAGE', 'medipharma_weekend.jpg',      '/uploads/invoices/2025/04/inv_021.jpg', '2025-04-20 08:00:00', 5),
-- Velocity spike (rule 5: weight 20)
(22, 1, 'INV-2025-005', '2025-04-22',  3750.00,  'USD', 'Flagged',  FALSE, 'PDF',   'cedar_velocity.pdf',          '/uploads/invoices/2025/04/inv_022.pdf', '2025-04-23 08:00:00', 3),
-- Amount just below threshold: 4990 vs 5000 (rule 9: weight 10)
(23, 2, 'INV-2025-014', '2025-04-25',  4990.00,  'USD', 'Flagged',  FALSE, 'PDF',   'gulf_below_threshold.pdf',    '/uploads/invoices/2025/04/inv_023.pdf', '2025-04-26 08:00:00', 5),

-- ===== PENDING (2) =====
-- VAT inconsistency (rule 12: weight 25)
(24, 3, 'INV-2025-024', '2025-05-14',  1150.00,  'USD', 'Pending',  FALSE, 'PDF',   'medipharma_vat_issue.pdf',    '/uploads/invoices/2025/05/inv_024.pdf', '2025-05-15 09:30:00', 3),
-- Line items sum mismatch (rule 11: weight 25)
(25, 4, 'INV-2025-035', '2025-05-16',  6800.00,  'EUR', 'Pending',  FALSE, 'IMAGE', 'euro_sum_mismatch.jpg',       '/uploads/invoices/2025/05/inv_025.jpg', '2025-05-17 10:00:00', 4);


-- ============================================================
-- 6. OCR_RESULTS  (25 rows — one per invoice)
-- ============================================================
INSERT INTO ocr_result (ocr_result_id, invoice_id, extracted_vendor_name, extracted_invoice_number, extracted_invoice_date, extracted_amount, extracted_currency, raw_text, extracted_at) VALUES
(1,  1,  'Cedar Tech Solutions',   'INV-2025-001', '2025-01-20',  3500.00,  'USD', 'Cedar Tech Solutions\nInvoice: INV-2025-001\nDate: 20/01/2025\nTotal: $3,500.00',                              '2025-01-21 08:31:00'),
(2,  2,  'Gulf Office Supplies',   'INV-2025-010', '2025-01-25',  7250.50,  'USD', 'Gulf Office Supplies\nInvoice: INV-2025-010\nDate: 25/01/2025\nTotal: $7,250.50',                               '2025-01-26 09:01:00'),
(3,  3,  'MediPharma SARL',        'INV-2025-020', '2025-02-05',  8200.00,  'USD', 'MediPharma SARL\nInvoice: INV-2025-020\nDate: 05/02/2025\nTotal: $8,200.00',                                   '2025-02-06 10:16:00'),
(4,  4,  'EuroLogistics GmbH',     'INV-2025-030', '2025-02-14', 15340.57,  'EUR', 'EuroLogistics GmbH\nInvoice: INV-2025-030\nDate: 14/02/2025\nTotal: EUR 15,340.57',                             '2025-02-15 11:01:00'),
(5,  5,  'Cedar Tech Solutions',   'INV-2025-002', '2025-03-10',  4100.00,  'USD', 'Cedar Tech Solutions\nInvoice: INV-2025-002\nDate: 10/03/2025\nTotal: $4,100.00',                               '2025-03-11 08:46:00'),
(6,  6,  'Pacific Trade Corp',     'INV-2025-040', '2025-03-05',  6200.00,  'USD', 'Pacific Trade Corp\nInvoice: INV-2025-040\nDate: 05/03/2025\nTotal: $6,200.00',                                 '2025-03-06 07:01:00'),
(7,  7,  'Gulf Office Supplies',   'INV-2025-011', '2025-03-15',  5800.00,  'USD', 'Gulf Office Supplies\nInvoice: INV-2025-011\nDate: 15/03/2025\nTotal: $5,800.00',                               '2025-03-16 09:31:00'),
(8,  8,  'MediPharma SARL',        'INV-2025-021', '2025-04-02',  7650.00,  'USD', 'MediPharma SARL\nInvoice: INV-2025-021\nDate: 02/04/2025\nTotal: $7,650.00',                                   '2025-04-03 10:01:00'),
(9,  9,  'EuroLogistlcs GmbH',     'INV-2025-031', '2025-04-10', 11200.00,  'EUR', 'EuroLogistlcs GmbH\nInvoice: INV-2025-031\nDate: 10/04/2025\nTotal: EUR 11,200.00',                            '2025-04-11 11:01:00'),
(10, 10, 'Pacific Trade Corp',     'INV-2025-041', '2025-04-15',  5400.00,  'USD', 'Pacific Trade Corp\nInvoice: INV-2025-041\nDate: 15/04/2025\nTotal: $5,400.00',                                 '2025-04-16 07:31:00'),
(11, 11, 'Cedar Tech Solutions',   'INV-2025-003', '2025-04-20',  3800.00,  'USD', 'Cedar Tech Solutions\nInvoice: INV-2025-003\nDate: 20/04/2025\nTotal: $3,800.00',                               '2025-04-21 08:01:00'),
(12, 12, 'Gulf Office Supplies',   'INV-2025-012', '2025-04-25',  6500.00,  'USD', 'Gulf Office Supplies\nInvoice: INV-2025-012\nDate: 25/04/2025\nTotal: $6,500.00',                               '2025-04-26 09:01:00'),
(13, 13, 'MediPharma SARL',        'INV-2025-022', '2025-05-05',  6900.00,  'USD', 'MediPharma SARL\nInvoice: INV-2025-022\nDate: 05/05/2025\nTotal: $6,900.00',                                   '2025-05-06 10:01:00'),
(14, 14, 'EuroLogistics GmbH',     'INV-2025-032', '2025-05-08', 13600.00,  'EUR', 'EuroLogistics GmbH\nInvoice: INV-2025-032\nDate: 08/05/2025\nTotal: EUR 13,600.00',                             '2025-05-09 11:01:00'),
(15, 15, 'Beirut Print House',     'INV-2025-060', '2025-05-12',  2200.00,  'USD', 'Beirut Print House\nInvoice: INV-2025-060\nDate: 12/05/2025\nTotal: $2,200.00',                                 '2025-05-13 09:01:00'),
(16, 16, 'Gulf Office Supplies',   'INV-2025-013', '2025-12-31',  5000.00,  'USD', 'Gulf Office Supplies\nInvoice: INV-2025-013\nDate: 31/12/2025\nTotal: $5,000.00',                               '2025-03-18 14:01:00'),
(17, 17, 'Cedar Tech Solutions',   'INV-2025-004', '2025-03-20', 45000.00,  'USD', 'Cedar Tech Solutions\nInvoice: INV-2025-004\nDate: 20/03/2025\nTotal: $45,000.00',                              '2025-03-21 09:31:00'),
(18, 18, 'Shadow Suppli',          'INV-2025-050', '2025-03-25',  2300.00,  'USD', 'Shadow Suppli...\nInvoice: INV-2025-050\nDate: 25/03/2025\nTotal: $2,300.00\n[OCR partial failure on vendor]',   '2025-03-26 11:31:00'),
(19, 19, 'EuroLogistics GmbH',     'INV-2025-033', '2025-03-22', 78000.00,  'USD', 'EuroLogistics GmbH\nInvoice: INV-2025-033\nDate: 22/03/2025\nTotal: $78,000.00',                               '2025-03-23 10:01:00'),
(20, 20, 'EuroLogistics GmbH',     'INV-2025-034', '2025-04-18',  9500.00,  'USD', 'EuroLogistics GmbH\nInvoice: INV-2025-034\nDate: 18/04/2025\nTotal: $9,500.00',                                '2025-04-19 10:01:00'),
(21, 21, 'MedlPharma SARL',        'INV-2025-023', '2025-04-19', 10000.00,  'USD', 'MedlPharma SARL\nInvoice: INV-2025-023\nDate: 19/04/2025\nTotal: $10,000.00',                                  '2025-04-20 08:01:00'),
(22, 22, 'Cedar Tech Solutions',   'INV-2025-005', '2025-04-22',  3750.00,  'USD', 'Cedar Tech Solutions\nInvoice: INV-2025-005\nDate: 22/04/2025\nTotal: $3,750.00',                               '2025-04-23 08:01:00'),
(23, 23, 'Gulf Office Supplies',   'INV-2025-014', '2025-04-25',  4990.00,  'USD', 'Gulf Office Supplies\nInvoice: INV-2025-014\nDate: 25/04/2025\nTotal: $4,990.00',                               '2025-04-26 08:01:00'),
(24, 24, 'MediPharma SARL',        'INV-2025-024', '2025-05-14',  1150.00,  'USD', 'MediPharma SARL\nInvoice: INV-2025-024\nDate: 14/05/2025\nSubtotal: $1,000\nVAT: $150\nTotal: $1,150',          '2025-05-15 09:31:00'),
(25, 25, 'EuroLogistics GmbH',     'INV-2025-035', '2025-05-16',  6800.00,  'EUR', 'EuroLogistics GmbH\nInvoice: INV-2025-035\nDate: 16/05/2025\nItem1: 3200\nItem2: 3000\nTotal: EUR 6,800',       '2025-05-17 10:01:00');


-- ============================================================
-- 7. FRAUD_ANALYSIS  (25 rows)
--    Scores = sum of triggered rule weights
--    Thresholds: 0-30 Low, 31-60 Medium, 61+ High
-- ============================================================
INSERT INTO fraud_analysis (analysis_id, invoice_id, risk_score, risk_level, analyzed_at) VALUES
-- Approved (clean — score 0)
(1,  1,   0.00, 'Low',    '2025-01-21 08:32:00'),
(2,  2,   0.00, 'Low',    '2025-01-26 09:02:00'),
(3,  3,   0.00, 'Low',    '2025-02-06 10:17:00'),
(4,  4,   0.00, 'Low',    '2025-02-15 11:02:00'),
(5,  5,   0.00, 'Low',    '2025-03-11 08:47:00'),
(6,  6,   0.00, 'Low',    '2025-03-06 07:02:00'),
(7,  7,   0.00, 'Low',    '2025-03-16 09:32:00'),
(8,  8,   0.00, 'Low',    '2025-04-03 10:02:00'),
(9,  9,   0.00, 'Low',    '2025-04-11 11:02:00'),
(10, 10,  0.00, 'Low',    '2025-04-16 07:32:00'),
(11, 11,  0.00, 'Low',    '2025-04-21 08:02:00'),
(12, 12,  0.00, 'Low',    '2025-04-26 09:02:00'),
(13, 13,  0.00, 'Low',    '2025-05-06 10:02:00'),
(14, 14,  0.00, 'Low',    '2025-05-09 11:02:00'),
(15, 15,  0.00, 'Low',    '2025-05-13 09:02:00'),
-- Rejected
(16, 16, 60.00, 'Medium', '2025-03-18 14:02:00'),  -- Future-Dated (60)
(17, 17, 30.00, 'Low',    '2025-03-21 09:32:00'),  -- Amount Anomaly (30)
(18, 18, 50.00, 'Medium', '2025-03-26 11:32:00'),  -- Unapproved Vendor (50)
(19, 19, 50.00, 'Medium', '2025-03-23 10:02:00'),  -- Currency Mismatch (20) + Amount Anomaly (30)
-- Flagged
(20, 20, 20.00, 'Low',    '2025-04-19 10:02:00'),  -- Currency Mismatch (20)
(21, 21, 15.00, 'Low',    '2025-04-20 08:02:00'),  -- Weekend/Holiday (5) + Round Number (10)
(22, 22, 20.00, 'Low',    '2025-04-23 08:02:00'),  -- Velocity Spike (20)
(23, 23, 10.00, 'Low',    '2025-04-26 08:02:00'),  -- Below Threshold (10)
-- Pending
(24, 24, 25.00, 'Low',    '2025-05-15 09:32:00'),  -- VAT Inconsistency (25)
(25, 25, 25.00, 'Low',    '2025-05-17 10:02:00');   -- Line Items Sum Mismatch (25)


-- ============================================================
-- 8. FRAUD_REASONS  (12 rows)
-- ============================================================
INSERT INTO fraud_reason (reason_id, analysis_id, rule_id, reason_text) VALUES
(1,  16, 6,  'Invoice date 2025-12-31 is in the future. Current processing date is 2025-03-18.'),
(2,  17, 4,  'Invoice amount $45,000.00 is 11.8x above vendor Cedar Tech Solutions average of $3,800.00.'),
(3,  18, 3,  'Vendor Shadow Supplies Co (VND-007) is not approved in the system.'),
(4,  19, 7,  'Invoice currency USD does not match vendor EuroLogistics GmbH default currency EUR.'),
(5,  19, 4,  'Invoice amount $78,000.00 is 5.9x above vendor EuroLogistics GmbH average of EUR 13,380.00.'),
(6,  20, 7,  'Invoice currency USD does not match vendor EuroLogistics GmbH default currency EUR.'),
(7,  21, 8,  'Invoice dated 2025-04-19 (Saturday) was issued on a weekend or holiday.'),
(8,  21, 10, 'Invoice total $10,000.00 is a round number with no itemized line details.'),
(9,  22, 5,  'Vendor Cedar Tech Solutions has submitted 4 invoices within a 30-day window, exceeding the normal threshold of 2.'),
(10, 23, 9,  'Invoice amount $4,990.00 is 0.2% below the approval threshold of $5,000.00.'),
(11, 24, 12, 'VAT amount $150.00 does not match expected VAT of $110.00 (11% of subtotal $1,000.00). Discrepancy: $40.00.'),
(12, 25, 11, 'Sum of line items (EUR 6,200.00) does not match invoice total (EUR 6,800.00). Discrepancy: EUR 600.00.');


-- ============================================================
-- 9. INVOICE_HISTORY  (53 rows)
-- ============================================================
INSERT INTO invoice_history (history_id, invoice_id, old_status, new_status, action_type, reason, changed_by, changed_at) VALUES
-- ===== APPROVED (15 x 2 = 30, +1 Updated for invoice 4 = 31) =====
(1,  1,  NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   3, '2025-01-21 08:30:00'),
(2,  1,  'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      3, '2025-01-21 09:00:00'),
(3,  2,  NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   3, '2025-01-26 09:00:00'),
(4,  2,  'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      3, '2025-01-26 09:30:00'),
(5,  3,  NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   4, '2025-02-06 10:15:00'),
(6,  3,  'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      4, '2025-02-06 10:45:00'),
(7,  4,  NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   3, '2025-02-15 11:00:00'),
(8,  4,  'Pending', 'Pending',  'Updated',  'OCR amount corrected from 15340.57 to 15340.75 during review.',         3, '2025-02-15 11:15:00'),
(9,  4,  'Pending', 'Approved', 'Approved', 'Approved after OCR correction verified.',                               3, '2025-02-15 11:30:00'),
(10, 5,  NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   5, '2025-03-11 08:45:00'),
(11, 5,  'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      5, '2025-03-11 09:15:00'),
(12, 6,  NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   4, '2025-03-06 07:00:00'),
(13, 6,  'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      4, '2025-03-06 07:30:00'),
(14, 7,  NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   5, '2025-03-16 09:30:00'),
(15, 7,  'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      5, '2025-03-16 10:00:00'),
(16, 8,  NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   3, '2025-04-03 10:00:00'),
(17, 8,  'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      3, '2025-04-03 10:30:00'),
(18, 9,  NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   4, '2025-04-11 11:00:00'),
(19, 9,  'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      4, '2025-04-11 11:30:00'),
(20, 10, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   5, '2025-04-16 07:30:00'),
(21, 10, 'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      5, '2025-04-16 08:00:00'),
(22, 11, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   3, '2025-04-21 08:00:00'),
(23, 11, 'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      3, '2025-04-21 08:30:00'),
(24, 12, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   4, '2025-04-26 09:00:00'),
(25, 12, 'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      4, '2025-04-26 09:30:00'),
(26, 13, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   5, '2025-05-06 10:00:00'),
(27, 13, 'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      5, '2025-05-06 10:30:00'),
(28, 14, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   3, '2025-05-09 11:00:00'),
(29, 14, 'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      3, '2025-05-09 11:30:00'),
(30, 15, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   4, '2025-05-13 09:00:00'),
(31, 15, 'Pending', 'Approved', 'Approved', 'All fraud checks passed. Approved by accountant.',                      4, '2025-05-13 09:30:00'),
-- ===== REJECTED (4 x 3 = 12 — all go Created → Flagged → Rejected) =====
(32, 16, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   3, '2025-03-18 14:00:00'),
(33, 16, 'Pending', 'Flagged',  'Flagged',  'Future-dated invoice detected by fraud analysis.',                      3, '2025-03-18 14:05:00'),
(34, 16, 'Flagged', 'Rejected', 'Rejected', 'Confirmed: invoice date 2025-12-31 is 9 months in the future.',        3, '2025-03-18 14:30:00'),
(35, 17, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   4, '2025-03-21 09:30:00'),
(36, 17, 'Pending', 'Flagged',  'Flagged',  'Amount anomaly detected: $45,000 vs vendor average $3,800.',            4, '2025-03-21 09:35:00'),
(37, 17, 'Flagged', 'Rejected', 'Rejected', 'Confirmed: amount is 11.8x above normal. Vendor contacted, no such invoice exists.', 4, '2025-03-21 10:00:00'),
(38, 18, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   4, '2025-03-26 11:30:00'),
(39, 18, 'Pending', 'Flagged',  'Flagged',  'Vendor Shadow Supplies Co is not approved in the system.',              4, '2025-03-26 11:35:00'),
(40, 18, 'Flagged', 'Rejected', 'Rejected', 'Confirmed: vendor is unknown and not authorized to submit invoices.',  4, '2025-03-26 12:00:00'),
(41, 19, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   3, '2025-03-23 10:00:00'),
(42, 19, 'Pending', 'Flagged',  'Flagged',  'Currency mismatch (USD vs EUR) and amount anomaly detected.',           3, '2025-03-23 10:05:00'),
(43, 19, 'Flagged', 'Rejected', 'Rejected', 'Confirmed: wrong currency and amount $78,000 is 5.9x above average.', 3, '2025-03-23 10:30:00'),
-- ===== FLAGGED (4 x 2 = 8) =====
(44, 20, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   4, '2025-04-19 10:00:00'),
(45, 20, 'Pending', 'Flagged',  'Flagged',  'Currency mismatch: USD instead of vendor default EUR.',                 4, '2025-04-19 10:10:00'),
(46, 21, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   5, '2025-04-20 08:00:00'),
(47, 21, 'Pending', 'Flagged',  'Flagged',  'Weekend/holiday invoice (Saturday) with round number total $10,000.',   5, '2025-04-20 08:10:00'),
(48, 22, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   3, '2025-04-23 08:00:00'),
(49, 22, 'Pending', 'Flagged',  'Flagged',  'Velocity spike: 4th invoice from Cedar Tech in 30-day window.',         3, '2025-04-23 08:10:00'),
(50, 23, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   5, '2025-04-26 08:00:00'),
(51, 23, 'Pending', 'Flagged',  'Flagged',  'Amount $4,990 is just below approval threshold of $5,000.',             5, '2025-04-26 08:10:00'),
-- ===== PENDING (2 x 1 = 2) =====
(52, 24, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   3, '2025-05-15 09:30:00'),
(53, 25, NULL,      'Pending',  'Created',  'Invoice uploaded and OCR processed.',                                   4, '2025-05-17 10:00:00');


-- ============================================================
-- 10. FRAUD_RULE_HISTORY  (10 rows)
-- ============================================================
INSERT INTO fraud_rule_history (history_id, rule_id, action_type, field_name, old_value, new_value, reason, changed_by, changed_at) VALUES
(1,  10, 'Disabled', 'is_active',   'true',  'false', 'Too many false positives on legitimate round-total invoices.',          2, '2025-02-20 15:00:00'),
(2,  12, 'Disabled', 'is_active',   'true',  'false', 'VAT calculation varies by country. Rule needs refinement.',             2, '2025-02-25 10:00:00'),
(3,  1,  'Updated',  'risk_weight', '70',    '80',    'Increased weight: exact duplicates are near-certain fraud.',             1, '2025-03-01 09:00:00'),
(4,  4,  'Updated',  'risk_weight', '25',    '30',    'Increased weight based on recent anomaly investigation findings.',      1, '2025-03-10 11:00:00'),
(5,  5,  'Updated',  'description', 'Identifies an unusual number of invoices from the same vendor within a short time period.', 'Identifies an unusual number of invoices from the same vendor within a short time period, which may indicate suspicious activity.', 'Added clarification about suspicious activity context.', 1, '2025-03-15 14:00:00'),
(6,  8,  'Disabled', 'is_active',   'true',  'false', 'Temporarily disabled during month-end batch processing period.',        2, '2025-03-28 08:00:00'),
(7,  8,  'Enabled',  'is_active',   'false', 'true',  'Re-enabled after month-end processing completed.',                      2, '2025-04-02 09:00:00'),
(8,  2,  'Updated',  'risk_weight', '20',    '25',    'Increased after near-duplicate fraud case confirmed in February.',       1, '2025-04-05 10:00:00'),
(9,  3,  'Updated',  'risk_weight', '40',    '50',    'Unapproved vendors pose higher risk than initially estimated.',          1, '2025-04-10 11:00:00'),
(10, 9,  'Updated',  'description', 'Detects invoices with amounts slightly below the approval limit to bypass authorization.', 'Detects invoices with amounts slightly below a defined approval limit, which may indicate attempts to bypass authorization controls.', 'Expanded description for clarity.', 2, '2025-04-15 14:00:00');


-- ============================================================
-- 11. SYSTEM_SETTING  (1 row)
--     low_risk_max       = 30  → score 0-30   = Low
--     medium_risk_max    = 60  → score 31-60  = Medium
--     high_risk_score_max= 100 → score 61+    = High
--     approval_threshold = 5000.00 (invoice amount in USD)
-- ============================================================
INSERT INTO system_setting (setting_id, low_risk_max, medium_risk_max, high_risk_score_max, approval_threshold, updated_by, updated_at) VALUES
(1, 30, 60, 100, 5000.00, 1, '2025-01-15 12:00:00');


-- ============================================================
-- 12. AUTH_TOKENS  (7 rows)
-- ============================================================
INSERT INTO auth_token (token_id, user_id, token_hash, issued_at, expires_at, is_revoked) VALUES
(1, 1, '$2b$10$aT1kHash01AdminNadiaActiveSession00000000000000000000000',   '2025-05-17 08:00:00', '2025-05-18 08:00:00', FALSE),
(2, 2, '$2b$10$bT2kHash02AdminOmarActiveSession000000000000000000000000',    '2025-05-17 08:30:00', '2025-05-18 08:30:00', FALSE),
(3, 3, '$2b$10$cT3kHash03AcctSaraActiveSession0000000000000000000000000',    '2025-05-17 09:00:00', '2025-05-18 09:00:00', FALSE),
(4, 4, '$2b$10$dT4kHash04AcctKarimActiveSession000000000000000000000000',    '2025-05-17 09:30:00', '2025-05-18 09:30:00', FALSE),
(5, 5, '$2b$10$eT5kHash05AcctTanyaActiveSession000000000000000000000000',    '2025-05-17 10:00:00', '2025-05-18 10:00:00', FALSE),
(6, 3, '$2b$10$fT6kHash06AcctSaraOldSessionRevoked0000000000000000000',     '2025-05-15 08:00:00', '2025-05-16 08:00:00', TRUE),
(7, 4, '$2b$10$gT7kHash07AcctKarimOldSessionRevoked000000000000000000',     '2025-05-14 09:00:00', '2025-05-15 09:00:00', TRUE);
