// (kitchen) Profile — group-scoped so the Sync row stays inside (kitchen).
import { ProfileScreen } from '@/components/profile-screen';

export default function ProfileRoute() {
  return <ProfileScreen syncRoute="/(kitchen)/sync-queue" />;
}
