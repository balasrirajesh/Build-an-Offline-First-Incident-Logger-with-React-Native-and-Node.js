jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }))
}), { virtual: true });

jest.mock('../mobile-app/src/services/api');

const { SyncService } = require('../mobile-app/src/services/syncService');
const db = require('../mobile-app/src/database/db');
const api = require('../mobile-app/src/services/api');

describe('Field Incident Logger - Data Synchronization Logic', () => {
  let syncService;

  beforeEach(async () => {
    await db.clearDatabase();
    jest.clearAllMocks();
    syncService = new SyncService();
  });

  afterAll(async () => {
    await db.clearDatabase();
  });

  describe('Local Incident Creation (Offline Mode)', () => {
    it('creates an incident locally with sync_status="pending"', async () => {
      const record = await db.insertIncident({
        description: 'Turbine bearing temperature anomalous',
        severity: 'High',
        latitude: 37.7749,
        longitude: -122.4194,
        photo_uri: 'file:///local/path/turbine.jpg'
      });

      expect(record.local_id).toBeDefined();
      expect(record.sync_status).toBe('pending');
      expect(record.server_id).toBeNull();

      const all = await db.getLocalIncidents();
      expect(all.length).toBe(1);
      expect(all[0].local_id).toBe(record.local_id);
    });
  });

  describe('Sync Push Operation', () => {
    it('pushes pending incidents to backend and marks them synced with server_id', async () => {
      const record = await db.insertIncident({
        description: 'Faulty emergency lighting on Floor 2',
        severity: 'Medium'
      });

      api.syncIncidents.mockResolvedValueOnce({
        synced_incidents: [
          {
            local_id: record.local_id,
            server_id: 'srv-gen-9988',
            status: 'synced'
          }
        ]
      });

      api.fetchIncidents.mockResolvedValueOnce({
        data: [],
        pagination: { page: 1, limit: 100, total_items: 0, total_pages: 0 },
        syncTimestamp: new Date().toISOString()
      });

      const summary = await syncService.sync();

      expect(summary.status).toBe('success');
      expect(summary.pushedCount).toBe(1);

      const updated = await db.getIncidentById(record.local_id);
      expect(updated.sync_status).toBe('synced');
      expect(updated.server_id).toBe('srv-gen-9988');
    });
  });

  describe('Delta Sync & Conflict Resolution', () => {
    it('detects conflict and enables user resolution', async () => {
      // 1. Existing synced incident
      await db.insertIncident({
        local_id: 'loc-test-conf-1',
        server_id: 'srv-test-conf-1',
        description: 'Baseline description',
        severity: 'Low',
        sync_status: 'synced',
        updated_at: '2026-09-25T01:00:00.000Z'
      });

      // 2. Local update while offline
      await db.updateIncident('loc-test-conf-1', {
        description: 'Local mobile operator edited text',
        severity: 'High',
        sync_status: 'pending',
        updated_at: '2026-09-25T02:00:00.000Z'
      });

      // 3. Remote delta contains modified record from another client
      api.syncIncidents.mockResolvedValueOnce({ synced_incidents: [] });
      api.fetchIncidents.mockResolvedValueOnce({
        data: [
          {
            id: 'srv-test-conf-1',
            description: 'Central dispatcher updated text remotely',
            severity: 'Critical',
            updated_at: '2026-09-25T02:30:00.000Z'
          }
        ],
        syncTimestamp: '2026-09-25T02:30:00.000Z'
      });

      // 4. Run sync -> should detect conflict
      const result = await syncService.sync();
      expect(result.conflictCount).toBe(1);

      const conflictItem = await db.getIncidentById('loc-test-conf-1');
      expect(conflictItem.sync_status).toBe('conflict');

      // 5. Test resolution: Keep Local
      await db.resolveConflict('loc-test-conf-1', 'local');
      const resolvedLocal = await db.getIncidentById('loc-test-conf-1');
      expect(resolvedLocal.sync_status).toBe('pending');
      expect(resolvedLocal.description).toBe('Local mobile operator edited text');

      // 6. Test resolution: Accept Server
      await db.markIncidentConflict('loc-test-conf-1', {
        id: 'srv-test-conf-1',
        description: 'Central dispatcher updated text remotely',
        severity: 'Critical',
        updated_at: '2026-09-25T02:30:00.000Z'
      });
      await db.resolveConflict('loc-test-conf-1', 'server');
      const resolvedServer = await db.getIncidentById('loc-test-conf-1');
      expect(resolvedServer.sync_status).toBe('synced');
      expect(resolvedServer.description).toBe('Central dispatcher updated text remotely');
      expect(resolvedServer.severity).toBe('Critical');
    });
  });
});
