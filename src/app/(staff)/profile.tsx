// (staff) Profile — group-scoped so the Sync row stays inside (staff).
import { ProfileScreen } from '@/components/profile-screen';

export default function ProfileRoute() {
  return <ProfileScreen syncRoute="/(staff)/sync-queue" />;
}
