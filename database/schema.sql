-- ============================================================
-- Invoice Fraud Detection & Management System
-- Database Schema for MySQL (XAMPP / phpMyAdmin)
-- ============================================================

-- Drop database if it exists, then create fresh
DROP DATABASE IF EXISTS invoice_fraud_db;
CREATE DATABASE invoice_fraud_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE invoice_fraud_db;


-- ============================================================
-- 1. ROLE
-- ============================================================
CREATE TABLE role (
    role_id   INT AUTO_INCREMENT PRIMARY KEY,
    role_name ENUM('Admin', 'Accountant', 'Viewer') NOT NULL
) ENGINE=InnoDB;


-- ============================================================
-- 2. USER
-- ============================================================
CREATE TABLE `user` (
    user_id       INT AUTO_INCREMENT PRIMARY KEY,
    full_name     VARCHAR(100)  NOT NULL,
    email         VARCHAR(150)  NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    role_id       INT           NOT NULL,

    CONSTRAINT fk_user_role
        FOREIGN KEY (role_id) REFERENCES role(role_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;


-- ============================================================
-- 3. VENDOR
-- ============================================================
CREATE TABLE vendor (
    vendor_id         INT AUTO_INCREMENT PRIMARY KEY,
    vendor_name       VARCHAR(150)  NOT NULL,
    vendor_code       VARCHAR(50)   NOT NULL UNIQUE,
    email             VARCHAR(150)  NOT NULL UNIQUE,
    phone_number      VARCHAR(30)   DEFAULT NULL,
    address           VARCHAR(255)  DEFAULT NULL,
    country           VARCHAR(100)  DEFAULT NULL,
    default_currency  VARCHAR(10)   NOT NULL DEFAULT 'USD',
    is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
    is_approved       BOOLEAN       NOT NULL DEFAULT FALSE,
    registration_date DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by        INT           NOT NULL,

    CONSTRAINT fk_vendor_created_by
        FOREIGN KEY (created_by) REFERENCES `user`(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;


-- ============================================================
-- 4. INVOICE
-- ============================================================
-- UNIQUE constraint on (vendor_id, invoice_number) ensures
-- no two invoices share the same vendor + invoice number.
-- ============================================================
CREATE TABLE invoice (
    invoice_id              INT AUTO_INCREMENT PRIMARY KEY,
    vendor_id               INT            NOT NULL,
    invoice_number          VARCHAR(100)   NOT NULL,
    invoice_date            DATE           NOT NULL,
    amount                  DECIMAL(15,2)  NOT NULL,
    currency                VARCHAR(10)    NOT NULL,
    status                  ENUM('Pending', 'Approved', 'Rejected', 'Flagged')
                                           NOT NULL DEFAULT 'Pending',
    was_corrected_at_review BOOLEAN        NOT NULL DEFAULT FALSE,
    file_type               ENUM('PDF', 'IMAGE') NOT NULL,
    original_file_name      VARCHAR(255)   NOT NULL,
    stored_file_path        VARCHAR(500)   NOT NULL,
    uploaded_at             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_by             INT            NOT NULL,

    -- Composite unique constraint: vendor + invoice number
    CONSTRAINT uq_vendor_invoice UNIQUE (vendor_id, invoice_number),

    CONSTRAINT fk_invoice_vendor
        FOREIGN KEY (vendor_id) REFERENCES vendor(vendor_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_invoice_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES `user`(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;


-- ============================================================
-- 5. OCR_RESULT  (one-to-one with INVOICE)
-- ============================================================
CREATE TABLE ocr_result (
    ocr_result_id            INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id               INT            NOT NULL UNIQUE,
    extracted_vendor_name    VARCHAR(150)   DEFAULT NULL,
    extracted_invoice_number VARCHAR(100)   DEFAULT NULL,
    extracted_invoice_date   DATE           DEFAULT NULL,
    extracted_amount         DECIMAL(15,2)  DEFAULT NULL,
    extracted_currency       VARCHAR(10)    DEFAULT NULL,
    raw_text                 TEXT           DEFAULT NULL,
    extracted_at             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ocr_invoice
        FOREIGN KEY (invoice_id) REFERENCES invoice(invoice_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;


-- ============================================================
-- 6. FRAUD_ANALYSIS  (one-to-one with INVOICE)
-- ============================================================
CREATE TABLE fraud_analysis (
    analysis_id  INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id   INT            NOT NULL UNIQUE,
    risk_score   DECIMAL(7,2)   NOT NULL,
    risk_level   ENUM('Low', 'Medium', 'High') NOT NULL,
    analyzed_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_analysis_invoice
        FOREIGN KEY (invoice_id) REFERENCES invoice(invoice_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;


-- ============================================================
-- 7. FRAUD_RULE
-- ============================================================
CREATE TABLE fraud_rule (
    rule_id     INT AUTO_INCREMENT PRIMARY KEY,
    rule_name   VARCHAR(150)  NOT NULL UNIQUE,
    description TEXT          DEFAULT NULL,
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    risk_weight INT           NOT NULL DEFAULT 1,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by  INT           NOT NULL,

    CONSTRAINT chk_fraud_rule_risk_weight CHECK (risk_weight >= 0),

    CONSTRAINT fk_rule_created_by
        FOREIGN KEY (created_by) REFERENCES `user`(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;


-- ============================================================
-- 8. FRAUD_REASON  (links FRAUD_ANALYSIS ↔ FRAUD_RULE)
-- ============================================================
CREATE TABLE fraud_reason (
    reason_id    INT AUTO_INCREMENT PRIMARY KEY,
    analysis_id  INT           NOT NULL,
    rule_id      INT           NOT NULL,
    reason_text  VARCHAR(500)  NOT NULL,

    CONSTRAINT fk_reason_analysis
        FOREIGN KEY (analysis_id) REFERENCES fraud_analysis(analysis_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_reason_rule
        FOREIGN KEY (rule_id) REFERENCES fraud_rule(rule_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;


-- ============================================================
-- 9. INVOICE_HISTORY
-- ============================================================
CREATE TABLE invoice_history (
    history_id   INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id   INT           NOT NULL,
    old_status   ENUM('Pending', 'Approved', 'Rejected', 'Flagged') DEFAULT NULL,
    new_status   ENUM('Pending', 'Approved', 'Rejected', 'Flagged') NOT NULL,
    action_type  ENUM('Created', 'Approved', 'Rejected', 'Flagged', 'Updated')
                               NOT NULL,
    reason       VARCHAR(500)  DEFAULT NULL,
    changed_by   INT           NOT NULL,
    changed_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_inv_history_invoice
        FOREIGN KEY (invoice_id) REFERENCES invoice(invoice_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_inv_history_user
        FOREIGN KEY (changed_by) REFERENCES `user`(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;


-- ============================================================
-- 10. FRAUD_RULE_HISTORY
-- ============================================================
CREATE TABLE fraud_rule_history (
    history_id   INT AUTO_INCREMENT PRIMARY KEY,
    rule_id      INT           NOT NULL,
    action_type  ENUM('Enabled', 'Disabled', 'Updated')
                               NOT NULL,
    field_name   VARCHAR(100)  DEFAULT NULL,
    old_value    VARCHAR(255)  DEFAULT NULL,
    new_value    VARCHAR(255)  DEFAULT NULL,
    reason       VARCHAR(500)  DEFAULT NULL,
    changed_by   INT           NOT NULL,
    changed_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_rule_history_rule
        FOREIGN KEY (rule_id) REFERENCES fraud_rule(rule_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_rule_history_user
        FOREIGN KEY (changed_by) REFERENCES `user`(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;


-- ============================================================
-- 11. SYSTEM_SETTING  (single row, updated in place)
-- ============================================================
CREATE TABLE system_setting (
    setting_id         INT AUTO_INCREMENT PRIMARY KEY,
    low_risk_max       INT            NOT NULL DEFAULT 30,
    medium_risk_max    INT            NOT NULL DEFAULT 60,
    high_risk_score_max INT           NOT NULL DEFAULT 100,
    approval_threshold DECIMAL(15,2)  NOT NULL DEFAULT 5000.00,
    updated_by         INT       NOT NULL,
    updated_at         DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_setting_low_risk    CHECK (low_risk_max >= 0),
    CONSTRAINT chk_setting_medium_risk CHECK (medium_risk_max >= 0),
    CONSTRAINT chk_setting_high_risk   CHECK (high_risk_score_max >= 0),
    CONSTRAINT chk_setting_approval    CHECK (approval_threshold >= 0),

    CONSTRAINT fk_setting_user
        FOREIGN KEY (updated_by) REFERENCES `user`(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;


-- ============================================================
-- 12. AUTH_TOKEN
-- ============================================================
CREATE TABLE auth_token (
    token_id    INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT           NOT NULL,
    token_hash  VARCHAR(255)  NOT NULL,
    issued_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME      NOT NULL,
    is_revoked  BOOLEAN       NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_token_user
        FOREIGN KEY (user_id) REFERENCES `user`(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;


-- ============================================================
-- INDEXES for common query patterns
-- ============================================================

-- Fast lookup: invoices by status (dashboard, filtering)
CREATE INDEX idx_invoice_status      ON invoice(status);

-- Fast lookup: invoices by date (filtering, fraud date checks)
CREATE INDEX idx_invoice_date        ON invoice(invoice_date);

-- Fast lookup: invoices by vendor (vendor page, fraud velocity)
CREATE INDEX idx_invoice_vendor      ON invoice(vendor_id);

-- Fast lookup: fraud analysis by risk level (dashboard)
CREATE INDEX idx_analysis_risk_level ON fraud_analysis(risk_level);

-- Fast lookup: active tokens that haven't expired
CREATE INDEX idx_token_user_active   ON auth_token(user_id, is_revoked, expires_at);

-- Fast lookup: invoice history by invoice
CREATE INDEX idx_inv_history_invoice ON invoice_history(invoice_id);

-- Fast lookup: active fraud rules
CREATE INDEX idx_rule_active         ON fraud_rule(is_active);
