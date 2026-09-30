// src/components/ui/detail-screen.tsx — full-screen record detail shell.
// Batch D: replaces the bottom-sheet DetailModal for multi-section records.
// Pattern: header (+status) → content (key facts / context / evidence /
// timeline) → primary action. Confirmation blocks render inline within this
// same screen (no nested modals). Tokens + shared components only.
import React, { type ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader } from './screen';

export function DetailScreen({
  visible,
  title,
  subtitle,
  status,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  status?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
        <Screen scroll>
          <PageHeader title={title} subtitle={subtitle} showBack onBack={onClose} right={status} />
          {children}
          <View style={{ height: theme.space['4xl'] }} />
        </Screen>
      </View>
    </Modal>
  );
}

export default DetailScreen;
