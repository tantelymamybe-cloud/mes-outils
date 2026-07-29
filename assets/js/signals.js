/* ==========================================================================
   SNIPR — Contrôleur de la page Signaux
   - Lit les signaux ENREGISTRÉS (data/latest.json + data/signals.json)
   - Repli sur le moteur live si les fichiers n'existent pas encore
   - Notifications navigateur quand un nouveau signal arrive
   ========================================================================== */

const Signals = (() => {
  let current = "XAUUSD";
  let latest = null;     // { generatedAt, signals: [] }
  let history = [];      // tableau, plus récent en tête

  const fmt = (v, d) => (+v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const DIGITS = { BTCUSD:1, XAUUSD:2, ETHUSD:2, SOLUSD:2, BNBUSD:2, XRPUSD:4, ADAUSD:4 };
  const digits = (sym) => DIGITS[sym] ?? 2;

  /* ---------- Rendu d'une carte signal ------------------------------------ */
  function card(sig) {
    const long = sig.dir === "LONG";
    const d = digits(sig.symbol);
    return `
    <article class="sig" data-dir="${sig.dir}">
      <div class="sig__top">
        <div class="sig__sym">${sig.symbol}
          <small>UT ${sig.tf} · ${sig.timeLabel || ""}</small>
        </div>
        <span class="pill ${long ? "pill--long" : "pill--short"}">${long ? "▲ ACHAT" : "▼ VENTE"}</span>
      </div>
      <div class="ladder">
        <div class="ladder__row ladder__row--entry"><span>Entrée</span><b>${fmt(sig.entry, d)}</b></div>
        <div class="ladder__row ladder__row--sl"><span>Stop Loss</span><b>${fmt(sig.sl, d)}</b></div>
        <div class="ladder__row ladder__row--tp"><span>Take Profit 1 · 1:2</span><b>${fmt(sig.tp1, d)}</b></div>
        <div class="ladder__row ladder__row--tp"><span>Take Profit 2 · 1:3</span><b>${fmt(sig.tp2, d)}</b></div>
      </div>
      <div class="sig__meta"><span>RSI ${sig.rsi}</span><span>Prix ${fmt(sig.price, d)}</span></div>
      <div class="conf">
        <div class="conf__bar"><div class="conf__fill" style="width:${sig.conf}%"></div></div>
        <div class="conf__label"><span>Confluence</span><span>${sig.conf}%</span></div>
      </div>
      <div class="tags">${(sig.tags || []).map(t => `<span class="tag">${t}</span>`).join("")}</div>
    </article>`;
  }

  /* ---------- Ligne d'historique ------------------------------------------ */
  function histRow(sig) {
    const long = sig.dir === "LONG";
    const d = digits(sig.symbol);
    return `
    <div class="hrow">
      <span class="hrow__sym">${sig.symbol}</span>
      <span class="pill ${long ? "pill--long" : "pill--short"}">${long ? "ACHAT" : "VENTE"}</span>
      <span class="hrow__lvl">E <b>${fmt(sig.entry, d)}</b></span>
      <span class="hrow__lvl down">SL <b>${fmt(sig.sl, d)}</b></span>
      <span class="hrow__lvl up">TP <b>${fmt(sig.tp1, d)}</b></span>
      <span class="hrow__conf">${sig.conf}%</span>
      <span class="hrow__time">${sig.timeLabel || new Date(sig.generatedAt).toLocaleString("fr-FR")}</span>
    </div>`;
  }

  /* ---------- Rendu global ------------------------------------------------- */
  function render() {
    const grid = document.getElementById("signals-grid");
    const hbox = document.getElementById("history-list");

    const live = (latest?.signals || []).filter(s => s.symbol === current);
    grid.innerHTML = live.length
      ? live.map(card).join("")
      : `<div class="state">Aucun signal enregistré pour ${current} pour l'instant.<br>Le prochain arrive à la prochaine exécution automatique.</div>`;

    const hsym = document.getElementById("hist-sym");
    if (hsym) hsym.textContent = current;
    if (hbox) {
      const rows = history.filter(s => s.symbol === current).slice(0, 30);
      hbox.innerHTML = rows.length ? rows.map(histRow).join("")
        : `<div class="state">Historique vide pour ${current}.</div>`;
    }

    // relance l'animation des barres
    requestAnimationFrame(() => document.querySelectorAll(".conf__fill").forEach(f => {
      const w = f.style.width; f.style.width = "0%";
      requestAnimationFrame(() => f.style.width = w);
    }));

    const stamp = document.getElementById("last-update");
    if (stamp && latest) stamp.textContent = "Dernière mise à jour : " +
      new Date(latest.generatedAt).toLocaleString("fr-FR");
  }

  /* ---------- Chargement des données -------------------------------------- */
  async function loadData(showSpinner) {
    const grid = document.getElementById("signals-grid");
    if (showSpinner) grid.innerHTML = `<div class="state"><div class="spinner"></div>Chargement des signaux…</div>`;
    try {
      const [l, h] = await Promise.all([
        fetch("data/latest.json", { cache: "no-store" }).then(r => r.ok ? r.json() : null),
        fetch("data/signals.json", { cache: "no-store" }).then(r => r.ok ? r.json() : [])
      ]);
      if (l) { latest = l; history = h || []; render(); checkNew(); return true; }
    } catch (_) {}
    // Repli : calcul live via le moteur (avant la 1re exécution Actions)
    return liveFallback();
  }

  async function liveFallback() {
    const grid = document.getElementById("signals-grid");
    if (typeof Engine === "undefined") { grid.innerHTML = `<div class="state">Données indisponibles.</div>`; return false; }
    try {
      Engine.CONFIG.interval = current === "BTCUSD" ? "1h" : "1h";
      const s = await Engine.analyze(current);
      s.timeLabel = s.time; latest = { generatedAt: new Date().toISOString(), signals: [s] };
      render();
    } catch (e) { grid.innerHTML = `<div class="state">Impossible de charger les données.</div>`; }
    return false;
  }

  /* ---------- Notifications ----------------------------------------------- */
  const LAST_KEY = "snipr_last_seen";

  function checkNew() {
    if (!latest) return;
    let seen = null;
    try { seen = localStorage.getItem(LAST_KEY); } catch (_) {}
    if (seen && seen !== latest.generatedAt) {
      const s = latest.signals[0];
      const body = latest.signals.map(x =>
        `${x.symbol} ${x.dir === "LONG" ? "ACHAT" : "VENTE"} @ ${x.entry}`).join("  |  ");
      fireNotification("Nouveau signal SNIPR", body);
      showBanner(body);
    }
    try { localStorage.setItem(LAST_KEY, latest.generatedAt); } catch (_) {}
  }

  function fireNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    navigator.serviceWorker?.ready.then(reg =>
      reg.active?.postMessage({ type: "notify", title, body, url: "signals.html" })
    ).catch(() => new Notification(title, { body }));
  }

  function showBanner(text) {
    const b = document.getElementById("new-banner");
    if (!b) return;
    b.querySelector("[data-text]").textContent = text;
    b.classList.add("show");
    setTimeout(() => b.classList.remove("show"), 9000);
  }

  async function enableNotifications() {
    const btn = document.getElementById("notify-btn");
    if (!("Notification" in window)) { alert("Ton navigateur ne gère pas les notifications."); return; }
    if ("serviceWorker" in navigator) {
      try { await navigator.serviceWorker.register("sw.js"); } catch (_) {}
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      btn.textContent = "🔔 Notifications activées";
      btn.disabled = true;
      fireNotification("Notifications activées ✓", "Tu seras prévenu à chaque nouveau signal.");
    } else {
      btn.textContent = "Notifications refusées";
    }
  }

  /* ---------- Init --------------------------------------------------------- */
  function init() {
    document.querySelectorAll(".tabs button").forEach(btn =>
      btn.addEventListener("click", () => {
        current = btn.dataset.sym;
        document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b === btn));
        render();
      }));

    const refresh = document.getElementById("refresh");
    if (refresh) refresh.addEventListener("click", () => loadData(true));

    const notify = document.getElementById("notify-btn");
    if (notify) notify.addEventListener("click", enableNotifications);

    // état initial du bouton notif
    if ("Notification" in window && Notification.permission === "granted" && notify) {
      notify.textContent = "🔔 Notifications activées"; notify.disabled = true;
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    }

    loadData(true);
    // Vérifie l'arrivée de nouveaux signaux toutes les 60 s (site ouvert)
    setInterval(() => loadData(false), 60000);
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", Signals.init);
