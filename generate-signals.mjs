/* ==========================================================================
   SNIPR — Générateur de signaux (exécuté par GitHub Actions)
   1. récupère les bougies (Binance pour BTC, Twelve Data pour l'Or)
   2. calcule OB / FVG / confluence
   3. écrit data/latest.json + ajoute à l'historique data/signals.json
   4. envoie le signal sur Telegram
   ========================================================================== */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const INTERVAL = "1h";
const LIMIT = 200;
const SPECS = {
  XAUUSD: { binance: "PAXGUSDT", td: "XAU/USD", digits: 2, atrMult: 1.3, emoji: "🥇" },
  BTCUSD: { binance: "BTCUSDT",  digits: 1, atrMult: 1.4, emoji: "₿" },
  ETHUSD: { binance: "ETHUSDT",  digits: 2, atrMult: 1.4, emoji: "Ξ" },
  SOLUSD: { binance: "SOLUSDT",  digits: 2, atrMult: 1.5, emoji: "◎" },
  BNBUSD: { binance: "BNBUSDT",  digits: 2, atrMult: 1.4, emoji: "🅑" },
  XRPUSD: { binance: "XRPUSDT",  digits: 4, atrMult: 1.5, emoji: "✕" },
  ADAUSD: { binance: "ADAUSDT",  digits: 4, atrMult: 1.5, emoji: "₳" }
};

const ENV = {
  TG_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TG_CHAT:  process.env.TELEGRAM_CHAT_ID   || "",
  TD_KEY:   process.env.TWELVE_DATA_KEY    || ""
};

