// (kitchen) thin wrapper → shared Collection Detail (manager: schedule/reschedule).
import { useLocalSearchParams } from 'expo-router';
import { CollectionDetailScreen } from '@/components/collections/collection-detail';

export default function KitchenCollectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CollectionDetailScreen batchDocId={String(id || '')} role="kitchen" />;
}
