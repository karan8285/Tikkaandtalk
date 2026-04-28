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

async function setupFCM() {
  try {
    console.log('[fcm] setting up...');
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    console.log('[fcm] plugin loaded');

    // Create notification channel first (Android 8+ requires this to show notifications)
    // Must happen before any notifications arrive
    await FirebaseMessaging.createChannel({
      id: 'default',
      name: 'Order Notifications',
      description: 'New order and delivery notifications',
      importance: 4, // High — shows on lock screen, makes sound, etc.
      sound: 'alert',
      vibration: true,
      lights: true,
      lightColor: '#D91A60',
    });
    console.log('[fcm] notification channel created');

    // Check + request permission
    let permResult = await FirebaseMessaging.checkPermissions();
    console.log('[fcm] permission check:', JSON.stringify(permResult));

    const hasPerm =
      permResult.receive === 'granted' ||
      (permResult as any).postNotifications === 'granted' ||
      (permResult as any).notifications === 'granted';

    if (!hasPerm) {
      console.log('[fcm] requesting notification permission...');
      const reqResult = await FirebaseMessaging.requestPermissions();
      console.log('[fcm] permission result:', JSON.stringify(reqResult));
      const granted =
        reqResult.receive === 'granted' ||
        (reqResult as any).postNotifications === 'granted' ||
        (reqResult as any).notifications === 'granted';
      if (!granted) {
        console.log('[fcm] permission denied — notifications will not show');
      } else {
        console.log('[fcm] permission granted');
      }
    } else {
      console.log('[fcm] permission already granted');
    }

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

    // Listen for foreground push notifications
    const notifHandle = await FirebaseMessaging.addListener(
      'notificationReceived',
      (event) => {
        console.log('[fcm] notification received:', JSON.stringify(event.notification));
        const data = event.notification.data || {};
        const title = data.title || event.notification.title || '📋 New Order!';
        const body = data.message || event.notification.body || 'New order received';
        toast.success(`${title}\n${body}`, { icon: '🔔', duration: 8000 });
        playAlertSound();
      }
    );

    // Listen for notification tap (works when app is in foreground AND background)
    const actionHandle = await FirebaseMessaging.addListener(
      'notificationActionPerformed',
      (event) => {
        console.log('[fcm] notification tapped:', JSON.stringify(event));
        window.location.href = '/staff';
      }
    );

    // Token refresh listener
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
      notifHandle.remove();
      actionHandle.remove();
      tokenHandle.remove();
    };
  } catch (err) {
    console.log('[fcm] SETUP ERROR:', err?.message || err);
  }
}

export function useFCMNotifications() {
  useEffect(() => {
    const cleanupPromise = setupFCM();
    return () => {
      cleanupPromise.then(fn => fn?.());
    };
  }, []);
}