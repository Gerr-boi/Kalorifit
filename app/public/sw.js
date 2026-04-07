const CACHE_NAME = 'kalorifit-v2';
const urlsToCache = ['/index.html', '/manifest.json', '/icon-192x192.png', '/icon-512x512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Check if any meal reminders are due on every in-app fetch
  if (_reminderSchedule.length > 0) {
    maybeSendDueNotifications();
  }

  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) return cachedResponse;

        if (event.request.mode === 'navigate') {
          const shell = await cache.match('/index.html');
          if (shell) return shell;
        }

        throw error;
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve(false);
        }),
      ),
    ),
  );
  self.clients.claim();
});

// ─── Scheduled meal reminders ────────────────────────────────────────────────
// The main thread posts SCHEDULE_NOTIFICATIONS with the user's reminder prefs.
// We check on each fetch (including background fetches) whether any reminder is
// overdue and hasn't been shown yet today.

let _reminderSchedule = []; // [{time: 'HH:MM', body: string, tag: string}]
const _shownToday = new Set(); // tags shown today, reset at midnight

function maybeSendDueNotifications() {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  // Reset daily shown-set if date has rolled over
  if (_shownToday._date !== todayKey) {
    _shownToday.clear();
    _shownToday._date = todayKey;
  }

  for (const item of _reminderSchedule) {
    if (_shownToday.has(item.tag)) continue;
    const [h, m] = item.time.split(':').map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (now >= target) {
      _shownToday.add(item.tag);
      self.registration.showNotification('KaloriFit', {
        body: item.body,
        icon: '/icon-192x192.png',
        badge: '/icon-72x72.png',
        tag: item.tag,
        renotify: false,
      });
    }
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SCHEDULE_NOTIFICATIONS') {
    _reminderSchedule = event.data.schedule ?? [];
  }
});

// Open / focus the app when a notification is tapped
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow('/');
      }),
  );
});

// Push notifications (for future use)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data.text(),
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('KaloriFit', options)
  );
});
