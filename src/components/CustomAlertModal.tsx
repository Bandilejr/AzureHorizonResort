import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '@/constants/theme';

export interface AlertConfig {
  visible: boolean;
  title: string;
  message: string;
  type?: 'success' | 'warning' | 'error' | 'info' | 'biometric' | 'nfc';
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface CustomAlertModalProps {
  config: AlertConfig;
  onClose: () => void;
}

export const CustomAlertModal: React.FC<CustomAlertModalProps> = ({ config, onClose }) => {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  if (!config.visible) return null;

  const getIcon = () => {
    switch (config.type) {
      case 'success':
        return { name: 'checkmark-circle-sharp', color: '#16a34a', bg: '#dcfce7' };
      case 'warning':
        return { name: 'warning-sharp', color: '#d97706', bg: '#fef3c7' };
      case 'error':
        return { name: 'alert-circle-sharp', color: '#dc2626', bg: '#fef2f2' };
      case 'biometric':
        return { name: 'finger-print-sharp', color: '#c9a227', bg: '#fef9e7' };
      case 'nfc':
        return { name: 'wifi-sharp', color: '#1e3a5f', bg: '#e8ecf3' };
      case 'info':
      default:
        return { name: 'information-circle-sharp', color: '#2563eb', bg: '#dbeafe' };
    }
  };

  const iconInfo = getIcon();

  const handleConfirm = () => {
    onClose();
    if (config.onConfirm) config.onConfirm();
  };

  const handleCancel = () => {
    onClose();
    if (config.onCancel) config.onCancel();
  };

  return (
    <Modal
      visible={config.visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleCancel}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header Icon */}
          <View style={[styles.iconContainer, { backgroundColor: iconInfo.bg }]}>
            <Ionicons name={iconInfo.name as any} size={36} color={iconInfo.color} />
          </View>

          {/* Title & Message */}
          <Text style={styles.title}>{config.title}</Text>
          <Text style={styles.message}>{config.message}</Text>

          {/* Buttons */}
          <View style={styles.buttonRow}>
            {config.onCancel && (
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancel} activeOpacity={0.7}>
                <Text style={styles.cancelButtonText}>{config.cancelText || 'Cancel'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.confirmButton,
                !config.onCancel && { flex: 1 },
                config.type === 'error' && { backgroundColor: '#dc2626' },
              ]}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmButtonText}>{config.confirmText || 'OK'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const createStyles = (theme: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: '#0f172a',
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: '#c9a227',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 10,
    },
    iconContainer: {
      width: 68,
      height: 68,
      borderRadius: 34,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: '#ffffff',
      textAlign: 'center',
      marginBottom: 8,
      letterSpacing: 0.3,
    },
    message: {
      fontSize: 14,
      color: '#cbd5e1',
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#334155',
      backgroundColor: '#1e293b',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButtonText: {
      color: '#cbd5e1',
      fontSize: 15,
      fontWeight: '600',
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: '#c9a227',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#c9a227',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    confirmButtonText: {
      color: '#0f172a',
      fontSize: 15,
      fontWeight: '800',
    },
  });
