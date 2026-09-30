// (npo) thin wrapper → shared Collection Detail (own batches only; RouteGuard via layout).
import { useLocalSearchParams } from 'expo-router';
import { CollectionDetailScreen } from '@/components/collections/collection-detail';

export default function NpoCollectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CollectionDetailScreen batchDocId={String(id || '')} role="npo" />;
}