/* ---------- Données -------------------------------------------------------- */
async function fetchBinance(pair = "BTCUSDT") {
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${INTERVAL}&limit=${LIMIT}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("binance " + r.status + " (" + pair + ")");
  const raw = await r.json();
  return raw.map(k => ({ o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
}
async function fetchTwelve() {
  if (!ENV.TD_KEY) throw new Error("pas de clé Twelve Data");
  const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${INTERVAL}` +
              `&outputsize=${LIMIT}&order=ASC&apikey=${ENV.TD_KEY}`;
  const r = await fetch(url);
  const j = await r.json();
  if (!j.values) throw new Error(j.message || "twelvedata");
  return j.values.map(v => ({ o: +v.open, h: +v.high, l: +v.low, c: +v.close }));
}
async function candles(sym) {
  // XAUUSD : Twelve Data si clé dispo (le plus précis), sinon repli PAXG.
  if (sym === "XAUUSD" && ENV.TD_KEY) {
    try { return await fetchTwelve(); }
    catch (e) { console.warn("Twelve Data KO, repli PAXG :", e.message); }
  }
  // Toutes les autres paires (et l'or sans clé) : Binance, aucune clé requise.
  return fetchBinance(SPECS[sym].binance);
}

/* ---------- Indicateurs ---------------------------------------------------- */
const ema = (a, p) => { const k = 2/(p+1); let e = a[0]; const o=[e];
  for (let i=1;i<a.length;i++){ e = a[i]*k + e*(1-k); o.push(e);} return o; };
function rsi(c, p=14){ let g=0,l=0;
  for(let i=1;i<=p;i++){const d=c[i]-c[i-1]; d>=0?g+=d:l-=d;}
  let ag=g/p, al=l/p;
  for(let i=p+1;i<c.length;i++){const d=c[i]-c[i-1];
    ag=(ag*(p-1)+Math.max(d,0))/p; al=(al*(p-1)+Math.max(-d,0))/p;}
  const rs = al===0?100:ag/al; return 100-100/(1+rs); }
function atr(c,p=14){ const tr=[];
  for(let i=1;i<c.length;i++) tr.push(Math.max(c[i].h-c[i].l,
    Math.abs(c[i].h-c[i-1].c), Math.abs(c[i].l-c[i-1].c)));
  const s=tr.slice(-p); return s.reduce((a,b)=>a+b,0)/s.length; }

function findFVG(c){ const g=[];
  for(let i=c.length-2;i>=2;i--){ const p=c[i-1],n=c[i+1];
    if(n.l>p.h) g.push({dir:"LONG",top:n.l,bot:p.h});
    else if(n.h<p.l) g.push({dir:"SHORT",top:p.l,bot:n.h});
    if(g.length>=6) break; } return g; }
function findOB(c,a){ const b=[];
  for(let i=c.length-4;i>=3;i--){ const cur=c[i], mv=c[i+1].c-c[i+1].o;
    if(Math.abs(mv)<a*0.8) continue;
    if(mv>0&&cur.c<cur.o) b.push({dir:"LONG",top:cur.h,bot:cur.l});
    if(mv<0&&cur.c>cur.o) b.push({dir:"SHORT",top:cur.h,bot:cur.l});
    if(b.length>=6) break; } return b; }
function structure(c){ const n=c.length;
  const hi=Math.max(...c.slice(n-20,n-1).map(x=>x.h));
  const lo=Math.min(...c.slice(n-20,n-1).map(x=>x.l));
  const last=c[n-1].c;
  if(last>hi) return "LONG"; if(last<lo) return "SHORT"; return null; }

/* ---------- Construction du signal ---------------------------------------- */
function build(sym, c){
  const spec=SPECS[sym], cl=c.map(x=>x.c), price=cl.at(-1);
  const e20=ema(cl,20).at(-1), e50=ema(cl,50).at(-1), r=rsi(cl), a=atr(c);
  const fvgs=findFVG(c), obs=findOB(c,a), bos=structure(c);

  let vote=0;
  if(e20>e50) vote++; else vote--;
  if(price>e50) vote++; else vote--;
  if(r>55) vote++; else if(r<45) vote--;
  if(bos==="LONG") vote++; if(bos==="SHORT") vote--;
  const dir = vote>=0 ? "LONG" : "SHORT";

  const zone = obs.find(o=>o.dir===dir) || fvgs.find(f=>f.dir===dir);
  const tags=[];
  let entry;
  if(zone){ entry=(zone.top+zone.bot)/2; tags.push(obs.includes(zone)?"Order Block":"Fair Value Gap"); }
  else { entry=price; tags.push("Momentum"); }

  const buf=a*spec.atrMult; let sl,tp1,tp2;
  if(dir==="LONG"){ sl=(zone?zone.bot:entry)-buf; const rk=entry-sl; tp1=entry+rk*2; tp2=entry+rk*3; }
  else            { sl=(zone?zone.top:entry)+buf; const rk=sl-entry; tp1=entry-rk*2; tp2=entry-rk*3; }

  let conf=45;
  if(obs.some(o=>o.dir===dir)) conf+=14;
  if(fvgs.some(f=>f.dir===dir)) conf+=12;
  if(bos===dir) conf+=10;
  if((dir==="LONG"&&e20>e50)||(dir==="SHORT"&&e20<e50)) conf+=8;
  if((dir==="LONG"&&r>52&&r<72)||(dir==="SHORT"&&r<48&&r>28)) conf+=6;
  conf=Math.min(conf,82);

  if(obs.some(o=>o.dir===dir)) tags.push("OB confirmé");
  if(fvgs.some(f=>f.dir===dir)) tags.push("FVG "+(dir==="LONG"?"haussier":"baissier"));
  if(bos===dir) tags.push("BOS");
  tags.push("R:R 1:2 / 1:3");

  const d=spec.digits, now=new Date();
  return {
    id: `${sym}-${now.getTime()}`,
    symbol: sym, dir, tf: INTERVAL,
    price:price.toFixed(d), entry:entry.toFixed(d), sl:sl.toFixed(d),
    tp1:tp1.toFixed(d), tp2:tp2.toFixed(d), rsi:r.toFixed(1),
    conf, tags,
    generatedAt: now.toISOString(),
    timeLabel: now.toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Paris"})
  };
}

/* ---------- Telegram ------------------------------------------------------- */
async function telegram(sig){
  if(!ENV.TG_TOKEN || !ENV.TG_CHAT){ console.log("Telegram non configuré, envoi ignoré."); return; }
  const spec=SPECS[sig.symbol];
  const arrow = sig.dir==="LONG" ? "🟢 ACHAT" : "🔴 VENTE";
  const text =
`${spec.emoji} <b>${sig.symbol}</b> — ${arrow}
<b>Confluence :</b> ${sig.conf}%  |  <b>UT :</b> ${sig.tf}

🎯 Entrée : <b>${sig.entry}</b>
🛑 Stop   : <b>${sig.sl}</b>
✅ TP1 (1:2) : <b>${sig.tp1}</b>
✅ TP2 (1:3) : <b>${sig.tp2}</b>

<i>${sig.tags.join(" · ")}</i>
${sig.timeLabel}

⚠️ Analyse à titre informatif — pas un conseil financier.`;
  const url=`https://api.telegram.org/bot${ENV.TG_TOKEN}/sendMessage`;
  const r=await fetch(url,{ method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ chat_id:ENV.TG_CHAT, text, parse_mode:"HTML" }) });
  if(!r.ok) console.error("Telegram erreur:", await r.text());
  else console.log(`Telegram envoyé : ${sig.symbol}`);
}

/* ---------- Programme principal -------------------------------------------- */
async function main(){
  if(!existsSync("data")) mkdirSync("data");
  const fresh=[];
  for(const sym of Object.keys(SPECS)){
    try{
      const c=await candles(sym);
      const s=build(sym,c);
      fresh.push(s);
      console.log(`${sym}: ${s.dir} @ ${s.entry} (conf ${s.conf}%)`);
      await telegram(s);
    }catch(e){ console.error(`${sym} échec:`, e.message); }
  }
  if(!fresh.length){ console.error("Aucun signal généré."); process.exit(1); }

  // latest.json
  const latest={ generatedAt:new Date().toISOString(), signals:fresh };
  writeFileSync("data/latest.json", JSON.stringify(latest,null,2));

  // historique (plus récent en tête, plafonné à 300)
  let hist=[];
  try{ hist=JSON.parse(readFileSync("data/signals.json","utf8")); }catch(_){}
  hist = [...fresh, ...hist].slice(0,300);
  writeFileSync("data/signals.json", JSON.stringify(hist,null,2));

  console.log(`Terminé : ${fresh.length} signaux, historique = ${hist.length}.`);
}
main();
