/**
 * useFCMNotifications — Android FCM token + foreground listener.
 * Registers with staff role so push can be targeted by role.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getItem } from './storage';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

async function getStaffRole(): Promise<string | null> {
  try {
    const raw = await getItem('__tnt_staff');
    if (!raw) return null;
    const ctx = JSON.parse(raw);
    return ctx?.staff?.role || null;
  } catch {
    return null;
  }
}

export function useFCMNotifications() {
  useEffect(() => {
    const plugin = (window as any).Capacitor?.Plugins?.FCMPlugin;
    if (!plugin) return;

    const register = async () => {
      const result = await plugin.getToken?.();
      const token = result?.token;
      if (!token) return;
      const role = await getStaffRole();
      fetch(`${API_BASE}/fcm/register`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, platform: 'android', role }),
      }).catch(() => {});
    };

    register();

    // Foreground notification — dispatch custom event instead of toast directly
    plugin.addListener?.('notificationReceived', (event: any) => {
      const notif = event?.notification || {};
      const data = notif.data || {};
      const title = data.title || notif.title || '📋 New Order!';
      const body = data.message || notif.body || 'New order received';
      document.dispatchEvent(new CustomEvent('fcm:notification', {
        detail: { title, body },
        bubbles: true,
      }));
    });
  }, []);
}

/** Call this from any React component to listen for FCM foreground notifications.
 *  Use inside a useEffect to avoid duplicate listeners. */
export function useFCMNotificationListener(onNotif: (title: string, body: string) => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      const { title, body } = (e as CustomEvent).detail;
      onNotif(title, body);
    };
    document.addEventListener('fcm:notification', handler);
    return () => document.removeEventListener('fcm:notification', handler);
  }, [onNotif]);
}
