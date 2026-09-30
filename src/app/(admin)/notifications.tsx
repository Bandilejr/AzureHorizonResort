import { NotificationsList } from '@/components/NotificationsList';

export default function AdminNotificationsScreen() {
  return <NotificationsList fallback="/(admin)/dashboard" />;
}
