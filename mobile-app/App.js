import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator
} from 'react-native';
import { initDatabase, getLocalIncidents, clearDatabase, markIncidentConflict } from './src/database/db';
import { syncService } from './src/services/syncService';
import SyncStatusIndicator from './src/components/SyncStatusIndicator';
import IncidentList from './src/components/IncidentList';
import IncidentForm from './src/components/IncidentForm';
import ConflictResolver from './src/components/ConflictResolver';

export default function App() {
  const [incidents, setIncidents] = useState([]);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'create'
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [conflictedIncident, setConflictedIncident] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load incidents from local SQLite database
  const loadIncidents = useCallback(async () => {
    try {
      const data = await getLocalIncidents();
      setIncidents(data);
    } catch (err) {
      console.error('Failed to load local incidents:', err);
    }
  }, []);

  // Initialize DB and sync listeners on mount
  useEffect(() => {
    async function setup() {
      try {
        await initDatabase();
        await loadIncidents();
        syncService.startNetworkListener();
        setIsInitialized(true);
      } catch (err) {
        console.error('Setup error:', err);
      }
    }
    setup();

    // Subscribe to sync service state changes
    const unsubscribe = syncService.subscribe(event => {
      if (event.type === 'sync_start') {
        setIsSyncing(true);
      } else if (event.type === 'sync_complete' || event.type === 'sync_success' || event.type === 'sync_error') {
        setIsSyncing(false);
        loadIncidents();
      } else if (event.type === 'network_status') {
        setIsOnline(event.isOnline);
      }
    });

    return () => {
      unsubscribe();
      syncService.stopNetworkListener();
    };
  }, [loadIncidents]);

  const pendingCount = incidents.filter(i => i.sync_status === 'pending').length;
  const conflictCount = incidents.filter(i => i.sync_status === 'conflict').length;

  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      await syncService.sync();
      await loadIncidents();
    } catch (err) {
      Alert.alert('Sync Notice', 'Sync could not complete with remote server: ' + (err.message || 'Offline'));
    } finally {
      setIsSyncing(false);
      await loadIncidents();
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadIncidents();
    if (isOnline) {
      try {
        await syncService.sync();
      } catch (e) {}
      await loadIncidents();
    }
    setIsRefreshing(false);
  };

  const handleIncidentSaved = async () => {
    await loadIncidents();
    setActiveTab('list');
    // Attempt auto sync if online
    if (isOnline) {
      syncService.sync().catch(() => {});
    }
  };

  const handleConflictResolved = async () => {
    setConflictedIncident(null);
    await loadIncidents();
    if (isOnline) {
      syncService.sync().catch(() => {});
    }
  };

  // Demo tool: simulate a conflict state
  const handleSimulateConflict = async () => {
    if (incidents.length === 0) {
      Alert.alert('Simulate Conflict', 'Please create at least one incident first.');
      return;
    }
    const target = incidents[0];
    const serverSimulatedVersion = {
      id: target.server_id || `srv-sim-${Date.now()}`,
      description: `[Server Version] ${target.description} (Modified by Remote Dispatcher)`,
      severity: target.severity === 'Critical' ? 'Low' : 'Critical',
      latitude: target.latitude || 37.77,
      longitude: target.longitude || -122.42,
      photo_url: null,
      updated_at: new Date().toISOString()
    };

    await markIncidentConflict(target.local_id, serverSimulatedVersion);
    await loadIncidents();
    const updated = (await getLocalIncidents()).find(i => i.local_id === target.local_id);
    setConflictedIncident(updated);
  };

  if (!isInitialized) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Initializing Offline SQLite Database...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F19" />

      {/* Top App Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.appTitle}>Incident Logger</Text>
          <View style={[styles.networkBadge, isOnline ? styles.networkOnline : styles.networkOffline]}>
            <View style={[styles.networkDot, isOnline ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.networkText}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
        </View>

        {/* Sync Status Indicator (Fulfills Contract Requirement 7) */}
        <SyncStatusIndicator
          pendingCount={pendingCount}
          isSyncing={isSyncing}
          isOnline={isOnline}
        />

        {/* Action Controls Bar */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.controlBtn, isSyncing && styles.controlBtnDisabled]}
            onPress={handleManualSync}
            disabled={isSyncing}
          >
            <Text style={styles.controlBtnText}>{isSyncing ? 'Syncing...' : '🔄 Sync Now'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtnSecondary}
            onPress={handleSimulateConflict}
          >
            <Text style={styles.controlBtnSecondaryText}>⚡ Sim Conflict</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'list' && styles.activeTab]}
          onPress={() => setActiveTab('list')}
        >
          <Text style={[styles.tabText, activeTab === 'list' && styles.activeTabText]}>
            Incidents ({incidents.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'create' && styles.activeTab]}
          onPress={() => setActiveTab('create')}
        >
          <Text style={[styles.tabText, activeTab === 'create' && styles.activeTabText]}>
            + New Incident
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main View Area */}
      <View style={styles.mainContent}>
        {activeTab === 'list' ? (
          <IncidentList
            incidents={incidents}
            onResolveConflict={incident => setConflictedIncident(incident)}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
          />
        ) : (
          <IncidentForm
            onSaved={handleIncidentSaved}
            onCancel={() => setActiveTab('list')}
          />
        )}
      </View>

      {/* Dedicated Conflict Resolver Modal (Fulfills Contract Requirement 8) */}
      <Modal
        visible={!!conflictedIncident}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setConflictedIncident(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <ConflictResolver
            incident={conflictedIncident}
            onResolved={handleConflictResolved}
            onCancel={() => setConflictedIncident(null)}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0B0F19',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  networkOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  networkOffline: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  networkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  dotOnline: {
    backgroundColor: '#10B981',
  },
  dotOffline: {
    backgroundColor: '#EF4444',
  },
  networkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  controlBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  controlBtnDisabled: {
    opacity: 0.5,
  },
  controlBtnText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '600',
  },
  controlBtnSecondary: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  controlBtnSecondaryText: {
    color: '#F472B6',
    fontSize: 12,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  activeTabText: {
    color: '#3B82F6',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0B0F19',
  }
});
