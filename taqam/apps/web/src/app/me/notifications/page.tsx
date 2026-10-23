'use client';
import { useLang } from '@/lib/i18n';
import { NotificationsList } from '@/components/ess/NotificationsList';
import { PageTitle } from '@/components/ess/primitives';

export default function MyNotificationsPage() {
  const { t } = useLang();
  return (
    <div className="space-y-4">
      <PageTitle title={t('الإشعارات', 'Notifications')} />
      <NotificationsList />
    </div>
  );
}
