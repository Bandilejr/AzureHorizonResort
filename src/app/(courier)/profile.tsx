// (courier) Profile — group-scoped so the Sync row stays inside (courier).
import { ProfileScreen } from '@/components/profile-screen';

export default function ProfileRoute() {
  return <ProfileScreen syncRoute="/(courier)/sync" />;
}
