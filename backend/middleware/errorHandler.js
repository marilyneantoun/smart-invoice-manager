// ============================================================
// middleware/errorHandler.js
//
// Global error handler — registered LAST in server.js.
// Catches any error passed via next(err) from any route.
//
// Always returns a clean JSON response instead of an
// HTML stack trace being visible to the client.
// ============================================================

function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);

  const statusCode = err.status || 500;
  const message    = err.message || 'An unexpected error occurred.';

  res.status(statusCode).json({ message });
}

module.exports = errorHandler;
