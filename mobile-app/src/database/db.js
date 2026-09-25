/**
 * Local Database management using SQLite (expo-sqlite with memory store fallback)
 * Fulfills Contract Requirement 5
 */

let expoSQLite;
try {
  expoSQLite = require('expo-sqlite');
} catch (e) {
  // Fallback for Node.js / Jest / Web environments
  expoSQLite = null;
}

let dbInstance = null;

// In-memory table representation for Node / Web / Test environments
const inMemoryIncidents = new Map();

/**
 * Open or create the local SQLite database
 */
async function getDb() {
  if (dbInstance) return dbInstance;

  if (expoSQLite && typeof expoSQLite.openDatabaseSync === 'function') {
    dbInstance = expoSQLite.openDatabaseSync('incident_logger.db');
  } else if (expoSQLite && typeof expoSQLite.openDatabaseAsync === 'function') {
    dbInstance = await expoSQLite.openDatabaseAsync('incident_logger.db');
  } else if (expoSQLite && typeof expoSQLite.openDatabase === 'function') {
    dbInstance = expoSQLite.openDatabase('incident_logger.db');
  }

  return dbInstance;
}

/**
 * Initialize SQLite table schema according to contract specifications
 */
async function initDatabase() {
  const db = await getDb();
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS incidents (
      local_id TEXT PRIMARY KEY NOT NULL,
      server_id TEXT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      photo_uri TEXT NULL,
      sync_status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      latitude REAL NULL,
      longitude REAL NULL,
      server_version TEXT NULL
    );
  `;

  if (db) {
    if (typeof db.execAsync === 'function') {
      await db.execAsync(createTableSQL);
    } else if (typeof db.execSync === 'function') {
      db.execSync(createTableSQL);
    } else if (typeof db.transaction === 'function') {
      await new Promise((resolve, reject) => {
        db.transaction(tx => {
          tx.executeSql(createTableSQL, [], () => resolve(), (_, err) => reject(err));
        });
      });
    }
  }

  return true;
}

/**
 * Exposes all records currently in the local incidents table
 * Required by Contract Requirement 5: window.getLocalIncidents()
 */
async function getLocalIncidents() {
  await initDatabase();
  const db = await getDb();

  if (db) {
    try {
      if (typeof db.getAllAsync === 'function') {
        const rows = await db.getAllAsync('SELECT * FROM incidents ORDER BY updated_at DESC');
        return rows.map(formatRecord);
      } else if (typeof db.getAllSync === 'function') {
        const rows = db.getAllSync('SELECT * FROM incidents ORDER BY updated_at DESC');
        return rows.map(formatRecord);
      } else if (typeof db.transaction === 'function') {
        return new Promise((resolve, reject) => {
          db.transaction(tx => {
            tx.executeSql(
              'SELECT * FROM incidents ORDER BY updated_at DESC',
              [],
              (_, { rows }) => {
                const results = [];
                for (let i = 0; i < rows.length; i++) {
                  results.push(formatRecord(rows.item(i)));
                }
                resolve(results);
              },
              (_, err) => reject(err)
            );
          });
        });
      }
    } catch (err) {
      console.warn('Native SQLite query failed, returning in-memory records:', err.message);
    }
  }

  // In-memory fallback
  const records = Array.from(inMemoryIncidents.values());
  records.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  return records.map(formatRecord);
}

/**
 * Format a record ensuring required schema types
 */
function formatRecord(row) {
  if (!row) return null;
  return {
    local_id: String(row.local_id),
    server_id: row.server_id ? String(row.server_id) : null,
    description: String(row.description || ''),
    severity: String(row.severity || 'Medium'),
    photo_uri: row.photo_uri ? String(row.photo_uri) : null,
    sync_status: String(row.sync_status || 'pending'),
    updated_at: String(row.updated_at || new Date().toISOString()),
    latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
    server_version: row.server_version ? (typeof row.server_version === 'string' ? row.server_version : JSON.stringify(row.server_version)) : null
  };
}

/**
 * Get pending incidents for sync
 */
async function getPendingIncidents() {
  const incidents = await getLocalIncidents();
  return incidents.filter(i => i.sync_status === 'pending');
}

/**
 * Get incident by local_id
 */
async function getIncidentById(local_id) {
  const incidents = await getLocalIncidents();
  return incidents.find(i => i.local_id === local_id) || null;
}

/**
 * Insert a new incident into SQLite
 */
async function insertIncident(data) {
  await initDatabase();
  const db = await getDb();

  const record = {
    local_id: data.local_id || `loc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    server_id: data.server_id || null,
    description: data.description || '',
    severity: data.severity || 'Medium',
    photo_uri: data.photo_uri || null,
    sync_status: data.sync_status || 'pending',
    updated_at: data.updated_at || new Date().toISOString(),
    latitude: data.latitude !== undefined ? data.latitude : null,
    longitude: data.longitude !== undefined ? data.longitude : null,
    server_version: data.server_version ? JSON.stringify(data.server_version) : null
  };

  inMemoryIncidents.set(record.local_id, record);

  if (db) {
    try {
      const sql = `
        INSERT OR REPLACE INTO incidents (local_id, server_id, description, severity, photo_uri, sync_status, updated_at, latitude, longitude, server_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        record.local_id,
        record.server_id,
        record.description,
        record.severity,
        record.photo_uri,
        record.sync_status,
        record.updated_at,
        record.latitude,
        record.longitude,
        record.server_version
      ];

      if (typeof db.runAsync === 'function') {
        await db.runAsync(sql, params);
      } else if (typeof db.runSync === 'function') {
        db.runSync(sql, params);
      } else if (typeof db.transaction === 'function') {
        await new Promise((resolve, reject) => {
          db.transaction(tx => {
            tx.executeSql(sql, params, () => resolve(), (_, err) => reject(err));
          });
        });
      }
    } catch (err) {
      console.warn('Native SQLite insert failed, saved to memory store:', err.message);
    }
  }

  return formatRecord(record);
}

/**
 * Update an existing incident in SQLite
 */
async function updateIncident(local_id, updates) {
  const existing = await getIncidentById(local_id);
  if (!existing) {
    throw new Error(`Incident with local_id ${local_id} not found`);
  }

  const updatedRecord = {
    ...existing,
    ...updates,
    local_id,
    updated_at: updates.updated_at || new Date().toISOString()
  };

  inMemoryIncidents.set(local_id, updatedRecord);

  const db = await getDb();
  if (db) {
    try {
      const sql = `
        UPDATE incidents 
        SET server_id = ?, description = ?, severity = ?, photo_uri = ?, sync_status = ?, updated_at = ?, latitude = ?, longitude = ?, server_version = ?
        WHERE local_id = ?
      `;
      const params = [
        updatedRecord.server_id,
        updatedRecord.description,
        updatedRecord.severity,
        updatedRecord.photo_uri,
        updatedRecord.sync_status,
        updatedRecord.updated_at,
        updatedRecord.latitude,
        updatedRecord.longitude,
        updatedRecord.server_version ? (typeof updatedRecord.server_version === 'object' ? JSON.stringify(updatedRecord.server_version) : updatedRecord.server_version) : null,
        local_id
      ];

      if (typeof db.runAsync === 'function') {
        await db.runAsync(sql, params);
      } else if (typeof db.runSync === 'function') {
        db.runSync(sql, params);
      } else if (typeof db.transaction === 'function') {
        await new Promise((resolve, reject) => {
          db.transaction(tx => {
            tx.executeSql(sql, params, () => resolve(), (_, err) => reject(err));
          });
        });
      }
    } catch (err) {
      console.warn('Native SQLite update failed:', err.message);
    }
  }

  return formatRecord(updatedRecord);
}

/**
 * Mark incident as successfully synced
 */
async function markIncidentSynced(local_id, server_id) {
  return updateIncident(local_id, {
    server_id: server_id || undefined,
    sync_status: 'synced',
    server_version: null
  });
}

/**
 * Mark incident as conflicted with server data
 */
async function markIncidentConflict(local_id, serverVersionData) {
  return updateIncident(local_id, {
    sync_status: 'conflict',
    server_version: typeof serverVersionData === 'string' ? serverVersionData : JSON.stringify(serverVersionData)
  });
}

/**
 * Resolve a conflict between local version and server version
 * - 'local': Keep local version (marks sync_status as 'pending' to push on next sync)
 * - 'server': Accept server version (updates fields with server copy and marks as 'synced')
 * - 'merge': Keep merged/custom fields and mark as 'pending'
 */
async function resolveConflict(local_id, resolutionChoice, mergedData = {}) {
  const existing = await getIncidentById(local_id);
  if (!existing) throw new Error(`Incident ${local_id} not found`);

  let serverData = null;
  if (existing.server_version) {
    try {
      serverData = JSON.parse(existing.server_version);
    } catch (e) {
      serverData = null;
    }
  }

  if (resolutionChoice === 'local') {
    return updateIncident(local_id, {
      sync_status: 'pending',
      server_version: null,
      updated_at: new Date().toISOString()
    });
  } else if (resolutionChoice === 'server') {
    if (!serverData) throw new Error('No server version found for conflict resolution');
    return updateIncident(local_id, {
      description: serverData.description || existing.description,
      severity: serverData.severity || existing.severity,
      latitude: serverData.latitude !== undefined ? serverData.latitude : existing.latitude,
      longitude: serverData.longitude !== undefined ? serverData.longitude : existing.longitude,
      photo_uri: serverData.photo_url || existing.photo_uri,
      server_id: serverData.id || existing.server_id,
      sync_status: 'synced',
      server_version: null,
      updated_at: serverData.updated_at || new Date().toISOString()
    });
  } else if (resolutionChoice === 'merge') {
    return updateIncident(local_id, {
      ...mergedData,
      sync_status: 'pending',
      server_version: null,
      updated_at: new Date().toISOString()
    });
  }
}

/**
 * Clear all data (for testing purposes)
 */
async function clearDatabase() {
  inMemoryIncidents.clear();
  const db = await getDb();
  if (db) {
    try {
      if (typeof db.execAsync === 'function') {
        await db.execAsync('DELETE FROM incidents;');
      } else if (typeof db.execSync === 'function') {
        db.execSync('DELETE FROM incidents;');
      }
    } catch (e) {}
  }
}

// Bind window.getLocalIncidents() global hook for testing contract verification
const getLocalIncidentsGlobal = () => getLocalIncidents();

if (typeof window !== 'undefined') {
  window.getLocalIncidents = getLocalIncidentsGlobal;
  window.createLocalIncident = insertIncident;
  window.setLocalIncidentConflict = markIncidentConflict;
  window.resolveIncidentConflict = resolveConflict;
}
if (typeof global !== 'undefined') {
  global.getLocalIncidents = getLocalIncidentsGlobal;
  global.createLocalIncident = insertIncident;
  global.setLocalIncidentConflict = markIncidentConflict;
  global.resolveIncidentConflict = resolveConflict;
}
if (typeof globalThis !== 'undefined') {
  globalThis.getLocalIncidents = getLocalIncidentsGlobal;
}

module.exports = {
  initDatabase,
  getLocalIncidents,
  getPendingIncidents,
  getIncidentById,
  insertIncident,
  updateIncident,
  markIncidentSynced,
  markIncidentConflict,
  resolveConflict,
  clearDatabase
};
