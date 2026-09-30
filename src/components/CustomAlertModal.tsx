// src/components/CustomAlertModal.tsx — global alert dialog, now token-driven.
// Public API unchanged (AlertConfig + onClose) so existing call sites keep
// working; the chrome is light-first and theme-aware.
import React from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';

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
  const theme = useAppTheme();
  if (!config.visible) return null;

  const getIcon = (): { name: React.ComponentProps<typeof Ionicons>['name']; fg: string; bg: string } => {
    switch (config.type) {
      case 'success':
        return { name: 'checkmark-circle', fg: theme.colors.successStrong, bg: theme.colors.successSoft };
      case 'warning':
        return { name: 'warning', fg: theme.colors.warningStrong, bg: theme.colors.warningSoft };
      case 'error':
        return { name: 'alert-circle', fg: theme.colors.errorStrong, bg: theme.colors.errorSoft };
      case 'biometric':
        return { name: 'finger-print', fg: theme.colors.primary, bg: theme.colors.primarySoft };
      case 'nfc':
        return { name: 'wifi', fg: theme.colors.accent, bg: theme.colors.accentSoft };
      case 'info':
      default:
        return { name: 'information-circle', fg: theme.colors.infoStrong, bg: theme.colors.infoSoft };
    }
  };

  const icon = getIcon();
  const handleConfirm = () => {
    onClose();
    config.onConfirm?.();
  };
  const handleCancel = () => {
    onClose();
    config.onCancel?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleCancel} statusBarTranslucent>
      <Pressable style={[styles.overlay, { backgroundColor: theme.colors.overlay }]} onPress={handleCancel}>
        <Pressable style={styles.stop} onPress={() => { /* swallow */ }}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius['2xl'],
                padding: theme.space['2xl'],
                gap: theme.space.md,
              },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: icon.bg }]}>
              <Ionicons name={icon.name} size={30} color={icon.fg} />
            </View>
            <AppText variant="title" align="center">
              {config.title}
            </AppText>
            <AppText variant="body" tone="secondary" align="center">
              {config.message}
            </AppText>
            <View style={[styles.actions, { gap: theme.space.sm, marginTop: theme.space.sm }]}>
              {config.onCancel ? (
                <Button
                  label={config.cancelText || 'Cancel'}
                  onPress={handleCancel}
                  variant="secondary"
                  fullWidth={false}
                  style={{ flex: 1 }}
                />
              ) : null}
              <Button
                label={config.confirmText || 'OK'}
                onPress={handleConfirm}
                variant={config.type === 'error' ? 'danger' : 'primary'}
                fullWidth={false}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  stop: { width: '100%', alignItems: 'center' },
  card: { width: '100%', maxWidth: 380, borderWidth: 1 },
  iconWrap: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  actions: { flexDirection: 'row', width: '100%' },
});
