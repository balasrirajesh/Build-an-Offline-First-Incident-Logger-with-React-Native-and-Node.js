const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/incidents_db';

let pool;
let isPgAvailable = null;

// In-memory store fallback for standalone / isolated test environments without a live Postgres
const memoryStore = new Map();

function initInMemoryStore() {
  if (memoryStore.size === 0) {
    try {
      const seedPath = path.join(__dirname, '..', 'seed.sql');
      if (fs.existsSync(seedPath)) {
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        const insertRegex = /INSERT INTO incidents \([^)]+\) VALUES\s*([\s\S]+?);/i;
        const match = seedSql.match(insertRegex);
        if (match) {
          const valuesString = match[1];
          const rowRegex = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*([-\d.]+),\s*([-\d.]+),\s*(NULL|'[^']*'),\s*'([^']+)',\s*'([^']+)'\)/g;
          let row;
          while ((row = rowRegex.exec(valuesString)) !== null) {
            const id = row[1];
            const description = row[2];
            const severity = row[3];
            const latitude = parseFloat(row[4]);
            const longitude = parseFloat(row[5]);
            const photo_url = row[6] === 'NULL' ? null : row[6].replace(/'/g, '');
            const created_at = new Date(row[7]).toISOString();
            const updated_at = new Date(row[8]).toISOString();
            memoryStore.set(id, {
              id,
              description,
              severity,
              latitude,
              longitude,
              photo_url,
              created_at,
              updated_at
            });
          }
        }
      }
    } catch (err) {
      console.warn('Fallback memory store init error:', err.message);
    }
  }
}

async function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}

async function testPgConnection() {
  if (isPgAvailable !== null) return isPgAvailable;
  try {
    const p = await getPool();
    const client = await p.connect();
    await client.query('SELECT 1');
    client.release();
    isPgAvailable = true;
    console.log('Connected to PostgreSQL successfully.');
  } catch (err) {
    isPgAvailable = false;
    console.warn(`PostgreSQL not reachable at ${connectionString}, using in-memory store fallback. (${err.message})`);
    initInMemoryStore();
  }
  return isPgAvailable;
}

async function query(text, params = []) {
  const pgReady = await testPgConnection();
  if (pgReady) {
    const p = await getPool();
    return p.query(text, params);
  }

  // Memory store query simulation for SELECT, INSERT, UPDATE, COUNT
  const trimmed = text.trim();
  initInMemoryStore();

  if (/^SELECT\s+1/i.test(trimmed)) {
    return { rows: [{ '?column?': 1 }], rowCount: 1 };
  }

  if (/^SELECT\s+COUNT\(\*\)\s+FROM\s+incidents/i.test(trimmed)) {
    let rows = Array.from(memoryStore.values());
    if (/WHERE updated_at > \$1/i.test(trimmed) && params.length > 0) {
      const sinceDate = new Date(params[0]);
      rows = rows.filter(r => new Date(r.updated_at) > sinceDate);
    }
    return { rows: [{ count: rows.length.toString() }], rowCount: 1 };
  }

  if (/^SELECT\s+\*\s+FROM\s+incidents/i.test(trimmed)) {
    let rows = Array.from(memoryStore.values());
    let paramIndex = 0;

    if (/WHERE updated_at > \$1/i.test(trimmed)) {
      const sinceDate = new Date(params[paramIndex++]);
      rows = rows.filter(r => new Date(r.updated_at) > sinceDate);
    }

    if (/WHERE id = \$1/i.test(trimmed)) {
      const targetId = params[0];
      rows = rows.filter(r => r.id === targetId);
      return { rows, rowCount: rows.length };
    }

    // Sort by updated_at desc
    rows.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    // Handle LIMIT and OFFSET
    const limitMatch = trimmed.match(/LIMIT\s+\$(\d+)/i);
    const offsetMatch = trimmed.match(/OFFSET\s+\$(\d+)/i);
    if (limitMatch && offsetMatch) {
      const limitParamIndex = parseInt(limitMatch[1], 10) - 1;
      const offsetParamIndex = parseInt(offsetMatch[1], 10) - 1;
      const limit = params[limitParamIndex];
      const offset = params[offsetParamIndex];
      rows = rows.slice(offset, offset + limit);
    }

    return { rows, rowCount: rows.length };
  }

  if (/^INSERT\s+INTO\s+incidents/i.test(trimmed)) {
    // INSERT INTO incidents (id, description, severity, latitude, longitude, photo_url, created_at, updated_at)
    // ON CONFLICT (id) DO UPDATE ...
    const [id, description, severity, latitude, longitude, photo_url, created_at, updated_at] = params;
    const existing = memoryStore.get(id);
    const record = {
      id,
      description,
      severity,
      latitude: latitude !== undefined ? latitude : null,
      longitude: longitude !== undefined ? longitude : null,
      photo_url: photo_url !== undefined ? photo_url : (existing ? existing.photo_url : null),
      created_at: existing ? existing.created_at : (created_at || new Date().toISOString()),
      updated_at: updated_at || new Date().toISOString()
    };
    memoryStore.set(id, record);
    return { rows: [record], rowCount: 1 };
  }

  if (/^UPDATE\s+incidents/i.test(trimmed)) {
    const id = params[params.length - 1];
    const existing = memoryStore.get(id);
    if (existing) {
      const record = {
        ...existing,
        description: params[0],
        severity: params[1],
        latitude: params[2],
        longitude: params[3],
        photo_url: params[4] || existing.photo_url,
        updated_at: params[5] || new Date().toISOString()
      };
      memoryStore.set(id, record);
      return { rows: [record], rowCount: 1 };
    }
  }

  return { rows: [], rowCount: 0 };
}

module.exports = {
  query,
  testPgConnection,
  getPool,
  memoryStore
};
