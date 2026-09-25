const axios = require('axios');

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

/**
 * Fetch incidents with optional pagination and delta-sync timestamp
 */
async function fetchIncidents({ page = 1, limit = 50, last_synced_at = null } = {}) {
  const params = { page, limit };
  if (last_synced_at) {
    params.last_synced_at = last_synced_at;
  }

  const response = await client.get('/api/incidents', { params });
  return {
    data: response.data.data,
    pagination: response.data.pagination,
    syncTimestamp: response.headers['x-sync-timestamp'] || new Date().toISOString()
  };
}

/**
 * Sync pending incidents with backend via multipart/form-data
 * Fulfills Contract Requirement 4 & Requirement 9
 */
async function syncIncidents(pendingIncidents) {
  if (!pendingIncidents || pendingIncidents.length === 0) {
    return { synced_incidents: [] };
  }

  // Use global FormData (or polyfilled FormData in React Native / node)
  const FormDataClass = typeof FormData !== 'undefined' ? FormData : require('form-data');
  const formData = new FormDataClass();

  // Clean incidents metadata for JSON transport
  const incidentsPayload = pendingIncidents.map(inc => ({
    local_id: inc.local_id,
    server_id: inc.server_id || null,
    description: inc.description,
    severity: inc.severity,
    latitude: inc.latitude,
    longitude: inc.longitude,
    photo_field: inc.photo_uri ? `photo_${inc.local_id}` : null,
    updated_at: inc.updated_at
  }));

  // Append incidents JSON string
  formData.append('incidents', JSON.stringify(incidentsPayload));

  // Append photo files as multipart parts
  for (const inc of pendingIncidents) {
    if (inc.photo_uri) {
      const fieldName = `photo_${inc.local_id}`;
      // Check if photo_uri is a local file URI or web File/Blob
      if (typeof inc.photo_uri === 'string' && inc.photo_uri.startsWith('file://')) {
        const filename = inc.photo_uri.split('/').pop() || `photo_${inc.local_id}.jpg`;
        formData.append(fieldName, {
          uri: inc.photo_uri,
          name: filename,
          type: 'image/jpeg'
        });
      } else if (typeof Blob !== 'undefined' && inc.photo_uri instanceof Blob) {
        formData.append(fieldName, inc.photo_uri, `photo_${inc.local_id}.jpg`);
      } else {
        // Mock / string uri for testing
        formData.append(fieldName, {
          uri: inc.photo_uri,
          name: `photo_${inc.local_id}.jpg`,
          type: 'image/jpeg'
        });
      }
    }
  }

  const headers = {
    'Content-Type': 'multipart/form-data',
    ...(typeof formData.getHeaders === 'function' ? formData.getHeaders() : {})
  };

  const response = await client.post('/api/incidents', formData, { headers });
  return response.data;
}

module.exports = {
  client,
  fetchIncidents,
  syncIncidents,
  API_BASE_URL
};
