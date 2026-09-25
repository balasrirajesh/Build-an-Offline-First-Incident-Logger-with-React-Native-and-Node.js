import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * SyncStatusIndicator Component
 * Fulfills Contract Requirement 7:
 * - Must have attribute data-testid="sync-status-indicator" (and testID="sync-status-indicator")
 * - Text content reflects pending sync count e.g. "3 records pending sync"
 */
export default function SyncStatusIndicator({ pendingCount = 0, isSyncing = false, isOnline = true }) {
  let label = `${pendingCount} ${pendingCount === 1 ? 'record' : 'records'} pending sync`;
  if (isSyncing) {
    label = `Syncing... (${pendingCount} pending)`;
  }

  return (
    <View
      style={[
        styles.container,
        pendingCount > 0 ? styles.pendingBackground : styles.syncedBackground
      ]}
      data-testid="sync-status-indicator"
      testID="sync-status-indicator"
      accessibilityLabel="sync-status-indicator"
    >
      <View
        style={[
          styles.dot,
          !isOnline ? styles.dotOffline : (pendingCount > 0 ? styles.dotPending : styles.dotSynced)
        ]}
      />
      <Text
        style={[
          styles.text,
          pendingCount > 0 ? styles.pendingText : styles.syncedText
        ]}
        data-testid="sync-status-indicator"
        testID="sync-status-indicator-text"
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'center',
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  pendingBackground: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  syncedBackground: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotPending: {
    backgroundColor: '#D97706',
  },
  dotSynced: {
    backgroundColor: '#059669',
  },
  dotOffline: {
    backgroundColor: '#9CA3AF',
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
  pendingText: {
    color: '#92400E',
  },
  syncedText: {
    color: '#065F46',
  }
});
