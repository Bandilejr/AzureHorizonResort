// (admin) thin wrapper → shared Collection Detail (read-only).
import { useLocalSearchParams } from 'expo-router';
import { CollectionDetailScreen } from '@/components/collections/collection-detail';

export default function AdminCollectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CollectionDetailScreen batchDocId={String(id || '')} role="admin" />;
}
