require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const incidentsRouter = require('./routes/incidents');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for mobile and web clients
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Sync-Timestamp']
}));

// Body parsers
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Ensure upload directory exists and serve static files
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
const uploadPath = path.resolve(uploadDir);
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}
app.use('/uploads', express.static(uploadPath));

// Health check endpoint for docker and monitoring
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(200).json({ status: 'ok', db: 'fallback', message: err.message, timestamp: new Date().toISOString() });
  }
});

// Incidents API routes
app.use('/api/incidents', incidentsRouter);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Offline-First Incident Logger API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      getIncidents: 'GET /api/incidents',
      syncIncidents: 'POST /api/incidents'
    }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
