import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  RefreshControl
} from 'react-native';

export default function IncidentList({
  incidents = [],
  onSelectIncident,
  onResolveConflict,
  onRefresh,
  isRefreshing = false
}) {
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredIncidents = incidents.filter(item => {
    if (filterSeverity !== 'ALL' && item.severity !== filterSeverity) return false;
    if (filterStatus !== 'ALL' && item.sync_status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = (item.description || '').toLowerCase().includes(q);
      const matchId = (item.local_id || '').toLowerCase().includes(q) || (item.server_id || '').toLowerCase().includes(q);
      if (!matchDesc && !matchId) return false;
    }
    return true;
  });

  const renderItem = ({ item }) => {
    const isConflict = item.sync_status === 'conflict';
    const isPending = item.sync_status === 'pending';

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isConflict && styles.cardConflict,
          isPending && styles.cardPending
        ]}
        activeOpacity={0.7}
        onPress={() => {
          if (isConflict && onResolveConflict) {
            onResolveConflict(item);
          } else if (onSelectIncident) {
            onSelectIncident(item);
          }
        }}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.idContainer}>
            <Text style={styles.localIdText}>Local: {item.local_id}</Text>
            {item.server_id && (
              <Text style={styles.serverIdText}>Server: {item.server_id}</Text>
            )}
          </View>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, getSeverityBadgeStyle(item.severity)]}>
              <Text style={[styles.badgeText, getSeverityTextStyle(item.severity)]}>
                {item.severity || 'Medium'}
              </Text>
            </View>
            <View style={[styles.badge, getStatusBadgeStyle(item.sync_status)]}>
              <Text style={[styles.badgeText, getStatusTextStyle(item.sync_status)]}>
                {item.sync_status === 'pending' ? '⏳ Pending' : (item.sync_status === 'synced' ? '✓ Synced' : '⚠️ Conflict')}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.descriptionText} numberOfLines={3}>
          {item.description}
        </Text>

        {item.photo_uri && (
          <View style={styles.photoContainer}>
            <Image source={{ uri: item.photo_uri }} style={styles.cardPhoto} />
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.timestampText}>
            Updated: {new Date(item.updated_at).toLocaleString()}
          </Text>
          {isConflict && (
            <TouchableOpacity
              style={styles.resolveBtn}
              onPress={() => onResolveConflict && onResolveConflict(item)}
            >
              <Text style={styles.resolveBtnText}>Resolve Conflict ➔</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search incidents by keyword or ID..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filtersWrapper}>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Status:</Text>
          {['ALL', 'pending', 'synced', 'conflict'].map(status => (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterChip,
                filterStatus === status && styles.filterChipActive
              ]}
              onPress={() => setFilterStatus(status)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filterStatus === status && styles.filterChipTextActive
                ]}
              >
                {status === 'ALL' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Incident List */}
      <FlatList
        data={filteredIncidents}
        keyExtractor={item => item.local_id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#3B82F6"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Incidents Found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || filterStatus !== 'ALL' || filterSeverity !== 'ALL'
                ? 'Try adjusting your filters or search query.'
                : 'Tap "+ New Incident" to record field observations.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function getSeverityBadgeStyle(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'critical':
      return { backgroundColor: '#7F1D1D' };
    case 'high':
      return { backgroundColor: '#7C2D12' };
    case 'medium':
      return { backgroundColor: '#78350F' };
    case 'low':
    default:
      return { backgroundColor: '#075985' };
  }
}

function getSeverityTextStyle(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'critical':
      return { color: '#FECACA' };
    case 'high':
      return { color: '#FED7AA' };
    case 'medium':
      return { color: '#FDE68A' };
    case 'low':
    default:
      return { color: '#BAE6FD' };
  }
}

function getStatusBadgeStyle(status) {
  switch (status) {
    case 'synced':
      return { backgroundColor: '#064E3B' };
    case 'conflict':
      return { backgroundColor: '#831843' };
    case 'pending':
    default:
      return { backgroundColor: '#78350F' };
  }
}

function getStatusTextStyle(status) {
  switch (status) {
    case 'synced':
      return { color: '#A7F3D0' };
    case 'conflict':
      return { color: '#FBCFE8' };
    case 'pending':
    default:
      return { color: '#FDE68A' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  searchInput: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
  },
  filtersWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    marginRight: 2,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardPending: {
    borderColor: '#F59E0B',
  },
  cardConflict: {
    borderColor: '#EC4899',
    backgroundColor: '#261224',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  idContainer: {
    flex: 1,
    marginRight: 8,
  },
  localIdText: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: 'monospace',
  },
  serverIdText: {
    fontSize: 11,
    color: '#10B981',
    fontFamily: 'monospace',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  descriptionText: {
    fontSize: 14,
    color: '#F8FAFC',
    lineHeight: 20,
    marginBottom: 8,
  },
  photoContainer: {
    marginBottom: 8,
  },
  cardPhoto: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    backgroundColor: '#0F172A',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  timestampText: {
    fontSize: 11,
    color: '#64748B',
  },
  resolveBtn: {
    backgroundColor: '#DB2777',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  resolveBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 260,
  },
});
