/// <reference lib="webworker" />
// M6 custom service worker (vite-plugin-pwa injectManifest). Precaching and
// the manual update flow come first; push + notificationclick ride along.
// The previous generateSW options (cleanupOutdatedCaches, clientsClaim,
// navigateFallback, skipWaiting:false) are spelled out here so the update
// prompt contract is preserved: skipWaiting only runs on SKIP_WAITING.

declare let self: ServiceWorkerGlobalScope;

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// clientsClaim lives in workbox-core; claim inline rather than widen the
// dependency surface (skipWaiting stays manual for the prompt contract).
self.addEventListener("activate", () => {
  void self.clients.claim();
});

// Manual update contract (vite-plugin-pwa prompt flow): the page asks the
// waiting worker to take over only when the user accepts the refresh prompt.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

// SPA navigation fallback (replaces generateSW's navigateFallback): network
// first so deploys are picked up promptly, precached shell when offline.
// /api/* is never cached and never falls back to the app shell.
const shellHandler = createHandlerBoundToURL("/index.html");

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }
  event.respondWith(fetch(request).catch(() => shellHandler({ event, request, url })));
});

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload | null = null;
  try {
    payload = event.data ? (event.data.json() as PushPayload) : null;
  } catch {
    payload = null;
  }
  if (!payload) {
    return;
  }
  // One quiet notification at a time — new chat pushes replace the previous.
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/maskable-192.png",
      tag: "hearth-chat",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url ?? "/messages",
    self.location.origin,
  ).toString();
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.toString() === target && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
