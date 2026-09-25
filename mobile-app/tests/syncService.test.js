jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }))
}), { virtual: true });

jest.mock('../src/services/api');

const { SyncService } = require('../src/services/syncService');
const db = require('../src/database/db');
const api = require('../src/services/api');

describe('Mobile App Core Synchronization Logic', () => {
  let syncService;

  beforeEach(async () => {
    await db.clearDatabase();
    jest.clearAllMocks();
    syncService = new SyncService();
  });

  afterAll(async () => {
    await db.clearDatabase();
  });

  describe('Offline Incident Creation and Queueing', () => {
    it('should save incidents locally with sync_status pending when offline', async () => {
      const record = await db.insertIncident({
        description: 'Oil leak near pipeline sector 4',
        severity: 'High',
        latitude: 29.7604,
        longitude: -95.3698,
        photo_uri: 'file:///data/photos/leak.jpg'
      });

      expect(record.local_id).toBeDefined();
      expect(record.sync_status).toBe('pending');
      expect(record.server_id).toBeNull();

      const pending = await db.getPendingIncidents();
      expect(pending.length).toBe(1);
      expect(pending[0].local_id).toBe(record.local_id);
    });
  });

  describe('Push Synchronization', () => {
    it('should push pending local incidents to backend and update sync_status to synced', async () => {
      // 1. Create a pending local record
      const record = await db.insertIncident({
        description: 'Structural crack in tower foundation',
        severity: 'Critical',
        photo_uri: 'file:///data/photos/crack.jpg'
      });

      // 2. Mock API sync response
      api.syncIncidents.mockResolvedValueOnce({
        synced_incidents: [
          {
            local_id: record.local_id,
            server_id: 'srv-12345',
            status: 'synced'
          }
        ]
      });

      // 3. Mock API delta fetch response (no remote updates)
      api.fetchIncidents.mockResolvedValueOnce({
        data: [],
        pagination: { page: 1, limit: 100, total_items: 0, total_pages: 0 },
        syncTimestamp: '2026-09-25T10:00:00.000Z'
      });

      // 4. Run sync
      const result = await syncService.sync();

      expect(result.status).toBe('success');
      expect(result.pushedCount).toBe(1);
      expect(api.syncIncidents).toHaveBeenCalledTimes(1);

      // 5. Verify local DB record updated with server_id and synced status
      const updatedRecord = await db.getIncidentById(record.local_id);
      expect(updatedRecord.sync_status).toBe('synced');
      expect(updatedRecord.server_id).toBe('srv-12345');

      // 6. Verify pending queue is now empty
      const remainingPending = await db.getPendingIncidents();
      expect(remainingPending.length).toBe(0);
    });
  });

  describe('Delta Synchronization (Pull Remote Changes)', () => {
    it('should insert new remote records discovered during delta pull', async () => {
      // Mock API responses
      api.syncIncidents.mockResolvedValueOnce({ synced_incidents: [] });
      api.fetchIncidents.mockResolvedValueOnce({
        data: [
          {
            id: 'srv-remote-99',
            description: 'Remote telemetry warning',
            severity: 'Medium',
            latitude: 34.0522,
            longitude: -118.2437,
            photo_url: 'https://server.com/uploads/photo.jpg',
            created_at: '2026-09-25T09:00:00.000Z',
            updated_at: '2026-09-25T09:30:00.000Z'
          }
        ],
        pagination: { page: 1, limit: 100, total_items: 1, total_pages: 1 },
        syncTimestamp: '2026-09-25T09:30:00.000Z'
      });

      const result = await syncService.sync();

      expect(result.pulledCount).toBe(1);

      const allLocals = await db.getLocalIncidents();
      const pulledItem = allLocals.find(i => i.server_id === 'srv-remote-99');
      expect(pulledItem).toBeDefined();
      expect(pulledItem.description).toBe('Remote telemetry warning');
      expect(pulledItem.sync_status).toBe('synced');
    });
  });

  describe('Conflict Detection and Resolution', () => {
    it('should detect conflict when a record has local pending edits and remote server changes', async () => {
      // 1. Existing synced record
      const initial = await db.insertIncident({
        local_id: 'loc-conflict-1',
        server_id: 'srv-conflict-1',
        description: 'Original local description',
        severity: 'Low',
        sync_status: 'synced',
        updated_at: '2026-09-25T08:00:00.000Z'
      });

      // 2. User edits record locally while offline -> marks pending
      await db.updateIncident('loc-conflict-1', {
        description: 'User modified offline locally',
        severity: 'High',
        sync_status: 'pending',
        updated_at: '2026-09-25T09:00:00.000Z'
      });

      // 3. Mock sync: Server has also modified the same record
      api.syncIncidents.mockResolvedValueOnce({
        synced_incidents: []
      });
      api.fetchIncidents.mockResolvedValueOnce({
        data: [
          {
            id: 'srv-conflict-1',
            description: 'Dispatcher modified on server web console',
            severity: 'Critical',
            updated_at: '2026-09-25T09:15:00.000Z'
          }
        ],
        syncTimestamp: '2026-09-25T09:15:00.000Z'
      });

      // 4. Run sync
      const result = await syncService.sync();
      expect(result.conflictCount).toBe(1);

      // 5. Verify local record status is set to 'conflict'
      const conflictedRecord = await db.getIncidentById('loc-conflict-1');
      expect(conflictedRecord.sync_status).toBe('conflict');
      expect(conflictedRecord.server_version).toBeDefined();

      // 6. Test Conflict Resolution: User chooses to keep local version
      await db.resolveConflict('loc-conflict-1', 'local');
      const resolvedLocal = await db.getIncidentById('loc-conflict-1');
      expect(resolvedLocal.sync_status).toBe('pending');
      expect(resolvedLocal.description).toBe('User modified offline locally');

      // 7. Test Conflict Resolution: User chooses to accept server version
      await db.markIncidentConflict('loc-conflict-1', {
        id: 'srv-conflict-1',
        description: 'Dispatcher modified on server web console',
        severity: 'Critical',
        updated_at: '2026-09-25T09:15:00.000Z'
      });
      await db.resolveConflict('loc-conflict-1', 'server');
      const resolvedServer = await db.getIncidentById('loc-conflict-1');
      expect(resolvedServer.sync_status).toBe('synced');
      expect(resolvedServer.description).toBe('Dispatcher modified on server web console');
      expect(resolvedServer.severity).toBe('Critical');
    });
  });
});
