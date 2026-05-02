/**
 * useFCMNotifications — Android FCM token + foreground listener.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

export function useFCMNotifications() {
  useEffect(() => {
    const plugin = (window as any).Capacitor?.Plugins?.FCMPlugin;
    if (!plugin) return;

    // Register token
    plugin.getToken?.().then((result: any) => {
      const token = result?.token;
      if (token) {
        fetch(`${API_BASE}/fcm/register`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token, platform: 'android' }),
        }).catch(() => {});
      }
    });

    // Foreground notification — dispatch custom event instead of toast directly
    plugin.addListener?.('notificationReceived', (event: any) => {
      const notif = event?.notification || {};
      const data = notif.data || {};
      const title = data.title || notif.title || '📋 New Order!';
      const body = data.message || notif.body || 'New order received';
      // Dispatch event that React can catch inside its event system
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
