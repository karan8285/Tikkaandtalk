/**
 * Service Worker for Tikka N Talk Push Notifications
 * Handles incoming push events and notification clicks.
 */

// Install event — cache shell for offline PWA support on iOS
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  self.skipWaiting();
});

// Activate immediately
self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated');
  event.waitUntil(clients.claim());
});

// Listen for push events from the server
self.addEventListener('push', (event) => {
  let data = { title: 'Tikka N Talk', body: 'You have a new notification!', url: '/' };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    console.warn('[SW] Failed to parse push data:', e);
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.svg',
    badge: data.badge || '/icon-192.svg',
    tag: data.tag || 'tikka-notification-' + Date.now(),
    renotify: true,
    data: {
      url: data.url || '/',
    },
    vibrate: [100, 50, 100],
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click — open or focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Try to focus an existing window/tab
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // No existing window — open a new one
      return clients.openWindow(targetUrl);
    })
  );
});