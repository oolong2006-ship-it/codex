import { IconName } from '@/components/ui/Icon';

export interface NavItem {
  href: string;
  key: 'dashboard' | 'crowd' | 'queues' | 'alerts' | 'incidents' | 'simulation';
  icon: IconName;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', key: 'dashboard', icon: 'dashboard' },
  { href: '/crowd', key: 'crowd', icon: 'crowd' },
  { href: '/queues', key: 'queues', icon: 'queue' },
  { href: '/alerts', key: 'alerts', icon: 'alert' },
  { href: '/incidents', key: 'incidents', icon: 'incident' },
  { href: '/simulation', key: 'simulation', icon: 'simulation' },
];
