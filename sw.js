/* SNIPR — Service worker (notifications) */

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => self.clients.claim());

// Affiche une notification demandée par la page
self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "notify") {
    self.registration.showNotification(d.title || "Nouveau signal", {
      body: d.body || "",
      icon: "assets/img/favicon.svg",
      badge: "assets/img/favicon.svg",
      tag: "snipr-signal",
      renotify: true,
      data: { url: d.url || "signals.html" }
    });
  }
});

// Clic sur la notification -> ouvre / met au premier plan la page signaux
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "signals.html";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
