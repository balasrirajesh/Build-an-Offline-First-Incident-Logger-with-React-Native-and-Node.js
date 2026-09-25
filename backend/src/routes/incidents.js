const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
const uploadPath = path.resolve(uploadDir);
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Configure multer storage for photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `incident-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

/**
 * GET /api/incidents
 * Query params:
 *   - page (optional, default 1)
 *   - limit (optional, default 20)
 *   - last_synced_at (optional, ISO 8601 string)
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 20);
    const offset = (page - 1) * limit;
    const lastSyncedAt = req.query.last_synced_at;

    let queryText = 'SELECT * FROM incidents';
    let countQueryText = 'SELECT COUNT(*) FROM incidents';
    const queryParams = [];
    const countParams = [];

    if (lastSyncedAt) {
      const parsedDate = new Date(lastSyncedAt);
      if (!isNaN(parsedDate.getTime())) {
        queryText += ' WHERE updated_at > $1';
        countQueryText += ' WHERE updated_at > $1';
        queryParams.push(parsedDate.toISOString());
        countParams.push(parsedDate.toISOString());
      }
    }

    queryText += ` ORDER BY updated_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const [dataResult, countResult] = await Promise.all([
      db.query(queryText, queryParams),
      db.query(countQueryText, countParams)
    ]);

    const totalItems = parseInt(countResult.rows[0].count, 10) || 0;
    const totalPages = Math.ceil(totalItems / limit) || (totalItems === 0 ? 0 : 1);

    const data = dataResult.rows.map(row => ({
      id: String(row.id),
      description: row.description,
      severity: row.severity,
      latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
      longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
      photo_url: row.photo_url || null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString()
    }));

    // Expose current sync timestamp in header
    res.setHeader('X-Sync-Timestamp', new Date().toISOString());

    return res.status(200).json({
      data,
      pagination: {
        page,
        limit,
        total_items: totalItems,
        total_pages: totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching incidents:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * POST /api/incidents
 * Multipart/form-data or JSON bulk/single upsert endpoint
 */
router.post('/', upload.any(), async (req, res) => {
  try {
    let incidents = [];

    // Check if incidents was passed as JSON in body.incidents
    if (req.body.incidents) {
      if (typeof req.body.incidents === 'string') {
        try {
          incidents = JSON.parse(req.body.incidents);
        } catch (e) {
          incidents = [req.body.incidents];
        }
      } else if (Array.isArray(req.body.incidents)) {
        incidents = req.body.incidents;
      } else if (typeof req.body.incidents === 'object') {
        incidents = [req.body.incidents];
      }
    } else if (req.body.incident) {
      const parsed = typeof req.body.incident === 'string' ? JSON.parse(req.body.incident) : req.body.incident;
      incidents = Array.isArray(parsed) ? parsed : [parsed];
    } else if (Array.isArray(req.body)) {
      incidents = req.body;
    } else if (req.body.description || req.body.local_id) {
      // Single incident fields sent directly in form-data
      incidents = [req.body];
    }

    if (!Array.isArray(incidents)) {
      incidents = [incidents];
    }

    const uploadedFiles = req.files || [];
    const syncedIncidents = [];

    for (let i = 0; i < incidents.length; i++) {
      const item = incidents[i];
      if (!item) continue;

      const localId = item.local_id || item.id || `loc-${uuidv4()}`;
      let serverId = item.server_id || (item.id && !item.id.startsWith('loc-') ? item.id : null);
      const description = item.description || 'Untitled Incident';
      const severity = item.severity || 'Medium';
      const latitude = item.latitude !== undefined && item.latitude !== null && item.latitude !== '' ? parseFloat(item.latitude) : null;
      const longitude = item.longitude !== undefined && item.longitude !== null && item.longitude !== '' ? parseFloat(item.longitude) : null;
      
      // Match uploaded photo file for this incident if available
      let photoUrl = item.photo_url || null;
      
      // Look for a file matching photo_field or index or local_id
      const matchedFile = uploadedFiles.find(f => 
        f.fieldname === `photo_${localId}` ||
        f.fieldname === `photo_${i}` ||
        f.fieldname === 'photo' ||
        f.fieldname === 'photos' ||
        f.fieldname === item.photo_field
      );

      if (matchedFile) {
        photoUrl = `/uploads/${matchedFile.filename}`;
      } else if (uploadedFiles.length > i && !photoUrl) {
        photoUrl = `/uploads/${uploadedFiles[i].filename}`;
      }

      const now = new Date().toISOString();

      // Check if serverId exists in database
      let existingRecord = null;
      if (serverId) {
        const checkResult = await db.query('SELECT * FROM incidents WHERE id = $1', [serverId]);
        if (checkResult.rows.length > 0) {
          existingRecord = checkResult.rows[0];
        }
      }

      if (existingRecord) {
        // Update existing record
        const finalPhotoUrl = photoUrl || existingRecord.photo_url;
        await db.query(
          `UPDATE incidents 
           SET description = $1, severity = $2, latitude = $3, longitude = $4, photo_url = $5, updated_at = $6
           WHERE id = $7`,
          [description, severity, latitude, longitude, finalPhotoUrl, now, serverId]
        );
      } else {
        // Insert new record
        serverId = serverId || `srv-${uuidv4()}`;
        await db.query(
          `INSERT INTO incidents (id, description, severity, latitude, longitude, photo_url, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE 
           SET description = EXCLUDED.description,
               severity = EXCLUDED.severity,
               latitude = EXCLUDED.latitude,
               longitude = EXCLUDED.longitude,
               photo_url = COALESCE(EXCLUDED.photo_url, incidents.photo_url),
               updated_at = EXCLUDED.updated_at`,
          [serverId, description, severity, latitude, longitude, photoUrl, now, now]
        );
      }

      syncedIncidents.push({
        local_id: localId,
        server_id: serverId,
        status: 'synced'
      });
    }

    return res.status(200).json({
      synced_incidents: syncedIncidents
    });
  } catch (error) {
    console.error('Error syncing incidents:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

module.exports = router;
