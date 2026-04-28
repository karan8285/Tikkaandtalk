/**
 * useFCMNotifications — Firebase Cloud Messaging for real-time push.
 * Works in foreground AND background on Android via FCM.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

async function playAlertSound() {
  try {
    const isNative = (window as any).Capacitor?.isNativePlatform?.() === true;
    if (isNative) {
      const audio = new Audio();
      audio.src = 'file:///android_asset/public/alert.wav';
      audio.volume = 1.0;
      await audio.play().catch(() => {});
    }
  } catch {}
}

export function useFCMNotifications() {
  useEffect(() => {
    let removed = false;

    const setup = async () => {
      try {
        console.log('[fcm] setting up...');
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
        console.log('[fcm] plugin loaded');

        // Check permission — Android 13+ needs POST_NOTIFICATIONS, older needs notifications/receive
        let permResult = await FirebaseMessaging.checkPermissions();
        console.log('[fcm] permission check:', JSON.stringify(permResult));

        const hasNotificationPerm =
          permResult.notifications === 'granted' ||
          (permResult as any).receive === 'granted' ||
          (permResult as any).postNotifications === 'granted';

        if (!hasNotificationPerm) {
          console.log('[fcm] no notification permission, requesting...');
          const reqResult = await FirebaseMessaging.requestPermissions();
          console.log('[fcm] permission result:', JSON.stringify(reqResult));
          const granted =
            reqResult.notifications === 'granted' ||
            (reqResult as any).receive === 'granted' ||
            (reqResult as any).postNotifications === 'granted';
          if (!granted) {
            console.log('[fcm] permission denied after request');
            return;
          }
        }

        console.log('[fcm] permission granted, getting token...');

        // Get FCM token
        const tokenResult = await FirebaseMessaging.getToken();
        console.log('[fcm] TOKEN:', tokenResult.token.substring(0, 30) + '...');

        // Register token with server
        const regResult = await fetch(`${API_BASE}/fcm/register`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: tokenResult.token, platform: 'android' }),
        });
        console.log('[fcm] register response:', regResult.status);
        const regData = await regResult.json().catch(() => ({}));
        console.log('[fcm] register data:', JSON.stringify(regData));

        // Listen for foreground notifications
        const notifHandle = await FirebaseMessaging.addListener(
          'notificationReceived',
          (event) => {
            if (removed) return;
            console.log('[fcm] notification received:', JSON.stringify(event.notification));
            const data = event.notification.data || {};
            const title = data.title || event.notification.title || '📋 New Order!';
            const body = data.message || event.notification.body || 'New order received';
            toast.success(`${title}\n${body}`, { icon: '🔔', duration: 6000 });
            playAlertSound();
          }
        );

        // Listen for notification tap (background + foreground)
        const actionHandle = await FirebaseMessaging.addListener(
          'notificationActionPerformed',
          (event) => {
            if (removed) return;
            console.log('[fcm] notification tapped:', JSON.stringify(event));
            window.location.href = '/staff';
          }
        );

        // Token refresh
        const tokenHandle = await FirebaseMessaging.addListener(
          'tokenReceived',
          async (event) => {
            console.log('[fcm] token refreshed:', event.token.substring(0, 20) + '...');
            await fetch(`${API_BASE}/fcm/register`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${publicAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ token: event.token, platform: 'android' }),
            }).catch(() => {});
          }
        );

        console.log('[fcm] setup complete — listening for notifications');
        return () => {
          removed = true;
          notifHandle.remove();
          actionHandle.remove();
          tokenHandle.remove();
        };
      } catch (err) {
        console.log('[fcm] SETUP ERROR:', err?.message || err);
      }
    };

    const cleanupFn = setup();
    return () => {
      removed = true;
      cleanupFn.then(fn => fn?.());
    };
  }, []);
}