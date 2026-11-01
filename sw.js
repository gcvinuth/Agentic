// Agency AI - Service Worker
const CACHE_NAME = 'agency-ai-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon.svg',
  './favicon.png'
];

// In-worker task queue for scheduled notifications
const scheduledTimers = new Map();

// Installation: Cache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activation: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate for app assets, Network-First for APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching for Google Gemini API or WhatsApp dispatches
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('whatsapp.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback if offline
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// Listen for background timer scheduling messages from client
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'SCHEDULE_NOTIFICATION': {
      const { taskId, title, body, triggerAt, actionPayload, actionType } = data;
      const delayMs = Math.max(0, triggerAt - Date.now());

      // Clear any existing timer for this task
      if (scheduledTimers.has(taskId)) {
        clearTimeout(scheduledTimers.get(taskId));
      }

      console.log(`[SW] Scheduling notification for task "${title}" in ${Math.round(delayMs / 1000)}s`);

      const timerId = setTimeout(() => {
        self.registration.showNotification(title || 'Agency Agent Alert', {
          body: body || 'Scheduled agent action triggered.',
          icon: './icon-192.png',
          badge: './favicon.png',
          vibrate: [200, 100, 200, 100, 300],
          tag: `task-${taskId}`,
          renotify: true,
          requireInteraction: true,
          data: {
            taskId,
            actionType,
            actionPayload,
            url: actionPayload && (actionType === 'open_url' || actionType === 'whatsapp') ? actionPayload : './index.html'
          },
          actions: [
            { action: 'open', title: 'Open Action' },
            { action: 'dismiss', title: 'Dismiss' }
          ]
        });

        // Notify open clients that step has completed
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'TASK_TRIGGERED_IN_BACKGROUND',
              taskId,
              actionType,
              actionPayload
            });
          });
        });

        scheduledTimers.delete(taskId);
      }, delayMs);

      scheduledTimers.set(taskId, timerId);
      break;
    }

    case 'CANCEL_TASK': {
      if (scheduledTimers.has(data.taskId)) {
        clearTimeout(scheduledTimers.get(data.taskId));
        scheduledTimers.delete(data.taskId);
        console.log(`[SW] Cancelled timer for task ${data.taskId}`);
      }
      break;
    }

    case 'TRIGGER_INSTANT_NOTIFICATION': {
      self.registration.showNotification(data.title || 'Agency Agent Alert', {
        body: data.body || 'Task event',
        icon: './icon-192.png',
        badge: './favicon.png',
        vibrate: [150, 80, 150],
        tag: 'instant-alert',
        data: { url: './index.html' }
      });
      break;
    }

    case 'PING': {
      event.ports[0]?.postMessage({ status: 'PONG', activeTimersCount: scheduledTimers.size });
      break;
    }
  }
});

// Notification click handling (Mobile Android action handling)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const targetUrl = notificationData.url || './index.html';

  if (event.action === 'dismiss') {
    return;
  }

  // Open the action URL or focus app
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If notification has external action URL (like whatsapp or website) and user clicked 'open'
      if (notificationData.actionType === 'open_url' || notificationData.actionType === 'whatsapp') {
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }

      // Otherwise focus existing app window
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            taskId: notificationData.taskId
          });
          return;
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow('./index.html');
      }
    })
  );
});

// Periodic Background Sync (Supported in Chrome on Android)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'agency-agent-check') {
    console.log('[SW] Periodic background sync check triggered');
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'PERIODIC_SYNC_PULSE', timestamp: Date.now() });
        });
      })
    );
  }
});

