import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { insertIncident } from '../database/db';

const SEVERITY_LEVELS = [
  { label: 'Low', value: 'Low', color: '#0284C7', bg: '#E0F2FE' },
  { label: 'Medium', value: 'Medium', color: '#D97706', bg: '#FEF3C7' },
  { label: 'High', value: 'High', color: '#EA580C', bg: '#FFEDD5' },
  { label: 'Critical', value: 'Critical', color: '#DC2626', bg: '#FEE2E2' }
];

export default function IncidentForm({ onSaved, onCancel }) {
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('Medium');
  const [latitude, setLatitude] = useState('37.7749');
  const [longitude, setLongitude] = useState('-122.4194');
  const [photoUri, setPhotoUri] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!description.trim()) {
      newErrors.description = 'Description is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const pickImage = async () => {
    try {
      if (ImagePicker && typeof ImagePicker.launchImageLibraryAsync === 'function') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          setPhotoUri(result.assets[0].uri);
        }
      } else {
        // Fallback for demo or simulated environment
        setPhotoUri('file:///mock/storage/incident-sample-photo.jpg');
      }
    } catch (err) {
      console.warn('Image picker error:', err);
      setPhotoUri('file:///mock/storage/incident-sample-photo.jpg');
    }
  };

  const removePhoto = () => {
    setPhotoUri(null);
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const localId = `loc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const newRecord = await insertIncident({
        local_id: localId,
        server_id: null,
        description: description.trim(),
        severity,
        photo_uri: photoUri,
        sync_status: 'pending',
        updated_at: now,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null
      });

      if (onSaved) {
        onSaved(newRecord);
      }
    } catch (err) {
      console.error('Error saving incident:', err);
      Alert.alert('Error', 'Failed to save incident: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Log New Incident</Text>
      <Text style={styles.subtitle}>
        Works completely offline. Changes are saved locally and synced automatically when connected.
      </Text>

      {/* Description Field */}
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>
          Incident Description <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.textArea, errors.description && styles.inputError]}
          placeholder="Describe what occurred, hazards identified, immediate actions..."
          placeholderTextColor="#64748B"
          value={description}
          onChangeText={text => {
            setDescription(text);
            if (errors.description) setErrors({ ...errors, description: null });
          }}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        {errors.description && (
          <Text style={styles.errorText}>{errors.description}</Text>
        )}
      </View>

      {/* Severity Selector */}
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Severity Level</Text>
        <View style={styles.severityGrid}>
          {SEVERITY_LEVELS.map(level => {
            const isSelected = severity === level.value;
            return (
              <TouchableOpacity
                key={level.value}
                style={[
                  styles.severityBtn,
                  isSelected && { borderColor: level.color, backgroundColor: level.bg }
                ]}
                onPress={() => setSeverity(level.value)}
              >
                <Text
                  style={[
                    styles.severityBtnText,
                    isSelected && { color: level.color, fontWeight: '700' }
                  ]}
                >
                  {level.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Geolocation Coordinates */}
      <View style={styles.fieldRow}>
        <View style={[styles.fieldContainer, { flex: 1, marginRight: 8 }]}>
          <Text style={styles.label}>Latitude</Text>
          <TextInput
            style={styles.input}
            value={latitude}
            onChangeText={setLatitude}
            placeholder="e.g. 37.7749"
            placeholderTextColor="#64748B"
            keyboardType="numeric"
          />
        </View>
        <View style={[styles.fieldContainer, { flex: 1, marginLeft: 8 }]}>
          <Text style={styles.label}>Longitude</Text>
          <TextInput
            style={styles.input}
            value={longitude}
            onChangeText={setLongitude}
            placeholder="e.g. -122.4194"
            placeholderTextColor="#64748B"
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Photo Attachment */}
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Photo Attachment</Text>
        {photoUri ? (
          <View style={styles.photoContainer}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            <TouchableOpacity style={styles.removePhotoBtn} onPress={removePhoto}>
              <Text style={styles.removePhotoBtnText}>Remove Photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.attachPhotoBtn} onPress={pickImage}>
            <Text style={styles.attachPhotoBtnText}>📷 Select / Capture Photo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        {onCancel && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            disabled={isSaving}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save to Local DB</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 20,
    lineHeight: 18,
  },
  fieldContainer: {
    marginBottom: 18,
  },
  fieldRow: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 14,
  },
  textArea: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 14,
    minHeight: 90,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  severityGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  severityBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#1E293B',
  },
  severityBtnText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  attachPhotoBtn: {
    borderWidth: 1.5,
    borderColor: '#334155',
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 18,
    alignItems: 'center',
    backgroundColor: '#1E293B',
  },
  attachPhotoBtnText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
  },
  photoContainer: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  removePhotoBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#7F1D1D',
    borderRadius: 6,
  },
  removePhotoBtnText: {
    color: '#FECACA',
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#334155',
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 15,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
