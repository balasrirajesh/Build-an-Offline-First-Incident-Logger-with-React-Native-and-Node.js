let NetInfo = null;
try {
  const mod = require('@react-native-community/netinfo');
  NetInfo = mod && mod.default ? mod.default : mod;
} catch (e) {
  NetInfo = {
    addEventListener: (cb) => {
      // no-op fallback in node / tests
      return () => {};
    },
    fetch: async () => ({ isConnected: true, isInternetReachable: true })
  };
}

const db = require('../database/db');
const api = require('./api');

class SyncService {
  constructor() {
    this.isSyncing = false;
    this.lastSyncedAt = null;
    this.isOnline = true;
    this.listeners = new Set();
    this.unsubscribeNetInfo = null;
  }

  /**
   * Subscribe a listener function to sync state changes
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all registered listeners with current sync state
   */
  notify(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn('Sync listener notification error:', err);
      }
    }
  }

  /**
   * Start listening to network connectivity changes
   */
  startNetworkListener() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }

    if (NetInfo && typeof NetInfo.addEventListener === 'function') {
      try {
        this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
          const wasOffline = !this.isOnline;
          this.isOnline = !!(state && state.isConnected && state.isInternetReachable !== false);

          this.notify({ type: 'network_status', isOnline: this.isOnline });

          // Trigger automatic sync when transitioning from offline to online
          if (this.isOnline && wasOffline) {
            this.sync().catch(err => console.warn('Automatic sync failed:', err));
          }
        });
      } catch (err) {
        console.warn('NetInfo addEventListener error:', err.message);
      }
    }
  }

  /**
   * Stop network listener
   */
  stopNetworkListener() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
  }

  /**
   * Execute complete synchronization cycle (Push pending -> Pull delta)
   */
  async sync() {
    if (this.isSyncing) {
      return { status: 'already_syncing' };
    }

    this.isSyncing = true;
    this.notify({ type: 'sync_start' });

    try {
      // Step 1: Push pending local changes to server
      const pendingIncidents = await db.getPendingIncidents();
      let pushResult = null;

      if (pendingIncidents.length > 0) {
        pushResult = await api.syncIncidents(pendingIncidents);
        if (pushResult && pushResult.synced_incidents) {
          for (const synced of pushResult.synced_incidents) {
            await db.markIncidentSynced(synced.local_id, synced.server_id);
          }
        }
      }

      // Step 2: Delta Sync - Pull remote changes from server
      const pullResult = await api.fetchIncidents({
        page: 1,
        limit: 100,
        last_synced_at: this.lastSyncedAt
      });

      const remoteIncidents = (pullResult && pullResult.data) ? pullResult.data : [];
      let conflictCount = 0;

      if (remoteIncidents.length > 0) {
        const localIncidents = await db.getLocalIncidents();

        for (const remote of remoteIncidents) {
          // Find matching local record by server_id or local_id
          const match = localIncidents.find(
            loc => (remote.id && loc.server_id === remote.id) || (remote.id && loc.local_id === remote.id)
          );

          if (match) {
            // Check for conflict: local modification is pending while remote was also modified
            if (match.sync_status === 'pending') {
              // Both modified -> Conflict state
              await db.markIncidentConflict(match.local_id, remote);
              conflictCount++;
            } else if (match.sync_status !== 'conflict') {
              // Local is synced, overwrite with latest remote state
              await db.updateIncident(match.local_id, {
                server_id: remote.id,
                description: remote.description,
                severity: remote.severity,
                latitude: remote.latitude,
                longitude: remote.longitude,
                photo_uri: remote.photo_url || match.photo_uri,
                sync_status: 'synced',
                updated_at: remote.updated_at
              });
            }
          } else {
            // New record from server, insert locally
            await db.insertIncident({
              server_id: remote.id,
              description: remote.description,
              severity: remote.severity,
              latitude: remote.latitude,
              longitude: remote.longitude,
              photo_uri: remote.photo_url || null,
              sync_status: 'synced',
              updated_at: remote.updated_at
            });
          }
        }
      }

      // Update sync timestamp
      this.lastSyncedAt = (pullResult && pullResult.syncTimestamp) ? pullResult.syncTimestamp : new Date().toISOString();

      const summary = {
        status: 'success',
        pushedCount: pendingIncidents.length,
        pulledCount: remoteIncidents.length,
        conflictCount,
        lastSyncedAt: this.lastSyncedAt
      };

      this.notify({ type: 'sync_success', summary });
      return summary;
    } catch (error) {
      console.error('Sync error:', error.message);
      this.notify({ type: 'sync_error', error: error.message });
      throw error;
    } finally {
      this.isSyncing = false;
      this.notify({ type: 'sync_complete' });
    }
  }
}

const syncServiceInstance = new SyncService();

if (typeof window !== 'undefined') {
  window.triggerSync = () => syncServiceInstance.sync();
}
if (typeof global !== 'undefined') {
  global.triggerSync = () => syncServiceInstance.sync();
}

module.exports = {
  SyncService,
  syncService: syncServiceInstance
};
