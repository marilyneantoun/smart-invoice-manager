// ============================================================
// server.js
// Entry point — creates the Express app, registers middleware
// and routes, then starts listening.
// ============================================================

require('dotenv').config();
const pool = require('./config/db');
const express      = require('express');
const cors         = require('cors');
const authRoutes   = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 5000;

// ---- Middleware ----

// Parse incoming JSON request bodies
app.use(express.json());

// Allow requests from the React frontend (Vite dev server)
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// ---- Routes ----
app.use('/api/auth', authRoutes);

// Health-check — useful to confirm the server is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'InvoiceShield API is running.' });
});
//db connection test
app.get('/api/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1');
    res.json({ message: 'Database connected ✅' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Database connection failed ❌', error: error.message });
  }
});

// ---- 404 handler (must be after all routes) ----
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found.` });
});

// ---- Global error handler (must be last) ----
app.use(errorHandler);

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`✅  InvoiceShield API running on http://localhost:${PORT}`);
});
