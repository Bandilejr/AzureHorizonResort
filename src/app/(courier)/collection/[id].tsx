// (courier) thin wrapper → shared Collection Detail (RouteGuard applies via layout).
import { useLocalSearchParams } from 'expo-router';
import { CollectionDetailScreen } from '@/components/collections/collection-detail';

export default function CourierCollectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CollectionDetailScreen batchDocId={String(id || '')} role="courier" />;
}
