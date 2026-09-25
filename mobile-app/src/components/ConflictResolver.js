import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { resolveConflict } from '../database/db';

/**
 * ConflictResolver Component
 * Fulfills Contract Requirement 8:
 * - Container: data-testid="conflict-resolver"
 * - Local data: data-testid="local-version-field-description", etc.
 * - Server data: data-testid="server-version-field-description", etc.
 * - Resolution confirmation: data-testid="resolve-conflict-button"
 */
export default function ConflictResolver({ incident, onResolved, onCancel }) {
  const [selectedChoice, setSelectedChoice] = useState('local'); // 'local' | 'server'
  const [isResolving, setIsResolving] = useState(false);

  if (!incident) return null;

  let serverData = {};
  if (incident.server_version) {
    try {
      serverData = typeof incident.server_version === 'string'
        ? JSON.parse(incident.server_version)
        : incident.server_version;
    } catch (e) {
      serverData = {};
    }
  }

  const handleResolve = async () => {
    setIsResolving(true);
    try {
      await resolveConflict(incident.local_id, selectedChoice);
      if (onResolved) {
        onResolved(incident.local_id, selectedChoice);
      }
    } catch (err) {
      console.error('Error resolving conflict:', err);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <View
      style={styles.container}
      data-testid="conflict-resolver"
      testID="conflict-resolver"
      accessibilityLabel="conflict-resolver"
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Resolve Data Conflict</Text>
        <Text style={styles.headerSubtitle}>
          This incident was updated locally while also being modified on the server. Choose which version to keep.
        </Text>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* Comparison Grid */}
        <View style={styles.comparisonTable}>
          {/* Local Version Card */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSelectedChoice('local')}
            style={[
              styles.versionCard,
              selectedChoice === 'local' ? styles.versionCardSelected : styles.versionCardUnselected
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardBadgeLocal}>Local Version (Your Device)</Text>
              <View style={[styles.radioDot, selectedChoice === 'local' && styles.radioDotActive]} />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Description</Text>
              <Text
                style={styles.fieldValue}
                data-testid="local-version-field-description"
                testID="local-version-field-description"
              >
                {incident.description || 'No description'}
              </Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Severity</Text>
              <Text
                style={[styles.fieldValue, styles.severityBadge, getSeverityStyle(incident.severity)]}
                data-testid="local-version-field-severity"
                testID="local-version-field-severity"
              >
                {incident.severity || 'Medium'}
              </Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Last Modified</Text>
              <Text
                style={styles.fieldValueSmall}
                data-testid="local-version-field-updated_at"
                testID="local-version-field-updated_at"
              >
                {formatDate(incident.updated_at)}
              </Text>
            </View>

            {incident.photo_uri ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Photo</Text>
                <Image
                  source={{ uri: incident.photo_uri }}
                  style={styles.photoPreview}
                  data-testid="local-version-field-photo_uri"
                  testID="local-version-field-photo_uri"
                />
              </View>
            ) : null}
          </TouchableOpacity>

          {/* Server Version Card */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSelectedChoice('server')}
            style={[
              styles.versionCard,
              selectedChoice === 'server' ? styles.versionCardSelected : styles.versionCardUnselected
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardBadgeServer}>Server Version (Remote)</Text>
              <View style={[styles.radioDot, selectedChoice === 'server' && styles.radioDotActive]} />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Description</Text>
              <Text
                style={styles.fieldValue}
                data-testid="server-version-field-description"
                testID="server-version-field-description"
              >
                {serverData.description || 'No server description'}
              </Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Severity</Text>
              <Text
                style={[styles.fieldValue, styles.severityBadge, getSeverityStyle(serverData.severity)]}
                data-testid="server-version-field-severity"
                testID="server-version-field-severity"
              >
                {serverData.severity || 'Medium'}
              </Text>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Last Modified</Text>
              <Text
                style={styles.fieldValueSmall}
                data-testid="server-version-field-updated_at"
                testID="server-version-field-updated_at"
              >
                {formatDate(serverData.updated_at)}
              </Text>
            </View>

            {serverData.photo_url ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Photo</Text>
                <Image
                  source={{ uri: serverData.photo_url }}
                  style={styles.photoPreview}
                  data-testid="server-version-field-photo_uri"
                  testID="server-version-field-photo_uri"
                />
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Action Footer */}
      <View style={styles.actionFooter}>
        {onCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={isResolving}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.resolveButton}
          onPress={handleResolve}
          disabled={isResolving}
          data-testid="resolve-conflict-button"
          testID="resolve-conflict-button"
          accessibilityLabel="resolve-conflict-button"
        >
          {isResolving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.resolveButtonText}>
              Keep {selectedChoice === 'local' ? 'Local Version' : 'Server Version'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatDate(isoStr) {
  if (!isoStr) return 'N/A';
  try {
    return new Date(isoStr).toLocaleString();
  } catch (e) {
    return isoStr;
  }
}

function getSeverityStyle(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'critical':
      return { backgroundColor: '#FEE2E2', color: '#991B1B' };
    case 'high':
      return { backgroundColor: '#FFEDD5', color: '#9A3412' };
    case 'medium':
      return { backgroundColor: '#FEF3C7', color: '#92400E' };
    case 'low':
    default:
      return { backgroundColor: '#E0F2FE', color: '#075985' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    margin: 8,
  },
  header: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#1E293B',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  comparisonTable: {
    gap: 16,
  },
  versionCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    backgroundColor: '#1E293B',
  },
  versionCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#1E293B',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  versionCardUnselected: {
    borderColor: '#334155',
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  cardBadgeLocal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#60A5FA',
  },
  cardBadgeServer: {
    fontSize: 14,
    fontWeight: '700',
    color: '#34D399',
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#64748B',
  },
  radioDotActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#3B82F6',
  },
  fieldBlock: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  fieldValue: {
    fontSize: 15,
    color: '#F8FAFC',
    lineHeight: 20,
  },
  fieldValueSmall: {
    fontSize: 13,
    color: '#CBD5E1',
  },
  severityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontWeight: '700',
    fontSize: 12,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: '#0F172A',
  },
  actionFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#1E293B',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 15,
  },
  resolveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  }
});
