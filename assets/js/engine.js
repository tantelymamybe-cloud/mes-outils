/* ==========================================================================
   SNIPR ENGINE — Moteur d'analyse technique
   Détecte les Fair Value Gaps (FVG) et Order Blocks (OB), mesure la confluence
   (EMA / RSI / structure) et propose une entrée avec SL/TP basés sur l'ATR.

   ⚠️  Ceci est un outil d'ANALYSE, pas une garantie. Le "score de confiance"
   reflète le nombre de facteurs alignés, PAS une probabilité de gain réelle.
   ========================================================================== */

const Engine = (() => {

  /* ---------- Sources de données --------------------------------------- */
  // BTCUSD : API publique Binance (gratuite, CORS activé, aucune clé requise).
  // XAUUSD : nécessite un fournisseur (ex. Twelve Data). Renseigne ta clé ci-dessous.
  //          Sans clé, on bascule sur un flux de démonstration synthétique.
  const CONFIG = {
    TWELVE_DATA_KEY: "",            // <-- colle ta clé gratuite twelvedata.com ici
    interval: "15min",             // unité de temps d'analyse
    limit: 200                     // nombre de bougies analysées
  };

  const SPECS = {
    XAUUSD: { td: "XAU/USD", binance: "PAXGUSDT", digits: 2, atrMult: 1.3 },
    BTCUSD: { binance: "BTCUSDT", digits: 1,  atrMult: 1.4 },
    ETHUSD: { binance: "ETHUSDT", digits: 2,  atrMult: 1.4 },
    SOLUSD: { binance: "SOLUSDT", digits: 2,  atrMult: 1.5 },
    BNBUSD: { binance: "BNBUSDT", digits: 2,  atrMult: 1.4 },
    XRPUSD: { binance: "XRPUSDT", digits: 4,  atrMult: 1.5 },
    ADAUSD: { binance: "ADAUSDT", digits: 4,  atrMult: 1.5 }
  };

  /* ---------- Récupération des bougies --------------------------------- */
  async function fetchCandles(symbol) {
    const spec = SPECS[symbol] || {};
    try {
      // XAUUSD : Twelve Data si clé fournie (le plus précis)
      if (symbol === "XAUUSD" && CONFIG.TWELVE_DATA_KEY) {
        try { return await fetchTwelveData(); }
        catch (e) { console.warn("[engine] Twelve Data KO, bascule PAXG :", e.message); }
      }
      // Toutes les paires (et l'or sans clé) : Binance, sans clé
      if (spec.binance) return await fetchBinance(spec.binance);
    } catch (e) {
      console.warn("[engine] source réelle indisponible, bascule démo :", e.message);
    }
    return synthetic(symbol);            // secours ultime : données de démonstration
  }

  async function fetchBinance(pair = "BTCUSDT") {
    const iv = CONFIG.interval.replace("min", "m");
    const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${iv}&limit=${CONFIG.limit}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("binance " + r.status);
    const raw = await r.json();
    return raw.map(k => ({
      t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5]
    }));
  }

  async function fetchTwelveData() {
    const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${CONFIG.interval}` +
                `&outputsize=${CONFIG.limit}&order=ASC&apikey=${CONFIG.TWELVE_DATA_KEY}`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j.values) throw new Error(j.message || "twelvedata");
    return j.values.map(v => ({
      t: new Date(v.datetime).getTime(),
      o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +(v.volume || 0)
    }));
  }

  // Flux synthétique déterministe (marche partout, sans réseau) --------------
  function synthetic(symbol) {
    const BASES = { BTCUSD:68000, XAUUSD:3300, ETHUSD:3400, SOLUSD:150, BNBUSD:600, XRPUSD:0.55, ADAUSD:0.45 };
    const base = BASES[symbol] ?? 100;
    const vol  = base * 0.012;
    let seed = Date.now() >> 16, price = base;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const out = [];
    for (let i = 0; i < CONFIG.limit; i++) {
      // marche aléatoire à retour vers la moyenne -> prix réalistes et positifs
      const pull  = (base - price) * 0.03;
      const drift = pull + (rnd() - 0.5) * vol * 0.5;
      const o = price;
      const c = Math.max(price + drift, base * 0.4);
      const h = Math.max(o, c) + rnd() * vol * 0.4;
      const l = Math.min(o, c) - rnd() * vol * 0.4;
      out.push({ t: Date.now() - (CONFIG.limit - i) * 9e5, o, h, l, c, v: rnd() * 1000 });
      price = c;
    }
    return out;
  }

  /* ---------- Indicateurs ---------------------------------------------- */
  const ema = (arr, p) => {
    const k = 2 / (p + 1); let prev = arr[0], out = [prev];
    for (let i = 1; i < arr.length; i++) { prev = arr[i] * k + prev * (1 - k); out.push(prev); }
    return out;
  };

  function rsi(closes, p = 14) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= p; i++) {
      const d = closes[i] - closes[i - 1];
      d >= 0 ? gains += d : losses -= d;
    }
    let ag = gains / p, al = losses / p;
    for (let i = p + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      ag = (ag * (p - 1) + Math.max(d, 0)) / p;
      al = (al * (p - 1) + Math.max(-d, 0)) / p;
    }
    const rs = al === 0 ? 100 : ag / al;
    return 100 - 100 / (1 + rs);
  }

  function atr(c, p = 14) {
    const tr = [];
    for (let i = 1; i < c.length; i++) {
      tr.push(Math.max(
        c[i].h - c[i].l,
        Math.abs(c[i].h - c[i - 1].c),
        Math.abs(c[i].l - c[i - 1].c)
      ));
    }
    const slice = tr.slice(-p);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  /* ---------- Détection Fair Value Gap (déséquilibre 3 bougies) --------- */
  // FVG haussier : bas de la bougie i+1 > haut de la bougie i-1  (gap non comblé)
  // FVG baissier : haut de la bougie i+1 < bas de la bougie i-1
  function findFVG(c) {
    const gaps = [];
    for (let i = c.length - 2; i >= 2; i--) {
      const prev = c[i - 1], next = c[i + 1];
      if (next.l > prev.h) gaps.push({ dir: "LONG",  top: next.l, bot: prev.h, idx: i });
      else if (next.h < prev.l) gaps.push({ dir: "SHORT", top: prev.l, bot: next.h, idx: i });
      if (gaps.length >= 6) break;
    }
    return gaps;
  }

  /* ---------- Détection Order Block ------------------------------------ */
  // OB haussier : dernière bougie baissière avant une impulsion haussière forte.
  // OB baissier : dernière bougie haussière avant une impulsion baissière forte.
  function findOB(c, a) {
    const blocks = [];
    for (let i = c.length - 4; i >= 3; i--) {
      const cur = c[i];
      const move = c[i + 1].c - c[i + 1].o;
      const strong = Math.abs(move) > a * 0.8;
      if (!strong) continue;
      if (move > 0 && cur.c < cur.o) blocks.push({ dir: "LONG",  top: cur.h, bot: cur.l, idx: i });
      if (move < 0 && cur.c > cur.o) blocks.push({ dir: "SHORT", top: cur.h, bot: cur.l, idx: i });
      if (blocks.length >= 6) break;
    }
    return blocks;
  }

  /* ---------- Structure de marché (BOS simplifié) ---------------------- */
  function structure(c) {
    const n = c.length;
    const recentHigh = Math.max(...c.slice(n - 20, n - 1).map(x => x.h));
    const recentLow  = Math.min(...c.slice(n - 20, n - 1).map(x => x.l));
    const last = c[n - 1].c;
    if (last > recentHigh) return "LONG";
    if (last < recentLow)  return "SHORT";
    return null;
  }

  /* ---------- Construction d'un signal --------------------------------- */
  function buildSignal(symbol, candles) {
    const spec = SPECS[symbol];
    const closes = candles.map(c => c.c);
    const price = closes.at(-1);
    const e20 = ema(closes, 20).at(-1);
    const e50 = ema(closes, 50).at(-1);
    const rsiV = rsi(closes);
    const a = atr(candles);

    const fvgs = findFVG(candles);
    const obs  = findOB(candles, a);
    const bos  = structure(candles);

    // Biais dominant : on additionne les votes de chaque facteur.
    let vote = 0;
    const factors = [];
    if (e20 > e50) { vote++; factors.push("EMA20>EMA50"); } else { vote--; factors.push("EMA20<EMA50"); }
    if (price > e50) vote++; else vote--;
    if (rsiV > 55) { vote++; factors.push("RSI haussier"); }
    else if (rsiV < 45) { vote--; factors.push("RSI baissier"); }
    if (bos === "LONG") { vote++; factors.push("BOS haussier"); }
    if (bos === "SHORT") { vote--; factors.push("BOS baissier"); }

    const dir = vote >= 0 ? "LONG" : "SHORT";

    // Zone d'entrée : on privilégie un OB, sinon un FVG, aligné avec le biais.
    const zone = obs.find(o => o.dir === dir) || fvgs.find(f => f.dir === dir);
    let entry, tag = [];
    if (zone) {
      entry = (zone.top + zone.bot) / 2;
      tag.push(obs.includes(zone) ? "Order Block" : "Fair Value Gap");
    } else {
      entry = price;                      // pas de zone nette -> entrée au marché
      tag.push("Momentum");
    }

    // SL au-delà de la structure de la zone ; TP en R multiples (1:2 et 1:3).
    const buffer = a * spec.atrMult;
    let sl, tp1, tp2;
    if (dir === "LONG") {
      sl  = (zone ? zone.bot : entry) - buffer;
      const risk = entry - sl;
      tp1 = entry + risk * 2;
      tp2 = entry + risk * 3;
    } else {
      sl  = (zone ? zone.top : entry) + buffer;
      const risk = sl - entry;
      tp1 = entry - risk * 2;
      tp2 = entry - risk * 3;
    }

    // Confluence -> score (transparent : nb de facteurs alignés).
    let conf = 45;
    if (obs.some(o => o.dir === dir)) conf += 14;
    if (fvgs.some(f => f.dir === dir)) conf += 12;
    if (bos === dir) conf += 10;
    if ((dir === "LONG" && e20 > e50) || (dir === "SHORT" && e20 < e50)) conf += 8;
    if ((dir === "LONG" && rsiV > 52 && rsiV < 72) ||
        (dir === "SHORT" && rsiV < 48 && rsiV > 28)) conf += 6;
    conf = Math.min(conf, 82);            // plafond honnête : jamais de "certitude"

    if (obs.some(o => o.dir === dir)) tag.push("OB confirmé");
    if (fvgs.some(f => f.dir === dir)) tag.push("FVG " + (dir === "LONG" ? "haussier" : "baissier"));
    if (bos === dir) tag.push("BOS");
    tag.push("R:R 1:2 / 1:3");

    const d = spec.digits;
    return {
      symbol, dir, tf: CONFIG.interval,
      price:  price.toFixed(d),
      entry:  entry.toFixed(d),
      sl:     sl.toFixed(d),
      tp1:    tp1.toFixed(d),
      tp2:    tp2.toFixed(d),
      rsi:    rsiV.toFixed(1),
      conf, factors, tags: tag,
      time:   new Date().toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
      candles
    };
  }

  /* ---------- API publique du module ----------------------------------- */
  async function analyze(symbol) {
    const candles = await fetchCandles(symbol);
    return buildSignal(symbol, candles);
  }

  return { analyze, CONFIG, fetchCandles };
})();
