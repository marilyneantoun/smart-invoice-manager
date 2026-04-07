// ============================================================
// config/db.js
// Creates and exports the MySQL connection pool.
// All other files import `pool` from here to run queries.
// ============================================================

const mysql = require('mysql2/promise');
require('dotenv').config();

// A pool keeps several connections open and reuses them,
// which is more efficient than opening a new connection
// for every single query.
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  database: process.env.DB_NAME     || 'invoice_fraud_db',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',

  // Keep up to 10 connections open at once
  connectionLimit: 10,

  // Automatically convert MySQL date values to JS Date objects
  dateStrings: false,
});

module.exports = pool;
