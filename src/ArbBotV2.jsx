import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── Design Tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: "#05070c",
  surface: "#0b0f18",
  surface2: "#101520",
  surface3: "#141a26",
  border: "#1a2233",
  borderHi: "#243048",
  text: "#c8d8ec",
  muted: "#4a5e7a",
  dim: "#232f42",
  green: "#00e87a",
  greenDim: "#00e87a18",
  amber: "#f5a623",
  amberDim: "#f5a62318",
  purple: "#a78bfa",
  purpleDim: "#a78bfa18",
  blue: "#38bdf8",
  blueDim: "#38bdf818",
  red: "#f43f5e",
  redDim: "#f43f5e18",
  cyan: "#22d3ee",
  cyanDim: "#22d3ee18",
  teal: "#2dd4bf",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt   = (n, d = 2) => Number(n).toFixed(d);
const pct   = (n) => `${fmt(Number(n) * 100, 1)}%`;
const money = (n, d = 2) => `$${fmt(n, d)}`;
const nowTs = () => { const d = new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`; };

const RISK_COLOR = { low: C.green, medium: C.amber, high: C.red, critical: C.red };
const TYPE_COLOR = { LOGIC_ARB: C.blue, NEAR_RES: C.green, LOGIC: C.purple, KELLY: C.amber };

function Tag({ label, color = C.muted, size = "sm" }) {
  return (
    <span style={{
      display: "inline-block", padding: size === "xs" ? "0 5px" : "1px 8px",
      borderRadius: 3, fontSize: size === "xs" ? 9 : 10, fontWeight: 700,
      letterSpacing: "0.5px", textTransform: "uppercase",
      background: color + "22", color, border: `1px solid ${color}44`,
    }}>{label}</span>
  );
}

function Blink({ color = C.green }) {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setInterval(() => setOn(p => !p), 540); return () => clearInterval(t); }, []);
  return <span style={{ opacity: on ? 1 : 0, color, transition: "opacity 0.1s" }}>█</span>;
}

function Dot({ active, color = C.green, size = 7 }) {
  return <span style={{
    width: size, height: size, borderRadius: "50%", display: "inline-block",
    background: active ? color : C.muted, flexShrink: 0,
    boxShadow: active ? `0 0 8px ${color}` : "none", transition: "all 0.3s",
  }} />;
}

function Card({ children, style = {}, accent }) {
  return (
    <div style={{
      background: C.surface2, border: `1px solid ${C.border}`,
      borderLeft: accent ? `3px solid ${accent}` : undefined,
      borderRadius: 6, ...style,
    }}>{children}</div>
  );
}

function MetricMini({ label, value, color = C.text, mono = true }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: mono ? "IBM Plex Mono, monospace" : "inherit", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ─── Live API Engine (Polymarket-only) ────────────────────────────────────────
// Pulls real data from Polymarket Gamma API. Three strategies:
//   1. Logic Arb  — intra-Polymarket price inconsistencies (A implies B but P(A) > P(B))
//   2. Near-Res   — high-prob markets close to expiry
//   3. Kelly sizer — optimal position sizing on any found edge

const CLOB_BASE = "https://clob.polymarket.com";

// ── Fallback seed data (used only if Gamma API unreachable) ──────────────────
const FALLBACK_POLY = [
  { id: "poly_fed_jun",   slug: "will-the-fed-cut-rates-june-2026",           question: "Will the Fed cut rates at the June 2026 FOMC?",          endDate: "2026-06-18", outcomePrices: [0.31, 0.69], volume: 893000,  liquidity: 89300,  category: "Macro"    },
  { id: "poly_fed_may",   slug: "will-the-fed-cut-rates-may-2026",             question: "Will the Fed cut rates at the May 2026 FOMC?",            endDate: "2026-05-07", outcomePrices: [0.14, 0.86], volume: 540000,  liquidity: 54000,  category: "Macro"    },
  { id: "poly_btc_100k",  slug: "will-bitcoin-exceed-100000-by-june-2026",     question: "Will Bitcoin exceed $100,000 by June 30, 2026?",          endDate: "2026-06-30", outcomePrices: [0.38, 0.62], volume: 2800000, liquidity: 280000, category: "Crypto"   },
  { id: "poly_btc_80k",   slug: "will-bitcoin-exceed-80000-by-june-2026",      question: "Will Bitcoin exceed $80,000 by June 30, 2026?",           endDate: "2026-06-30", outcomePrices: [0.61, 0.39], volume: 3100000, liquidity: 310000, category: "Crypto"   },
  { id: "poly_btc_60k",   slug: "will-bitcoin-exceed-60000-by-june-2026",      question: "Will Bitcoin exceed $60,000 by June 30, 2026?",           endDate: "2026-06-30", outcomePrices: [0.88, 0.12], volume: 1200000, liquidity: 120000, category: "Crypto"   },
  { id: "poly_eth_4k",    slug: "will-ethereum-exceed-4000-by-june-2026",      question: "Will Ethereum exceed $4,000 by June 30, 2026?",           endDate: "2026-06-30", outcomePrices: [0.29, 0.71], volume: 780000,  liquidity: 78000,  category: "Crypto"   },
  { id: "poly_eth_3k",    slug: "will-ethereum-exceed-3000-by-june-2026",      question: "Will Ethereum exceed $3,000 by June 30, 2026?",           endDate: "2026-06-30", outcomePrices: [0.52, 0.48], volume: 920000,  liquidity: 92000,  category: "Crypto"   },
  { id: "poly_senate_r",  slug: "republicans-maintain-senate-majority-2026",   question: "Will Republicans maintain Senate majority after 2026?",   endDate: "2026-11-10", outcomePrices: [0.61, 0.39], volume: 2800000, liquidity: 280000, category: "Politics" },
  { id: "poly_house_r",   slug: "republicans-control-house-2026-midterms",     question: "Will Republicans control the House after 2026 midterms?", endDate: "2026-11-10", outcomePrices: [0.55, 0.45], volume: 2100000, liquidity: 210000, category: "Politics" },
  { id: "poly_cpi_apr",   slug: "us-cpi-below-3-5-april-2026",                 question: "Will US CPI be below 3.5% in the April 2026 reading?",   endDate: "2026-05-10", outcomePrices: [0.91, 0.09], volume: 1560000, liquidity: 156000, category: "Macro"    },
  { id: "poly_cpi_mar",   slug: "us-cpi-below-3-march-2026",                   question: "Will US CPI be below 3% in the March 2026 reading?",     endDate: "2026-04-10", outcomePrices: [0.44, 0.56], volume: 880000,  liquidity: 88000,  category: "Macro"    },
  { id: "poly_nato",      slug: "nato-summit-june-2026",                        question: "Will NATO summit occur in June 2026?",                    endDate: "2026-06-30", outcomePrices: [0.96, 0.04], volume: 440000,  liquidity: 44000,  category: "Politics" },
];

// ── Real Polymarket CLOB fetch (CORS-friendly) ────────────────────────────────
// Step 1: sampling-simplified-markets → live prices + condition_ids (active only)
// Step 2: parallel per-market detail fetch → question, slug, volume, endDate
async function fetchPolymarkets(limit = 60) {
  const simplResp = await fetch(
    `${CLOB_BASE}/sampling-simplified-markets?limit=${limit}`,
    { headers: { Accept: "application/json" } }
  );
  if (!simplResp.ok) throw new Error(`CLOB ${simplResp.status}`);
  const { data: items = [] } = await simplResp.json();

  const details = await Promise.all(
    items.map(item =>
      fetch(`${CLOB_BASE}/markets/${item.condition_id}`, { headers: { Accept: "application/json" } })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  );

  return items.map((item, i) => {
    const d = details[i];
    if (!d?.question) return null;
    // Strict binary YES/NO matching. Non-binary markets are skipped — the old
    // index-0/index-1 fallback silently treated multi-outcome markets as binary.
    const tks = Array.isArray(item.tokens) ? item.tokens : [];
    const yesToken = tks.find(t => String(t.outcome).toLowerCase() === "yes");
    const noToken  = tks.find(t => String(t.outcome).toLowerCase() === "no");
    if (!yesToken || !noToken) return null;
    const yesPrice = parseFloat(yesToken.price);
    const noPrice  = parseFloat(noToken.price);
    if (!Number.isFinite(yesPrice) || !Number.isFinite(noPrice)) return null;
    // Polymarket exposes mutex grouping via negRiskMarketID; gamma also surfaces
    // events[0].id. Either is usable as a group key — Jaccard text similarity is not.
    const eventId = d.negRiskMarketID || d.neg_risk_market_id || d.event_id || d.events?.[0]?.id || null;
    return {
      id:            item.condition_id,
      slug:          d.market_slug || "",
      question:      d.question,
      endDate:       (d.end_date_iso || "")?.slice(0, 10),
      outcomePrices: [yesPrice, noPrice],
      // token_ids are needed for /book (depth) and /prices-history (backtest).
      // Stored alongside the prices so consumers don't have to re-zip.
      yesTokenId:    String(yesToken.token_id || ""),
      noTokenId:     String(noToken.token_id  || ""),
      volume:        parseFloat(d.volume    || 0),
      liquidity:     parseFloat(d.liquidity || 0),
      category:      d.tags?.[0] || "General",
      eventId,
    };
  }).filter(m => m && m.question && m.outcomePrices[0] > 0.001 && m.outcomePrices[0] < 0.999);
}

// ── Orderbook depth fetch + slippage walker ──────────────────────────────────
// /book returns { bids: [{price, size}], asks: [{price, size}] } where
// `price` is per-share USDC and `size` is the quantity of shares offered at
// that price. Bids are sorted highest-first, asks lowest-first.
async function fetchBook(tokenId) {
  if (!tokenId) return null;
  try {
    const r = await fetch(`${CLOB_BASE}/book?token_id=${encodeURIComponent(tokenId)}`, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const norm = side => (Array.isArray(j[side]) ? j[side] : []).map(l => ({
      price: parseFloat(l.price),
      size:  parseFloat(l.size),
    })).filter(l => Number.isFinite(l.price) && Number.isFinite(l.size) && l.size > 0);
    return { bids: norm("bids"), asks: norm("asks") };
  } catch {
    return null;
  }
}

// Walk the asks (or bids) until we've spent `budgetUsd` worth of USDC.
// Returns { sharesFilled, avgPrice, spentUsd, exhausted } where `exhausted`
// means the book ran out before the budget did. Use `asks` to simulate buying
// YES (or buying NO via the No-token's asks).
function walkAsks(asks, budgetUsd) {
  let remainingUsd = budgetUsd;
  let shares = 0;
  let spent = 0;
  for (const lvl of asks) {
    if (remainingUsd <= 0) break;
    const lvlNotional = lvl.price * lvl.size;
    if (lvlNotional >= remainingUsd) {
      const lvlShares = remainingUsd / lvl.price;
      shares += lvlShares;
      spent  += remainingUsd;
      remainingUsd = 0;
      break;
    }
    shares += lvl.size;
    spent  += lvlNotional;
    remainingUsd -= lvlNotional;
  }
  const exhausted = remainingUsd > 1e-6;
  return {
    sharesFilled: shares,
    avgPrice:     shares > 0 ? spent / shares : null,
    spentUsd:     spent,
    exhausted,
  };
}

// Cumulative cost-vs-shares curve for an ask side: out[k] = cost of buying
// the first k shares walked across the book level-by-level.
function buildCostCurve(asks) {
  const out = [{ shares: 0, cost: 0, price: 0 }];
  let s = 0, c = 0;
  for (const lvl of asks) {
    s += lvl.size;
    c += lvl.size * lvl.price;
    out.push({ shares: s, cost: c, price: lvl.price });
  }
  return out;
}

// Cost of buying `s` shares walking a precomputed cost curve. Returns Infinity
// if `s` exceeds the book's total size (i.e., not fillable at any price).
function costForShares(curve, s) {
  if (s <= 0) return 0;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].shares >= s) {
      const prev = curve[i - 1];
      return prev.cost + (s - prev.shares) * curve[i].price;
    }
  }
  return Infinity;
}

// Two-leg arbitrage: buy `S` shares of leg1 + `S` shares of leg2 such that one
// always pays $1 at resolution. Find the largest S where total cost ≤ S (ROI
// stays positive) and ≤ budget. Bisect on the cost curves.
function simulateTwoLegFill(book1, book2, maxBudgetUsd = 5000) {
  if (!book1?.asks?.length || !book2?.asks?.length) return null;
  const c1 = buildCostCurve(book1.asks);
  const c2 = buildCostCurve(book2.asks);
  const maxS = Math.min(c1[c1.length - 1].shares, c2[c2.length - 1].shares);
  if (maxS <= 0) return null;
  let lo = 0, hi = maxS;
  for (let iter = 0; iter < 60 && hi - lo > 1e-4; iter++) {
    const mid = (lo + hi) / 2;
    const cost = costForShares(c1, mid) + costForShares(c2, mid);
    if (cost <= mid && cost <= maxBudgetUsd) lo = mid;
    else hi = mid;
  }
  const shares = lo;
  if (shares <= 0) return null;
  const cost1 = costForShares(c1, shares);
  const cost2 = costForShares(c2, shares);
  const totalCost = cost1 + cost2;
  const profit = shares - totalCost;
  return {
    shares,
    cost1, cost2, totalCost,
    avgPrice1: cost1 / shares,
    avgPrice2: cost2 / shares,
    profit,
    roi: totalCost > 0 ? (profit / totalCost) * 100 : 0,
  };
}

// Same two-leg fill, but fills up to `budgetUsd` regardless of whether the
// trade is profitable at the margin. Used by the paper-trade journal so that
// losing trades still get recorded — that's the whole point of having a
// journal. The strict version above stays in place for the scanner card's
// depth check.
function simulateBudgetFill(book1, book2, budgetUsd) {
  if (!book1?.asks?.length || !book2?.asks?.length) return null;
  const c1 = buildCostCurve(book1.asks);
  const c2 = buildCostCurve(book2.asks);
  const maxS = Math.min(c1[c1.length - 1].shares, c2[c2.length - 1].shares);
  if (maxS <= 0) return null;
  let lo = 0, hi = maxS;
  for (let iter = 0; iter < 60 && hi - lo > 1e-4; iter++) {
    const mid = (lo + hi) / 2;
    const cost = costForShares(c1, mid) + costForShares(c2, mid);
    if (cost <= budgetUsd) lo = mid;
    else hi = mid;
  }
  const shares = lo;
  if (shares <= 0) return null;
  const cost1 = costForShares(c1, shares);
  const cost2 = costForShares(c2, shares);
  const totalCost = cost1 + cost2;
  const profit = shares - totalCost;
  return {
    shares,
    cost1, cost2, totalCost,
    avgPrice1: cost1 / shares,
    avgPrice2: cost2 / shares,
    profit,
    roi: totalCost > 0 ? (profit / totalCost) * 100 : 0,
  };
}

// ── Historical price fetch (backtester) ───────────────────────────────────────
// Polymarket exposes /prices-history?market=<token_id>&interval=1m|1w|1d|6h|1h
// — note `market` is the CLOB *token* id (not the condition_id). `fidelity` is
// the granularity in minutes (default 200). Returns { history: [{t, p}, ...] }.
async function fetchPricesHistory(tokenId, { interval = "1m", fidelity = 60 } = {}) {
  if (!tokenId) return null;
  try {
    const url = `${CLOB_BASE}/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}&fidelity=${fidelity}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const arr = Array.isArray(j.history) ? j.history : [];
    return arr.map(p => ({ t: Number(p.t), p: parseFloat(p.p) })).filter(p => Number.isFinite(p.t) && Number.isFinite(p.p));
  } catch {
    return null;
  }
}

// Replay a two-leg arb over the historical price series of leg1 and leg2.
// At each timestamp where both have a price within `toleranceSec`, compute
// `cost = p1 + p2` (since each leg is buying YES on its respective token at
// price p; for THRESH/MUTEX patterns the second leg is a NO bought at 1 - p).
// Caller passes a `costFn(p1, p2)` to handle that mapping.
function replayArb(history1, history2, costFn, toleranceSec = 7200) {
  if (!history1?.length || !history2?.length) return null;
  // Two-pointer merge: for each t in history1, find nearest t in history2.
  let j = 0;
  let samples = 0, hits = 0, totalEdge = 0, maxEdge = 0;
  const trace = [];
  for (const h1 of history1) {
    while (j + 1 < history2.length && Math.abs(history2[j + 1].t - h1.t) <= Math.abs(history2[j].t - h1.t)) j++;
    const h2 = history2[j];
    if (!h2 || Math.abs(h2.t - h1.t) > toleranceSec) continue;
    samples++;
    const cost = costFn(h1.p, h2.p);
    const edge = 1 - cost;
    if (edge > 0.005) { // ignore <0.5¢ noise
      hits++;
      totalEdge += edge;
      if (edge > maxEdge) maxEdge = edge;
    }
    trace.push({ t: h1.t, p1: h1.p, p2: h2.p, cost });
  }
  return {
    samples,
    hits,
    avgEdge: hits > 0 ? totalEdge / hits : 0,
    maxEdge,
    hitRate: samples > 0 ? hits / samples : 0,
    trace,
  };
}

// ── Notifications ─────────────────────────────────────────────────────────────
// Browser Notifications API (in-tab desktop alerts) + optional webhook POST
// (Discord/Slack/Telegram-bot-friendly JSON). The webhook URL must come from
// the user — never hardcoded — and is stored in localStorage under the key
// `arbbot.notify`.
async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try { return await Notification.requestPermission(); }
  catch { return "denied"; }
}

function notifyDesktop(title, body) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try { new Notification(title, { body }); } catch { /* swallow */ }
}

async function notifyWebhook(url, payload) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch { /* swallow — best-effort */ }
}

// Fan out notifications for every opportunity over `minRoi`. Caller decides
// whether to use desktop, webhook, or both.
async function fanOutNotifications({ desktop, webhookUrl, minRoi, opportunities }) {
  const winners = (opportunities || []).filter(o => (o.depthOk !== false ? (o.depthRoi ?? o.roi) : 0) >= minRoi);
  if (winners.length === 0) return 0;
  for (const o of winners) {
    const headline = `${o.type} ${o.depthRoi != null ? o.depthRoi : o.roi}% — ${o.market}`;
    const body = `Cost ${money(o.cost)} · Profit ${money(o.profit)} · ${o.daysToExpiry}d to expiry`;
    if (desktop) notifyDesktop(headline, body);
  }
  if (webhookUrl) {
    await notifyWebhook(webhookUrl, {
      content: `Arb bot: ${winners.length} opportunit${winners.length === 1 ? "y" : "ies"} ≥ ${minRoi}% ROI`,
      opportunities: winners.map(o => ({
        type: o.type,
        market: o.market,
        topRoi: o.roi,
        depthRoi: o.depthRoi ?? null,
        depthShares: o.depthShares ?? null,
        cost: o.cost,
        profit: o.profit,
        daysToExpiry: o.daysToExpiry,
        url1: o.url1,
        url2: o.url2,
      })),
    });
  }
  return winners.length;
}

// ── Polymarket API client with 30s cache + fallback ───────────────────────────
// Returns { markets, status } so the caller can lift status into React state.
const polymarketAPI = {
  _cache: null, _cacheTs: 0, _cacheStatus: "unknown",
  async getMarkets() {
    if (this._cache && Date.now() - this._cacheTs < 30000) {
      return { markets: this._cache, status: this._cacheStatus };
    }
    try {
      const markets = await fetchPolymarkets();
      this._cache = markets;
      this._cacheTs = Date.now();
      this._cacheStatus = "live";
      return { markets, status: "live" };
    } catch {
      const fallback = FALLBACK_POLY.map(m => {
        const y = Math.max(0.01, Math.min(0.99, m.outcomePrices[0] + (Math.random() - 0.5) * 0.015));
        return { ...m, outcomePrices: [+y.toFixed(3), +(1 - y).toFixed(3)], eventId: null };
      });
      this._cache = fallback;
      this._cacheTs = Date.now();
      this._cacheStatus = "demo";
      return { markets: fallback, status: "demo" };
    }
  },
};

// ── Logic Arb Engine ──────────────────────────────────────────────────────────
// Finds intra-Polymarket price inconsistencies. Three patterns:
//
//  Pattern A — Threshold monotonicity (price MUST be monotone in threshold):
//    "BTC > $100k by Jun" can't be MORE likely than "BTC > $80k by Jun"
//    If P(higher threshold) > P(lower threshold), buy lower-threshold YES
//    and buy higher-threshold NO for a guaranteed arb.
//
//  Pattern B — Mutual exclusivity overcount:
//    If P(A) + P(B) > 1.0 for two mutually exclusive outcomes, combined cost > $1
//    → sell both sides (or buy NO on each). Profitable at resolution.
//
//  Pattern C — Conditional dominance:
//    If event A logically implies event B, then P(A) ≤ P(B) must hold.
//    e.g. "Republicans win 60+ Senate seats" implies "Republicans control Senate"

// Curated implication rules for the dominance scanner. Each rule pairs a
// "stronger" event (logically implies the weaker) with a "weaker" event. If
// stronger is priced higher than weaker, that's an arbitrage. Edit this list
// as you find new pairs — patterns are case-insensitive regexes against the
// market question text. Keep rules narrow to avoid false positives.
const DOMINANCE_RULES = [
  {
    id: "btc_above_higher_implies_lower",
    description: "BTC > X implies BTC > Y for X > Y",
    stronger: /bitcoin\s+exceed\s+\$?100[,\s]?000/i,
    weaker:   /bitcoin\s+exceed\s+\$?80[,\s]?000/i,
  },
  {
    id: "eth_above_higher_implies_lower",
    description: "ETH > X implies ETH > Y for X > Y",
    stronger: /ethereum\s+exceed\s+\$?4[,\s]?000/i,
    weaker:   /ethereum\s+exceed\s+\$?3[,\s]?000/i,
  },
  {
    id: "cpi_below_lower_implies_higher",
    description: "CPI < X implies CPI < Y for X < Y",
    stronger: /cpi\s+below\s+3(?!\.5)/i,
    weaker:   /cpi\s+below\s+3\.5/i,
  },
];

// Extract numeric threshold from question text ("$80,000" → 80000, "3.5%" → 3.5)
function extractThreshold(text) {
  const m = text.match(/\$?([\d,]+(?:\.\d+)?)\s*([kKmMbB%]?)/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  const suffix = m[2].toLowerCase();
  if (suffix === "k") n *= 1e3;
  else if (suffix === "m") n *= 1e6;
  else if (suffix === "b") n *= 1e9;
  return n;
}

async function scanLogicArb() {
  const { markets, status } = await polymarketAPI.getMarkets();
  const isLive = status === "live";
  const opportunities = [];

  // ── Pattern A: threshold monotonicity ────────────────────────────────────────
  // Group markets by "same topic, different threshold" using high Jaccard similarity
  // after stripping numeric tokens
  const stripNums = q => q.replace(/\$?[\d,]+(?:\.\d+)?\s*[kKmMbB%]?/g, "NUM").replace(/\s+/g, " ").trim();

  const groups = {};
  for (const m of markets) {
    const key = stripNums(m.question).toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }

  for (const group of Object.values(groups)) {
    if (group.length < 2) continue;
    // Extract thresholds and sort ascending
    const withThresh = group.map(m => ({ ...m, thresh: extractThreshold(m.question) }))
      .filter(m => m.thresh !== null)
      .sort((a, b) => a.thresh - b.thresh);

    for (let i = 0; i < withThresh.length - 1; i++) {
      const lo = withThresh[i];   // lower threshold → MUST have higher yes price
      const hi = withThresh[i+1]; // higher threshold → MUST have lower yes price
      const loYes = lo.outcomePrices[0];
      const hiYes = hi.outcomePrices[0];

      // Violation: hi-threshold market priced MORE likely than lo-threshold
      if (hiYes > loYes + 0.02) {
        // Trade: buy loYes YES + buy hiYes NO (combined < $1 guaranteed at resolution)
        const cost    = loYes + hi.outcomePrices[1];
        const profit  = 1 - cost;
        const roi     = profit / cost * 100;
        if (profit > 0.01) {
          const days = Math.max(1, Math.round((new Date(lo.endDate) - new Date()) / 86400000));
          opportunities.push({
            id:        `logic_thresh_${lo.id}_${hi.id}_${Date.now()}`,
            type:      "THRESH",
            market:    lo.question.length > 55 ? lo.question.slice(0, 52) + "…" : lo.question,
            leg1:      { label: `YES  @ ${(loYes*100).toFixed(1)}¢`, market: lo.question,  price: loYes,               side: "YES", tokenId: lo.yesTokenId },
            leg2:      { label: `NO   @ ${(hi.outcomePrices[1]*100).toFixed(1)}¢`, market: hi.question, price: hi.outcomePrices[1], side: "NO",  tokenId: hi.noTokenId  },
            cost:      parseFloat(cost.toFixed(4)),
            profit:    parseFloat(profit.toFixed(4)),
            roi:       parseFloat(roi.toFixed(2)),
            apy:       parseFloat((roi / days * 365).toFixed(1)),
            expiry:    lo.endDate,
            daysToExpiry: days,
            liquidity: `$${((lo.liquidity + hi.liquidity) / 1000).toFixed(0)}K`,
            riskLevel: "low",
            category:  lo.category,
            rationale: `${hi.question.slice(0,40)}… priced at ${(hiYes*100).toFixed(1)}¢ > ${lo.question.slice(0,40)}… at ${(loYes*100).toFixed(1)}¢ — logically impossible`,
            scannedAt: nowTs(),
            isLive,
            url1:      lo.slug ? `https://polymarket.com/market/${lo.slug}` : null,
            url2:      hi.slug ? `https://polymarket.com/market/${hi.slug}` : null,
            multiLeg:  false,
          });
        }
      }
    }
  }

  // ── Pattern B: mutual exclusivity overcount ───────────────────────────────────
  // Group by Polymarket eventId / negRiskMarketID — markets sharing one are by
  // construction mutually exclusive. Text-similarity heuristics (e.g. Jaccard)
  // produce false positives like "Republicans control Senate" + "Republicans
  // control House", which are not mutex.
  const eventGroups = {};
  for (const m of markets) {
    if (!m.eventId) continue;
    (eventGroups[m.eventId] ||= []).push(m);
  }
  for (const group of Object.values(eventGroups)) {
    if (group.length < 2) continue;
    const sumYes = group.reduce((s, m) => s + m.outcomePrices[0], 0);
    if (sumYes <= 1.02) continue; // require >2% overcount before claiming arb
    const profit = sumYes - 1;
    // Sell every leg by buying NO on each — guaranteed payout of (n-1) at resolution
    const cost = group.reduce((s, m) => s + m.outcomePrices[1], 0);
    if (cost <= 0) continue;
    const roi = (profit / cost) * 100;
    const earliestEnd = group.map(m => new Date(m.endDate)).sort((a, b) => a - b)[0];
    const days = Math.max(1, Math.round((earliestEnd - new Date()) / 86400000));
    const a = group[0], b = group[1];
    opportunities.push({
      id:        `logic_mutex_${a.eventId}_${Date.now()}`,
      type:      "MUTEX",
      market:    `${a.question.slice(0,40)}… vs ${b.question.slice(0,30)}…${group.length > 2 ? ` (+${group.length - 2})` : ""}`,
      leg1:      { label: `NO  @ ${(a.outcomePrices[1]*100).toFixed(1)}¢`, market: a.question, price: a.outcomePrices[1], side: "NO", tokenId: a.noTokenId },
      leg2:      { label: `NO  @ ${(b.outcomePrices[1]*100).toFixed(1)}¢`, market: b.question, price: b.outcomePrices[1], side: "NO", tokenId: b.noTokenId },
      cost:      parseFloat(cost.toFixed(4)),
      profit:    parseFloat(profit.toFixed(4)),
      roi:       parseFloat(roi.toFixed(2)),
      apy:       parseFloat((roi / days * 365).toFixed(1)),
      expiry:    a.endDate,
      daysToExpiry: days,
      liquidity: `$${(group.reduce((s, m) => s + (m.liquidity || 0), 0) / 1000).toFixed(0)}K`,
      riskLevel: "low",
      category:  a.category,
      rationale: `${group.length} markets in event group — YES prices sum to ${(sumYes*100).toFixed(1)}¢ > 100¢; at most one can resolve YES`,
      scannedAt: nowTs(),
      isLive,
      url1:      a.slug ? `https://polymarket.com/market/${a.slug}` : null,
      url2:      b.slug ? `https://polymarket.com/market/${b.slug}` : null,
      multiLeg:  group.length > 2,
    });
  }

  // ── Pattern C: conditional dominance ────────────────────────────────────────
  // If event A logically implies event B then P(A) ≤ P(B) must hold. When the
  // market violates that ("BTC > $100k" priced higher than "BTC > $80k") buy
  // YES on B + NO on A for a guaranteed profit at resolution. The threshold
  // pattern catches one common case; this pattern uses a curated rules table
  // to catch implication relationships that aren't pure monotonicity over a
  // numeric threshold (e.g. "Republicans win 60+ Senate seats" implies
  // "Republicans control Senate"). Add rules over time as you find them.
  for (const rule of DOMINANCE_RULES) {
    const stronger = markets.find(m => rule.stronger.test(m.question));
    const weaker   = markets.find(m => rule.weaker.test(m.question));
    if (!stronger || !weaker) continue;
    if (stronger.eventId && weaker.eventId && stronger.eventId !== weaker.eventId) {
      // Skip cross-event rules unless explicitly intended; resolution criteria
      // can drift between events.
      if (!rule.allowCrossEvent) continue;
    }
    const sYes = stronger.outcomePrices[0];
    const wYes = weaker.outcomePrices[0];
    // Violation when stronger is priced more likely than weaker by > 2¢
    if (sYes <= wYes + 0.02) continue;
    const cost = sYes + (1 - wYes); // buy NO on stronger + YES on weaker — wait, let's think
    // Trade: buy YES on weaker (cheaper than its true prob) + buy NO on stronger
    // (expensive given P(stronger) < P(weaker) constraint) → at resolution one
    // pays $1, other pays $0 (no, this isn't a perfect arb because the events
    // aren't mutex; rather, when stronger=YES, weaker must also be YES, so YES
    // on weaker pays. When stronger=NO and weaker=YES, NO-on-stronger pays AND
    // YES-on-weaker pays. When both NO, NO-on-stronger pays. So payoff is at
    // least $1 always — in fact $2 when stronger=NO+weaker=YES).
    // Worst-case payout = $1, cost = wYes + (1 - sYes). Arb iff cost < 1.
    const realCost = wYes + (1 - sYes);
    const profit   = 1 - realCost;
    if (profit <= 0.01) continue;
    const roi      = (profit / realCost) * 100;
    const days     = Math.max(1, Math.round((new Date(weaker.endDate) - new Date()) / 86400000));
    opportunities.push({
      id:        `logic_dom_${rule.id}_${Date.now()}`,
      type:      "DOMINANCE",
      market:    `${stronger.question.slice(0, 35)}… implies ${weaker.question.slice(0, 30)}…`,
      leg1:      { label: `YES @ ${(wYes*100).toFixed(1)}¢`,       market: weaker.question,   price: wYes,       side: "YES", tokenId: weaker.yesTokenId },
      leg2:      { label: `NO  @ ${((1-sYes)*100).toFixed(1)}¢`,    market: stronger.question, price: 1 - sYes,    side: "NO",  tokenId: stronger.noTokenId },
      cost:      parseFloat(realCost.toFixed(4)),
      profit:    parseFloat(profit.toFixed(4)),
      roi:       parseFloat(roi.toFixed(2)),
      apy:       parseFloat((roi / days * 365).toFixed(1)),
      expiry:    weaker.endDate,
      daysToExpiry: days,
      liquidity: `$${((stronger.liquidity + weaker.liquidity) / 1000).toFixed(0)}K`,
      riskLevel: "low",
      category:  weaker.category,
      rationale: `${rule.description}. Stronger event priced at ${(sYes*100).toFixed(1)}¢ > weaker at ${(wYes*100).toFixed(1)}¢ — implies impossible.`,
      scannedAt: nowTs(),
      isLive,
      url1:      weaker.slug   ? `https://polymarket.com/market/${weaker.slug}`   : null,
      url2:      stronger.slug ? `https://polymarket.com/market/${stronger.slug}` : null,
      multiLeg:  false,
    });
  }

  // ── Depth pass: enrich each opp with slippage-aware metrics ────────────────
  // Walks the L2 orderbooks for both legs and finds the largest size where
  // the marginal pair-cost stays < $1. The static top-of-book ROI in `roi` is
  // optimistic; `depthRoi` is what you'd actually realize at `depthShares`.
  // Multi-leg mutex (n > 2) is depth-checked only on the first two legs,
  // flagged via `multiLeg`.
  const top = opportunities.sort((a, b) => b.roi - a.roi).slice(0, 10);
  const depths = await Promise.all(top.map(async opp => {
    if (!opp.leg1?.tokenId || !opp.leg2?.tokenId) return null;
    const [book1, book2] = await Promise.all([
      fetchBook(opp.leg1.tokenId),
      fetchBook(opp.leg2.tokenId),
    ]);
    return simulateTwoLegFill(book1, book2, 5000);
  }));
  for (let k = 0; k < top.length; k++) {
    const sim = depths[k];
    if (!sim || sim.shares <= 0) {
      top[k].depthOk = false;
      top[k].depthNote = "no fillable depth at top-of-book prices";
      continue;
    }
    top[k].depthShares = parseFloat(sim.shares.toFixed(2));
    top[k].depthCost   = parseFloat(sim.totalCost.toFixed(2));
    top[k].depthProfit = parseFloat(sim.profit.toFixed(2));
    top[k].depthRoi    = parseFloat(sim.roi.toFixed(2));
    top[k].depthOk     = sim.profit > 0.5; // arbitrary $0.50 floor of realizable profit
  }

  return { opportunities: top, status };
}

// Near-resolution scanner
async function scanNearResolution() {
  const { markets: polyMarkets, status } = await polymarketAPI.getMarkets();
  const isLive = status === "live";
  const results = [];

  for (const m of polyMarkets) {
    const prob = m.outcomePrices[0];
    const daysLeft = Math.max(1, Math.round((new Date(m.endDate) - new Date()) / 86400000));
    
    if (prob >= 0.88 && daysLeft <= 30 && daysLeft > 0) {
      // Near-resolution "harvest": buy YES near $1 and collect $1 at resolution.
      // Polymarket has no taker fee on USDC; gas on Polygon is sub-cent, so the
      // earlier `* 0.97` fee fudge is removed — `price` is just the market YES
      // price. The ROI shown is the *conditional* yield-to-resolution `(1−p)/p`
      // (return if YES wins), NOT expected ROI: at the market price, expected
      // ROI is zero by construction. Anyone using this should treat it as a
      // bond-style yield and apply their own probability adjustment for misses.
      const price = prob;
      const edge  = 0;
      const roi   = price > 0 ? ((1 - price) / price) * 100 : 0;
      results.push({
        id: m.id,
        market: m.question.length > 70 ? m.question.slice(0, 67) + "…" : m.question,
        platform: "Polymarket",
        prob: parseFloat(prob.toFixed(3)),
        price: parseFloat(price.toFixed(3)),
        edge: parseFloat(edge.toFixed(3)),
        roi: parseFloat(roi.toFixed(2)),
        daysToExpiry: daysLeft,
        liquidity: `$${((m.liquidity || 0) / 1000).toFixed(0)}K`,
        riskLevel: "low",
        category: m.category,
        apy: parseFloat((roi / daysLeft * 365).toFixed(1)),
        scannedAt: nowTs(),
        isLive,
        url1: m.slug ? `https://polymarket.com/market/${m.slug}` : null,
      });
    }
  }

  return { opportunities: results.sort((a, b) => b.roi - a.roi).slice(0, 10), status };
}

// ─── Kelly Criterion Engine ───────────────────────────────────────────────────
function calcKelly(bankroll, prob, odds, fraction = 0.25) {
  // Kelly formula: f* = (b*p - q) / b  where b = decimal odds - 1
  const b = odds - 1; // net odds (payout per unit staked minus stake)
  const q = 1 - prob;
  const fullKelly = (b * prob - q) / b;
  const fracKelly = Math.max(0, fullKelly * fraction);
  const betSize = bankroll * fracKelly;
  const expectedValue = prob * (betSize * b) - q * betSize;
  const expectedROI = betSize > 0 ? (expectedValue / betSize) * 100 : 0;
  const rrr = (prob * odds) / 1; // reward-risk ratio
  return {
    fullKelly: Math.max(0, fullKelly),
    fracKelly,
    betSize: Math.max(0, betSize),
    expectedValue: Math.max(0, expectedValue),
    expectedROI: Math.max(0, expectedROI),
    rrr,
    isPositiveEV: fullKelly > 0,
  };
}

function calcPortfolioKelly(positions, bankroll) {
  // Simplified diversified Kelly: reduce each position proportionally
  const total = positions.reduce((sum, p) => sum + p.fracKelly, 0);
  const scale = total > 0.5 ? 0.5 / total : 1; // cap total exposure at 50% of bankroll
  return positions.map(p => ({
    ...p,
    adjustedBet: p.betSize * scale,
    adjustedFraction: p.fracKelly * scale,
    scaledDown: scale < 1,
  }));
}

// ─── Sections ─────────────────────────────────────────────────────────────────

// API Feed Panel
function APIFeedSection({ onScanComplete, onPaperTrade }) {
  const [scanLoading, setScanLoading] = useState(false);
  const [crossOpps, setCrossOpps] = useState([]);
  const [nearOpps, setNearOpps] = useState([]);
  const [apiStat, setApiStat] = useState("unknown"); // "unknown" | "live" | "demo"
  const [apiLog, setApiLog] = useState([
    { ts: "09:41:22", method: "GET", endpoint: "/sampling-simplified-markets?limit=60", status: 200, ms: 187, source: "CLOB" },
    { ts: "09:41:23", method: "GET", endpoint: "/markets/{condition_id} ×60 parallel", status: 200, ms: 310, source: "CLOB" },
    { ts: "09:41:23", method: "SCAN", endpoint: "logic-arb-engine: threshold + mutex", status: "OK", ms: 12, source: "SCANNER" },
  ]);

  // Notification settings persisted in localStorage. The webhook URL is
  // optional and used for Discord/Slack/Telegram-bot-style POSTs.
  const [notif, setNotif] = useState(() => {
    try {
      const raw = localStorage.getItem("arbbot.notify");
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { desktop: false, webhookUrl: "", minRoi: 2.0 };
  });
  useEffect(() => {
    try { localStorage.setItem("arbbot.notify", JSON.stringify(notif)); } catch { /* ignore */ }
  }, [notif]);
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  // Per-opp "Execute (Paper)" busy/feedback state, keyed by opportunity id.
  const [paperBusy, setPaperBusy] = useState(null);
  const [paperMsg, setPaperMsg]   = useState(null); // { id, type: "ok" | "err", text }
  const [paperBudget, setPaperBudget] = useState(500); // USDC per paper trade

  // Request-id guard: only the latest scan is allowed to write state.
  // Prevents double-clicks and unmount-during-fetch from stomping results.
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const executePaper = async (opp) => {
    if (!onPaperTrade) return;
    setPaperBusy(opp.id);
    setPaperMsg(null);
    try {
      const fill = await snapTwoLegFill(opp, Number(paperBudget) || 500);
      if (!fill.ok) {
        setPaperMsg({ id: opp.id, type: "err", text: `Could not fill: ${fill.reason}` });
        return;
      }
      const entry = {
        id:     `paper_${opp.id}_${Date.now()}`,
        ts:     Date.now(),
        budgetUsd: Number(paperBudget) || 500,
        opp: {
          id:     opp.id,
          type:   opp.type,
          market: opp.market,
          leg1:   opp.leg1,
          leg2:   opp.leg2,
          expiry: opp.expiry,
        },
        fill,
        status: "open",
      };
      onPaperTrade(entry);
      setPaperMsg({ id: opp.id, type: "ok", text: `Recorded ${fmt(fill.shares, 1)} shares · cost ${money(fill.totalCost, 2)}` });
    } catch (e) {
      setPaperMsg({ id: opp.id, type: "err", text: String(e?.message || e) });
    } finally {
      setPaperBusy(null);
    }
  };

  const runScan = async () => {
    const myId = ++reqIdRef.current;
    setScanLoading(true);
    const start = Date.now();
    setApiLog(prev => [
      { ts: nowTs(), method: "GET", endpoint: "/sampling-simplified-markets?limit=60", status: "...", ms: null, source: "CLOB" },
      { ts: nowTs(), method: "GET", endpoint: "/markets/{condition_id} ×60 parallel", status: "...", ms: null, source: "CLOB" },
      ...prev,
    ]);

    try {
      const [crossRes, nearRes] = await Promise.all([scanLogicArb(), scanNearResolution()]);
      if (!mountedRef.current || myId !== reqIdRef.current) return;
      const elapsed = Date.now() - start;
      const status = crossRes.status || nearRes.status || "unknown";
      const cross = crossRes.opportunities || [];
      const near  = nearRes.opportunities  || [];
      setApiStat(status);
      setCrossOpps(cross);
      setNearOpps(near);
      onScanComplete?.({ cross: cross.length, near: near.length, status, opportunities: cross });
      // Fan-out notifications for opps clearing the user's ROI threshold. Best
      // effort: failures here don't break the scan.
      if (notif.desktop || notif.webhookUrl) {
        fanOutNotifications({
          desktop: notif.desktop,
          webhookUrl: notif.webhookUrl,
          minRoi: Number(notif.minRoi) || 0,
          opportunities: cross,
        });
      }
      setApiLog(prev => {
        const updated = [...prev];
        updated[0] = { ...updated[0], status: 200, ms: Math.round(elapsed * 0.55) };
        updated[1] = { ...updated[1], status: 200, ms: Math.round(elapsed * 0.65) };
        return [
          { ts: nowTs(), method: "SCAN", endpoint: `→ ${cross.length} logic arb + ${near.length} near-res opportunities`, status: "OK", ms: elapsed, source: "SCANNER" },
          ...updated,
        ].slice(0, 20);
      });
    } catch(e) {
      if (!mountedRef.current || myId !== reqIdRef.current) return;
      setApiLog(prev => [
        { ts: nowTs(), method: "ERR", endpoint: e.message, status: 500, ms: null, source: "SCANNER" },
        ...prev,
      ]);
    } finally {
      if (mountedRef.current && myId === reqIdRef.current) setScanLoading(false);
    }
  };

  const statusColor = { 200: C.green, "OK": C.green, "...": C.amber, 500: C.red };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* API Config */}
      <Card style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 14, textTransform: "uppercase" }}>API Integration Layer</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {[
            { label: "Polymarket CLOB", url: "clob.polymarket.com", status: apiStat === "live" ? "LIVE" : apiStat === "demo" ? "DEMO" : "—", color: apiStat === "live" ? C.green : apiStat === "demo" ? C.amber : C.muted },
            { label: "Sampling Markets", url: "clob.polymarket.com/sampling-simplified-markets", status: apiStat === "live" ? "ACTIVE" : "STANDBY", color: apiStat === "live" ? C.cyan : C.muted },
            { label: "Logic Arb Engine", url: "intra-platform inconsistencies", status: "ACTIVE", color: C.purple },
          ].map(api => (
            <div key={api.label} style={{ background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 5, padding: "10px 14px", flex: "1 1 180px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Dot active={api.status !== "OFF"} color={api.color} size={6} />
                <span style={{ fontSize: 11, fontWeight: 700, color: api.color, letterSpacing: "0.5px" }}>{api.status}</span>
              </div>
              <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{api.label}</div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: "IBM Plex Mono, monospace", marginTop: 2 }}>{api.url}</div>
            </div>
          ))}
        </div>

        <div style={{ background: C.bg, borderRadius: 5, padding: "12px 14px", marginBottom: 16, fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: C.muted, lineHeight: 2 }}>
          <div style={{ color: C.dim }}>// Live data via Polymarket CLOB (no auth required)</div>
          <div><span style={{ color: C.purple }}>from</span> <span style={{ color: C.blue }}>py_clob_client.client</span> <span style={{ color: C.purple }}>import</span> ClobClient</div>
          <div style={{ marginTop: 4 }}><span style={{ color: C.muted }}>poly</span> = ClobClient(<span style={{ color: C.amber }}>"https://clob.polymarket.com"</span>)</div>
          <div><span style={{ color: C.muted }}>markets</span> = poly.get_sampling_simplified_markets()</div>
          <div style={{ marginTop: 4 }}><span style={{ color: C.dim }}>// Scans {"{"}limit{"}"} active markets for threshold &amp; mutex violations</span></div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={runScan} disabled={scanLoading} style={{
            background: scanLoading ? "none" : C.blueDim, border: `1px solid ${scanLoading ? C.border : C.blue}66`,
            color: scanLoading ? C.muted : C.blue, padding: "8px 18px", borderRadius: 4,
            fontSize: 12, fontWeight: 700, cursor: scanLoading ? "default" : "pointer",
            fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.4px", transition: "all 0.15s",
          }}>
            {scanLoading ? <span>SCANNING <Blink color={C.blue} /></span> : "▸ RUN SCAN NOW"}
          </button>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: "IBM Plex Mono, monospace", marginLeft: 8 }}>PAPER BUDGET</span>
          <input type="number" min="50" max="50000" step="50" value={paperBudget}
            onChange={e => setPaperBudget(parseFloat(e.target.value) || 0)}
            title="USDC notional used by Execute (Paper) per click"
            style={{ width: 100, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, padding: "7px 10px", fontSize: 12, outline: "none", fontFamily: "IBM Plex Mono, monospace" }} />
        </div>
      </Card>

      {/* Notifications */}
      <Card style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 14, textTransform: "uppercase" }}>Notifications</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>BROWSER ALERTS</div>
            <button onClick={async () => {
              const p = await requestNotificationPermission();
              setNotifPerm(p);
              if (p === "granted") setNotif(n => ({ ...n, desktop: true }));
            }} style={{
              background: notifPerm === "granted" && notif.desktop ? C.greenDim : C.surface3,
              border: `1px solid ${notifPerm === "granted" && notif.desktop ? C.green : C.border}66`,
              color: notifPerm === "granted" && notif.desktop ? C.green : C.muted,
              padding: "7px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer",
              fontFamily: "IBM Plex Mono, monospace", height: 35,
            }}>{
              notifPerm === "unsupported" ? "UNSUPPORTED" :
              notifPerm === "denied"      ? "BLOCKED"     :
              notif.desktop && notifPerm === "granted" ? "✓ ON" :
              "ENABLE"
            }</button>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>MIN ROI %</div>
            <input type="number" step="0.5" min="0" max="100" value={notif.minRoi}
              onChange={e => setNotif(n => ({ ...n, minRoi: parseFloat(e.target.value) || 0 }))}
              style={{ width: 80, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.green, padding: "7px 10px", fontSize: 12, outline: "none", fontFamily: "IBM Plex Mono, monospace", boxSizing: "border-box", height: 35 }} />
          </div>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>WEBHOOK URL (optional — Discord/Slack/Telegram bot)</div>
            <input type="url" value={notif.webhookUrl} placeholder="https://discord.com/api/webhooks/…"
              onChange={e => setNotif(n => ({ ...n, webhookUrl: e.target.value }))}
              style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "7px 10px", fontSize: 12, outline: "none", fontFamily: "IBM Plex Mono, monospace", boxSizing: "border-box", height: 35 }} />
          </div>
          <button onClick={async () => {
            notifyDesktop("Arb bot test", "If you can see this, browser notifications are wired up.");
            if (notif.webhookUrl) await notifyWebhook(notif.webhookUrl, { content: "Arb bot test ping — webhook OK" });
          }} style={{
            background: C.surface3, border: `1px solid ${C.border}`, color: C.muted,
            padding: "7px 14px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer",
            fontFamily: "IBM Plex Mono, monospace", height: 35,
          }}>TEST</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: C.dim, fontStyle: "italic" }}>
          Fires on every successful scan. Only opportunities with depth-checked ROI ≥ Min ROI are sent.
        </div>
      </Card>

      {/* Scan Results */}
      {(crossOpps.length > 0 || nearOpps.length > 0) && (
        <Card style={{ padding: "16px 20px" }} accent={C.green}>
          <div style={{ fontSize: 11, color: C.green, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 14 }}>
            SCAN RESULTS — {crossOpps.length} LOGIC ARB + {nearOpps.length} NEAR-RES OPPORTUNITIES
          </div>
          {crossOpps.slice(0, 3).map(opp => (
            <div key={opp.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "10px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: 4 }}>
                    <Tag label={opp.type === "THRESH" ? "THRESHOLD" : opp.type === "DOMINANCE" ? "DOMINANCE" : "MUTEX"} color={opp.type === "THRESH" ? C.blue : opp.type === "DOMINANCE" ? C.cyan : C.purple} size="xs" />
                    {opp.isLive && <Tag label="LIVE" color={C.green} size="xs" style={{ marginLeft: 4 }} />}
                    {opp.depthOk === false && <Tag label="THIN BOOK" color={C.red} size="xs" style={{ marginLeft: 4 }} />}
                    {opp.multiLeg && <Tag label="MULTI-LEG" color={C.amber} size="xs" style={{ marginLeft: 4 }} />}
                    <span style={{ color: C.text, fontSize: 12, marginLeft: 8, fontWeight: 600 }}>{opp.market}</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: "IBM Plex Mono, monospace", marginTop: 2 }}>
                    Leg 1: {opp.leg1?.label} · Leg 2: {opp.leg2?.label}
                  </div>
                  {opp.rationale && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{opp.rationale}</div>}
                  {opp.depthShares != null && (
                    <div style={{ fontSize: 10, color: opp.depthOk ? C.cyan : C.red, fontFamily: "IBM Plex Mono, monospace", marginTop: 2 }}>
                      Depth: max {opp.depthShares} pairs · realized cost ${opp.depthCost} · profit ${opp.depthProfit} · ROI {opp.depthRoi}%
                    </div>
                  )}
                  {opp.depthNote && (
                    <div style={{ fontSize: 10, color: C.red, fontFamily: "IBM Plex Mono, monospace", marginTop: 2 }}>
                      Depth: {opp.depthNote}
                    </div>
                  )}
                  <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {opp.url1 && <a href={opp.url1} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: C.blue, textDecoration: "none", fontFamily: "IBM Plex Mono, monospace" }}>→ Leg 1 on Polymarket ↗</a>}
                    {opp.url2 && <a href={opp.url2} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: C.blue, textDecoration: "none", fontFamily: "IBM Plex Mono, monospace" }}>→ Leg 2 on Polymarket ↗</a>}
                    <button onClick={() => executePaper(opp)} disabled={paperBusy === opp.id || !opp.leg1?.tokenId || !opp.leg2?.tokenId} style={{
                      background: opp.depthOk === false ? C.redDim : C.amberDim,
                      border: `1px solid ${opp.depthOk === false ? C.red : C.amber}66`,
                      color: opp.depthOk === false ? C.red : C.amber,
                      padding: "3px 10px", borderRadius: 3, fontSize: 10, fontWeight: 700,
                      cursor: (paperBusy === opp.id || !opp.leg1?.tokenId) ? "default" : "pointer",
                      fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.3px",
                    }}>{paperBusy === opp.id ? "FILLING…" : opp.depthOk === false ? "✎ RECORD LOSS (PAPER)" : "✎ EXECUTE (PAPER)"}</button>
                    {paperMsg && paperMsg.id === opp.id && (
                      <span style={{ fontSize: 10, color: paperMsg.type === "ok" ? C.green : C.red, fontFamily: "IBM Plex Mono, monospace" }}>
                        {paperMsg.type === "ok" ? "✓ " : "✗ "}{paperMsg.text}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <MetricMini label="Top-Cost" value={money(opp.cost)} color={C.amber} />
                  <MetricMini label="Top-ROI" value={`+${opp.roi}%`} color={C.green} />
                  <MetricMini label="APY" value={`${opp.apy}%`} color={C.purple} />
                  <MetricMini label="Days" value={opp.daysToExpiry} color={C.muted} />
                </div>
              </div>
            </div>
          ))}
          {nearOpps.slice(0, 2).map(opp => (
            <div key={opp.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <Tag label="NEAR-RES" color={C.green} size="xs" />
                <span style={{ color: C.text, fontSize: 12, marginLeft: 8 }}>{opp.market.slice(0, 55)}...</span>
                {opp.url1 && <div style={{ marginTop: 4 }}><a href={opp.url1} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: C.blue, textDecoration: "none", fontFamily: "IBM Plex Mono, monospace" }}>→ View on Polymarket ↗</a></div>}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <MetricMini label="Price" value={pct(opp.price)} color={C.amber} />
                <MetricMini label="Yield (if YES)" value={`+${opp.roi}%`} color={C.green} />
                <MetricMini label="Days" value={opp.daysToExpiry} color={C.muted} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* API Request Log */}
      <Card style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 12 }}>API REQUEST LOG</div>
        <div style={{ background: C.bg, borderRadius: 4, padding: "10px 0", maxHeight: 180, overflowY: "auto", fontFamily: "IBM Plex Mono, monospace", fontSize: 11 }}>
          {apiLog.map((req, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "3px 12px", alignItems: "center", borderBottom: `1px solid ${C.border}22` }}>
              <span style={{ color: C.dim, minWidth: 60 }}>{req.ts}</span>
              <Tag label={req.source} color={req.source === "Polymarket" ? C.purple : req.source === "CLOB" ? C.cyan : req.source === "SCANNER" ? C.green : C.muted} size="xs" />
              <span style={{ color: req.method === "GET" ? C.cyan : req.method === "ERR" ? C.red : C.amber, minWidth: 40 }}>{req.method}</span>
              <span style={{ color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.endpoint}</span>
              <span style={{ color: statusColor[req.status] || C.amber, minWidth: 30 }}>{req.status}</span>
              {req.ms && <span style={{ color: C.dim, minWidth: 50 }}>{req.ms}ms</span>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// Kelly Calculator Section
function KellySection() {
  const [bankroll, setBankroll] = useState(5000);
  const [fraction, setFraction] = useState(0.25);
  const [positions, setPositions] = useState([
    { id: 1, label: "BTC >$80K Apr 1 (Near-Res)", prob: 0.94, odds: 1.099, type: "NEAR_RES" },
    { id: 2, label: "CPI <3.5% Mar (Near-Res)", prob: 0.97, odds: 1.053, type: "NEAR_RES" },
    { id: 3, label: "Fed Cut Jun (Logic Arb)",   prob: 0.62, odds: 2.10,  type: "LOGIC_ARB" },
  ]);
  const [newPos, setNewPos] = useState({ label: "", prob: "", odds: "", type: "LOGIC_ARB" });
  const [showAdd, setShowAdd] = useState(false);

  const kellyResults = useMemo(() => {
    return positions.map(p => ({
      ...p,
      ...calcKelly(bankroll, p.prob, p.odds, fraction),
    }));
  }, [positions, bankroll, fraction]);

  const portfolioResults = useMemo(() => calcPortfolioKelly(kellyResults, bankroll), [kellyResults, bankroll]);

  const totalExposure = portfolioResults.reduce((s, p) => s + p.adjustedBet, 0);
  const totalEV = portfolioResults.reduce((s, p) => s + p.expectedValue, 0);

  const addPosition = () => {
    if (!newPos.label || !newPos.prob || !newPos.odds) return;
    setPositions(prev => [...prev, { id: Date.now(), ...newPos, prob: parseFloat(newPos.prob), odds: parseFloat(newPos.odds) }]);
    setNewPos({ label: "", prob: "", odds: "", type: "LOGIC_ARB" });
    setShowAdd(false);
  };

  const removePosition = (id) => setPositions(prev => prev.filter(p => p.id !== id));

  const SliderRow = ({ label, value, min, max, step, onChange, display, color = C.text }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
        <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 14, fontWeight: 700, color }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: C.amber, cursor: "pointer" }} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Explainer */}
      <Card style={{ padding: "16px 20px" }} accent={C.amber}>
        <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 8 }}>◆ KELLY CRITERION — OPTIMAL POSITION SIZING</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
          <span style={{ fontFamily: "IBM Plex Mono, monospace", color: C.text }}>f* = (b·p − q) / b</span>
          {"  "}where <span style={{ color: C.cyan }}>b</span> = net odds,{" "}
          <span style={{ color: C.green }}>p</span> = win probability,{" "}
          <span style={{ color: C.red }}>q</span> = loss probability.<br />
          Using <span style={{ color: C.amber }}>Fractional Kelly</span> (¼ Kelly) to reduce variance and risk of ruin. Portfolio Kelly scales each position to keep total exposure ≤ 50% of bankroll.
        </div>
      </Card>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Controls */}
        <Card style={{ padding: "20px", flex: "1 1 260px" }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 16 }}>PARAMETERS</div>
          <SliderRow label="Bankroll" value={bankroll} min={500} max={50000} step={500}
            onChange={setBankroll} display={`$${bankroll.toLocaleString()}`} color={C.amber} />
          <SliderRow label="Kelly Fraction" value={fraction} min={0.1} max={1} step={0.05}
            onChange={setFraction}
            display={fraction === 1 ? "Full Kelly ⚠" : fraction >= 0.5 ? `½ Kelly (${(fraction*100).toFixed(0)}%)` : `¼ Kelly (${(fraction*100).toFixed(0)}%)`}
            color={fraction > 0.5 ? C.red : C.green} />

          {fraction > 0.5 && (
            <div style={{ background: C.redDim, border: `1px solid ${C.red}44`, borderRadius: 4, padding: "8px 12px", fontSize: 11, color: C.red, marginTop: -8, marginBottom: 12 }}>
              ⚠ High Kelly fraction increases risk of ruin. ¼ Kelly recommended.
            </div>
          )}

          {/* Portfolio summary */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 4 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                ["Total Deployed", money(totalExposure, 0), C.amber],
                ["% Bankroll", `${(totalExposure / bankroll * 100).toFixed(1)}%`, totalExposure / bankroll > 0.5 ? C.red : C.green],
                ["Expected Value", money(totalEV, 2), C.green],
              ].map(([l, v, c]) => (
                <div key={l} style={{ flex: "1 1 80px" }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: c, fontFamily: "IBM Plex Mono, monospace" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Risk of Ruin visual */}
        <Card style={{ padding: "20px", flex: "1 1 200px" }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 16 }}>RISK OF RUIN BANDS</div>
          {[
            { label: "¼ Kelly", f: 0.25, ror: "< 0.1%", color: C.green },
            { label: "½ Kelly", f: 0.5,  ror: "~1.5%",  color: C.amber },
            { label: "Full Kelly", f: 1.0, ror: "~13%",  color: C.red },
            { label: "2× Kelly",  f: 2.0, ror: "~100%", color: C.red },
          ].map(band => (
            <div key={band.f} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: fraction === band.f ? band.color + "18" : "none",
              border: `1px solid ${fraction === band.f ? band.color + "44" : "transparent"}`,
              borderRadius: 4, padding: "6px 10px", marginBottom: 6,
              transition: "all 0.2s",
            }}>
              <span style={{ fontSize: 12, color: fraction === band.f ? band.color : C.muted, fontWeight: fraction === band.f ? 700 : 400 }}>{band.label}</span>
              <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, color: band.color }}>RoR: {band.ror}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
            Risk of Ruin = probability of losing entire bankroll over long run. ¼ Kelly maximises geometric growth rate while keeping RoR near zero.
          </div>
        </Card>
      </div>

      {/* Position Table */}
      <Card style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px" }}>POSITIONS & SIZING</div>
          <button onClick={() => setShowAdd(p => !p)} style={{
            background: C.amberDim, border: `1px solid ${C.amber}44`, color: C.amber,
            padding: "5px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>+ ADD POSITION</button>
        </div>

        {showAdd && (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "14px 16px", marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>MARKET LABEL</div>
              <input value={newPos.label} onChange={e => setNewPos(p => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Fed Cut Jun 2026" style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "7px 10px", fontSize: 12, boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>WIN PROB (0–1)</div>
              <input value={newPos.prob} onChange={e => setNewPos(p => ({ ...p, prob: e.target.value }))}
                placeholder="0.94" style={{ width: 90, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.green, padding: "7px 10px", fontSize: 12, outline: "none", fontFamily: "IBM Plex Mono, monospace" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>DECIMAL ODDS</div>
              <input value={newPos.odds} onChange={e => setNewPos(p => ({ ...p, odds: e.target.value }))}
                placeholder="1.099" style={{ width: 90, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, padding: "7px 10px", fontSize: 12, outline: "none", fontFamily: "IBM Plex Mono, monospace" }} />
            </div>
            <select value={newPos.type} onChange={e => setNewPos(p => ({ ...p, type: e.target.value }))}
              style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, padding: "7px 10px", borderRadius: 4, fontSize: 12, height: 35 }}>
              <option value="LOGIC_ARB">Logic Arb</option>
              <option value="NEAR_RES">Near-Resolution</option>
              <option value="LOGIC">Other</option>
            </select>
            <button onClick={addPosition} style={{
              background: C.greenDim, border: `1px solid ${C.green}44`, color: C.green,
              padding: "7px 14px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", height: 35,
            }}>ADD</button>
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Type", "Market", "Prob", "Odds", "Full Kelly", "¼ Kelly", "Bet Size", "Adj. Bet", "EV", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolioResults.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: "10px 10px" }}><Tag label={p.type.replace("_","-")} color={TYPE_COLOR[p.type] || C.text} size="xs" /></td>
                  <td style={{ padding: "10px 10px", color: C.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</td>
                  <td style={{ padding: "10px 10px", color: C.green, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700 }}>{pct(p.prob)}</td>
                  <td style={{ padding: "10px 10px", color: C.amber, fontFamily: "IBM Plex Mono, monospace" }}>{fmt(p.odds, 3)}×</td>
                  <td style={{ padding: "10px 10px", color: C.text, fontFamily: "IBM Plex Mono, monospace" }}>{pct(p.fullKelly)}</td>
                  <td style={{ padding: "10px 10px", color: p.isPositiveEV ? C.amber : C.red, fontFamily: "IBM Plex Mono, monospace" }}>{pct(p.fracKelly)}</td>
                  <td style={{ padding: "10px 10px", color: C.amber, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700 }}>{money(p.betSize, 0)}</td>
                  <td style={{ padding: "10px 10px", color: p.scaledDown ? C.amber : C.green, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700 }}>
                    {money(p.adjustedBet, 0)}{p.scaledDown && <span style={{ color: C.amber, fontSize: 9, marginLeft: 3 }}>↓</span>}
                  </td>
                  <td style={{ padding: "10px 10px", color: p.expectedValue > 0 ? C.green : C.red, fontFamily: "IBM Plex Mono, monospace" }}>+{money(p.expectedValue, 2)}</td>
                  <td style={{ padding: "10px 10px" }}>
                    <button onClick={() => removePosition(p.id)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {portfolioResults.some(p => p.scaledDown) && (
          <div style={{ marginTop: 12, fontSize: 11, color: C.amber, fontStyle: "italic" }}>
            ↓ Some positions scaled down by portfolio Kelly to keep total exposure ≤ 50% of bankroll.
          </div>
        )}
      </Card>
    </div>
  );
}

// CLAUDE.md Generator
const CLAUDE_MD_TEMPLATE = (config) => `# CLAUDE.md — Polymarket Arbitrage Bot

## Project Overview
Intra-Polymarket arbitrage scanner. Looks for two classes of price
inconsistency on Polymarket alone: (1) threshold-monotonicity violations
(e.g. P("BTC > $100k") > P("BTC > $80k")) and (2) mutual-exclusivity
overcounts within an event group. Also surfaces near-resolution YES
contracts as bond-style yields. Built and operated via Claude Code.

## Architecture
\`\`\`
├── scanner/
│   ├── near_resolution.py    # High-prob near-expiry harvest scanner
│   ├── logic_arb.py          # Threshold + mutex inconsistency detector
│   └── ws_feed.py            # Polymarket WebSocket price feed listener
├── execution/
│   ├── poly_client.py        # py-clob-client wrapper
│   ├── order_manager.py      # FOK/IOC order placement
│   └── position_tracker.py   # Open position + P&L tracking
├── risk/
│   ├── kelly.py              # Kelly criterion sizing engine
│   ├── portfolio.py          # Portfolio-level exposure management
│   └── safeguards.py         # Hard stop-loss, max drawdown, orphan detection
├── monitoring/
│   ├── telegram_alerts.py    # Trade alerts + P&L reports
│   └── dashboard.py          # Local web dashboard
├── CLAUDE.md                 # This file
└── main.py                   # Entry point
\`\`\`

## Safety Rules (NEVER VIOLATE)
- **Max single position:** ${config.maxSingleBet}% of bankroll
- **Max total exposure:** ${config.maxTotalExposure}% of bankroll at any time
- **Stop-loss:** Halt all trading if daily drawdown exceeds ${config.maxDrawdown}%
- **No orphan legs:** Never place one leg of a multi-leg arb without the other
  - If leg 2 fails, immediately unwind leg 1
  - Use atomic execution with rollback logic
- **Minimum edge:** Only trade if net spread > ${config.minEdge}% after estimated fees
- **Liquidity gate:** Only trade markets with >${config.minLiquidity} liquidity
- **Resolution verification:** Read each market's resolution criteria
  before sizing into it for the first time

## Kelly Criterion Configuration
- Fraction: ${config.kellyFraction} (¼ Kelly)
- Max single bet: ${config.maxSingleBet}% of bankroll
- Portfolio scaling: Yes (cap total at ${config.maxTotalExposure}%)
- Recalculate sizing on each scan
- Note: Kelly is for directional/value bets. True risk-free arbs (sum of
  leg costs < $1) should be sized by liquidity, not Kelly.

## Strategy Priority
1. **Logic Arb (Threshold)** — guaranteed profit at resolution, execute first
2. **Logic Arb (Mutex)** — guaranteed profit at resolution, requires event-group confirmation
3. **Near-Resolution Yield** — bond-style yield, no real edge unless you have a probability view

## Loop Command
Run this command in Claude Code to start the scanner loop:
\`\`\`
/loop every 5 minutes:
  python scanner/logic_arb.py
  python scanner/near_resolution.py
  If opportunities found: python execution/order_manager.py --execute
  python monitoring/telegram_alerts.py --summary
\`\`\`

## API Keys Required
\`\`\`bash
POLYMARKET_PRIVATE_KEY=    # Polygon wallet private key
POLYMARKET_API_KEY=        # From clob.polymarket.com
POLYMARKET_API_SECRET=
POLYMARKET_API_PASSPHRASE=
TELEGRAM_BOT_TOKEN=        # Optional: trade alerts
TELEGRAM_CHAT_ID=
\`\`\`

## Dependencies
\`\`\`bash
pip install py-clob-client python-telegram-bot websockets aiohttp pandas
\`\`\`

## Multi-Agent Workflow (Claude Code)
When building complex features, spawn subagents:
- **Quant agent:** "Review kelly.py and verify the math is correct"
- **Risk agent:** "Audit safeguards.py for any gaps in the orphan detection logic"
- **API agent:** "Debug the Polymarket CLOB auth flow in poly_client.py"

## Current Bankroll: $${config.bankroll.toLocaleString()}
## Current Kelly Fraction: ${config.kellyFraction}
## Min Edge Threshold: ${config.minEdge}%
## Scan Interval: ${config.scanInterval} minutes
`;

function ClaudeMdSection() {
  const [config, setConfig] = useState({
    bankroll: 5000,
    kellyFraction: 0.25,
    maxSingleBet: 10,
    maxTotalExposure: 50,
    maxDrawdown: 15,
    minEdge: 2,
    minLiquidity: 5000,
    scanInterval: 5,
  });
  const [copied, setCopied] = useState(false);

  const md = CLAUDE_MD_TEMPLATE(config);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const Field = ({ label, field, min, max, step = 1, prefix = "", suffix = "", color = C.amber }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
        <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, color, fontWeight: 700 }}>
          {prefix}{typeof config[field] === "number" && config[field] < 1 && step < 1 ? config[field] : config[field]}{suffix}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={config[field]}
        onChange={e => setConfig(p => ({ ...p, [field]: parseFloat(e.target.value) }))}
        style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ padding: "16px 20px" }} accent={C.purple}>
        <div style={{ fontSize: 11, color: C.purple, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 6 }}>⧫ CLAUDE.md GENERATOR</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          CLAUDE.md is the file Claude Code reads at the start of every session. It defines project structure, safety rules, loop commands, and operating parameters. Configure below, then copy into your project root.
        </div>
      </Card>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Card style={{ padding: "20px", flex: "1 1 240px" }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 16 }}>CONFIGURE PARAMETERS</div>
          <Field label="Starting Bankroll" field="bankroll" min={500} max={100000} step={500} prefix="$" />
          <Field label="Kelly Fraction" field="kellyFraction" min={0.1} max={1} step={0.05} suffix="×" />
          <Field label="Max Single Bet" field="maxSingleBet" min={1} max={25} step={1} suffix="% bankroll" />
          <Field label="Max Total Exposure" field="maxTotalExposure" min={10} max={75} step={5} suffix="% bankroll" />
          <Field label="Daily Stop-Loss" field="maxDrawdown" min={5} max={30} step={1} suffix="%" color={C.red} />
          <Field label="Minimum Edge" field="minEdge" min={1} max={10} step={0.5} suffix="%" color={C.green} />
          <Field label="Min Liquidity" field="minLiquidity" min={1000} max={50000} step={1000} prefix="$" />
          <Field label="Scan Interval" field="scanInterval" min={1} max={30} step={1} suffix=" min" color={C.cyan} />
        </Card>

        {/* Preview */}
        <div style={{ flex: "2 1 400px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px" }}>PREVIEW — CLAUDE.md</div>
            <button onClick={copyToClipboard} style={{
              background: copied ? C.greenDim : C.purpleDim,
              border: `1px solid ${copied ? C.green : C.purple}44`,
              color: copied ? C.green : C.purple,
              padding: "6px 16px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer",
              fontFamily: "IBM Plex Mono, monospace", transition: "all 0.2s",
            }}>{copied ? "✓ COPIED" : "COPY CLAUDE.md"}</button>
          </div>
          <div style={{
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: "16px", overflowY: "auto", maxHeight: 520,
            fontFamily: "IBM Plex Mono, monospace", fontSize: 11, lineHeight: 1.8, color: C.muted,
          }}>
            {md.split("\n").map((line, i) => {
              let color = C.muted;
              if (line.startsWith("# ")) color = C.text;
              else if (line.startsWith("## ")) color = C.purple;
              else if (line.startsWith("### ")) color = C.cyan;
              else if (line.startsWith("- **")) color = C.amber;
              else if (line.startsWith("```")) color = C.dim;
              else if (line.match(/^[A-Z_]+=\s*$/)) color = C.green;
              return <div key={i} style={{ color, minHeight: "1.2em" }}>{line || " "}</div>;
            })}
          </div>
        </div>
      </div>

      {/* Quick start steps */}
      <Card style={{ padding: "20px" }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 16 }}>CLAUDE CODE QUICK START</div>
        {[
          { n: "1", title: "Save CLAUDE.md", desc: "Copy the generated CLAUDE.md into your project root. Claude Code reads this automatically.", color: C.purple },
          { n: "2", title: "Scaffold project", desc: "Open Claude Code and say: \"Read CLAUDE.md and scaffold the full project structure, then install dependencies.\"", color: C.blue },
          { n: "3", title: "Configure API keys", desc: "Add your Polymarket private key (Polygon wallet) and CLOB API credentials to .env", color: C.amber },
          { n: "4", title: "Run in dry-run first", desc: "Run the scanner read-only and verify opportunities by hand on polymarket.com before risking real capital.", color: C.green },
          { n: "5", title: "Start the loop", desc: `In Claude Code terminal: /loop — scans every ${config.scanInterval} minutes. Claude reviews opportunities and executes when criteria met.`, color: C.cyan },
        ].map(step => (
          <div key={step.n} style={{ display: "flex", gap: 14, marginBottom: 14, alignItems: "flex-start" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: step.color + "22", border: `1px solid ${step.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: step.color, flexShrink: 0 }}>{step.n}</div>
            <div>
              <div style={{ color: C.text, fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{step.title}</div>
              <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>{step.desc}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── Paper-Trade Journal (Phase 2) ────────────────────────────────────────────
// Records hypothetical fills and tracks them over time. Persisted in
// localStorage under `arbbot.paper`. Each entry: { id, ts, opp, fill, status }.
// Status is "open" until manually closed. Closing snaps the current orderbook
// and computes realized P&L vs the recorded entry cost. Capital is fictional —
// no funds move, no orders are placed on Polymarket. This is the validation
// step before any real-money execution gets wired in Phase 3.
const PAPER_KEY = "arbbot.paper";

function loadPaperJournal() {
  try { return JSON.parse(localStorage.getItem(PAPER_KEY) || "[]"); }
  catch { return []; }
}
function savePaperJournal(entries) {
  try { localStorage.setItem(PAPER_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}

// Snap the live orderbook for both legs and compute the realized fill at
// `budgetUsd`. Used both for "open paper trade" and "close paper trade".
// Uses the budget-bound simulator (not the strict arb-only one) so that
// losing trades still get recorded in the journal.
async function snapTwoLegFill(opp, budgetUsd) {
  if (!opp?.leg1?.tokenId || !opp?.leg2?.tokenId) {
    return { ok: false, reason: "missing token IDs" };
  }
  const [b1, b2] = await Promise.all([fetchBook(opp.leg1.tokenId), fetchBook(opp.leg2.tokenId)]);
  if (b1 == null) return { ok: false, reason: "could not fetch leg 1 orderbook (network or stale token id)" };
  if (b2 == null) return { ok: false, reason: "could not fetch leg 2 orderbook (network or stale token id)" };
  if (!b1.asks?.length) return { ok: false, reason: "leg 1 has no asks — book is empty on the buy side" };
  if (!b2.asks?.length) return { ok: false, reason: "leg 2 has no asks — book is empty on the buy side" };
  const sim = simulateBudgetFill(b1, b2, budgetUsd);
  if (!sim || sim.shares <= 0) return { ok: false, reason: "books are empty above the budget cap" };
  return {
    ok: true,
    shares:    sim.shares,
    cost1:     sim.cost1,
    cost2:     sim.cost2,
    totalCost: sim.totalCost,
    avgPrice1: sim.avgPrice1,
    avgPrice2: sim.avgPrice2,
    profit:    sim.profit,
    roi:       sim.roi,
    wasProfitableAtFill: sim.profit > 0,
    snapTs:    Date.now(),
  };
}

function PaperTradeSection({ journal, setJournal }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError]   = useState("");

  const closeTrade = async (entry) => {
    setBusyId(entry.id);
    setError("");
    try {
      // Re-snap the orderbooks now to estimate "what could I sell into right
      // now?" — actually for a closing paper trade what we want is "if I sat
      // out till resolution, what's the payout?" or "if I close now at the
      // current bid, what do I realize?" For a paper journal v1 the simplest
      // honest thing is: use the current YES price of each leg as mark.
      const [b1, b2] = await Promise.all([fetchBook(entry.opp.leg1.tokenId), fetchBook(entry.opp.leg2.tokenId)]);
      const bestBid1 = b1?.bids?.[0]?.price ?? null;
      const bestBid2 = b2?.bids?.[0]?.price ?? null;
      const bestAsk1 = b1?.asks?.[0]?.price ?? null;
      const bestAsk2 = b2?.asks?.[0]?.price ?? null;
      // Close at the current best-bid on each leg if both books have bids.
      // Otherwise assume hold-to-expiry: in a true two-leg arb exactly one leg
      // pays $1 and the other $0, so the per-pair payout is $1.
      const haveBoth = bestBid1 != null && bestBid2 != null;
      const realizedAt = haveBoth
        ? entry.fill.shares * (bestBid1 + bestBid2)
        : entry.fill.shares;
      const closeNote = haveBoth
        ? `Closed at best-bid: ${(bestBid1 * 100).toFixed(1)}¢ / ${(bestBid2 * 100).toFixed(1)}¢`
        : "Closed at expiry assumption ($1 per pair)";
      const realizedPnl = realizedAt - entry.fill.totalCost;
      setJournal(j => j.map(e => e.id === entry.id ? {
        ...e,
        status: "closed",
        closedTs: Date.now(),
        closedAt: { bestBid1, bestBid2, bestAsk1, bestAsk2 },
        realizedAt: parseFloat(realizedAt.toFixed(2)),
        realizedPnl: parseFloat(realizedPnl.toFixed(2)),
        closeNote,
      } : e));
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const removeTrade = (id) => setJournal(j => j.filter(e => e.id !== id));
  const clearAll = () => setJournal([]);

  const totalOpen   = journal.filter(e => e.status === "open").reduce((s, e) => s + e.fill.totalCost, 0);
  const totalClosed = journal.filter(e => e.status === "closed").reduce((s, e) => s + (e.realizedPnl || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ padding: "16px 20px" }} accent={C.amber}>
        <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 8 }}>✎ PAPER TRADING</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          No funds move. Each "Execute (Paper)" button on the Scanner tab snaps the live Polymarket orderbooks, computes the realistic fill at a chosen size, and records the entry here. Close trades manually to mark them against current best-bids. Use this for a few days/weeks before turning on real execution in Phase 3.
        </div>
      </Card>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          ["Open notional", money(totalOpen, 0), C.amber],
          ["Closed P&L",    `${totalClosed >= 0 ? "+" : ""}${money(totalClosed, 2)}`, totalClosed >= 0 ? C.green : C.red],
          ["Open trades",   journal.filter(e => e.status === "open").length.toString(), C.cyan],
          ["Closed trades", journal.filter(e => e.status === "closed").length.toString(), C.muted],
        ].map(([l, v, c]) => (
          <Card key={l} style={{ padding: "14px 18px", flex: "1 1 140px" }}>
            <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c, fontFamily: "IBM Plex Mono, monospace" }}>{v}</div>
          </Card>
        ))}
      </div>

      <Card style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px" }}>JOURNAL</div>
          {journal.length > 0 && (
            <button onClick={clearAll} style={{
              background: C.redDim, border: `1px solid ${C.red}44`, color: C.red,
              padding: "5px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>CLEAR ALL</button>
          )}
        </div>
        {error && (
          <div style={{ marginBottom: 10, padding: "8px 12px", background: C.redDim, border: `1px solid ${C.red}44`, borderRadius: 4, fontSize: 11, color: C.red, fontFamily: "IBM Plex Mono, monospace" }}>
            {error}
          </div>
        )}
        {journal.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>
            No paper trades yet. Run a scan, then click "Execute (Paper)" on an opportunity card.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Status", "When", "Type", "Market", "Shares", "Cost", "Realized", "P&L", ""].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {journal.slice().reverse().map(e => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                      <Tag label={e.status.toUpperCase()} color={e.status === "open" ? C.cyan : C.muted} size="xs" />
                      {e.fill?.wasProfitableAtFill != null && (
                        <span title={e.fill.wasProfitableAtFill ? "Profitable arb at fill time" : "Recorded loss — fill cost > $1 per pair"}
                              style={{
                                marginLeft: 6,
                                color: e.fill.wasProfitableAtFill ? C.green : C.red,
                                fontFamily: "IBM Plex Mono, monospace",
                                fontWeight: 700,
                                fontSize: 11,
                              }}>{e.fill.wasProfitableAtFill ? "✓" : "✗"}</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 10px", color: C.dim, fontFamily: "IBM Plex Mono, monospace", whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleString()}</td>
                    <td style={{ padding: "10px 10px" }}><Tag label={e.opp.type} color={C.purple} size="xs" /></td>
                    <td style={{ padding: "10px 10px", color: C.text, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.opp.market}</td>
                    <td style={{ padding: "10px 10px", color: C.text, fontFamily: "IBM Plex Mono, monospace" }}>{fmt(e.fill.shares, 1)}</td>
                    <td style={{ padding: "10px 10px", color: C.amber, fontFamily: "IBM Plex Mono, monospace" }}>{money(e.fill.totalCost, 2)}</td>
                    <td style={{ padding: "10px 10px", color: C.muted, fontFamily: "IBM Plex Mono, monospace" }}>{e.realizedAt != null ? money(e.realizedAt, 2) : "—"}</td>
                    <td style={{ padding: "10px 10px", color: e.realizedPnl > 0 ? C.green : e.realizedPnl < 0 ? C.red : C.muted, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700 }}>
                      {e.realizedPnl != null ? `${e.realizedPnl >= 0 ? "+" : ""}${money(e.realizedPnl, 2)}` : "—"}
                    </td>
                    <td style={{ padding: "10px 10px", display: "flex", gap: 6 }}>
                      {e.status === "open" && (
                        <button onClick={() => closeTrade(e)} disabled={busyId === e.id} style={{
                          background: C.amberDim, border: `1px solid ${C.amber}44`, color: C.amber,
                          padding: "4px 10px", borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: "pointer",
                        }}>{busyId === e.id ? "…" : "CLOSE"}</button>
                      )}
                      <button onClick={() => removeTrade(e.id)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Backtest Section ─────────────────────────────────────────────────────────
// Pulls /prices-history for both legs of a detected opportunity and replays
// the arb check at every historical sample to show how often the same edge
// existed in the past. The current scanner has known limitations (top-60
// markets sample, threshold heuristics, hand-curated dominance rules) — the
// backtest is the only honest way to know whether it ever fires for real.
function BacktestSection({ opps }) {
  const [selectedId, setSelectedId] = useState(opps[0]?.id || "");
  useEffect(() => { if (!selectedId && opps[0]) setSelectedId(opps[0].id); }, [opps, selectedId]);
  const opp = opps.find(o => o.id === selectedId) || opps[0] || null;
  const [historyRange, setHistoryRange] = useState("1m");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState("");

  const run = async () => {
    if (!opp?.leg1?.tokenId || !opp?.leg2?.tokenId) {
      setError("Selected opportunity has no token IDs (likely loaded from fallback demo data).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const [h1, h2] = await Promise.all([
        fetchPricesHistory(opp.leg1.tokenId, { interval: historyRange, fidelity: 60 }),
        fetchPricesHistory(opp.leg2.tokenId, { interval: historyRange, fidelity: 60 }),
      ]);
      if (!h1 || !h2 || !h1.length || !h2.length) {
        setError("Polymarket returned empty history for one or both legs.");
        setResult(null);
      } else {
        // For THRESH/MUTEX/DOMINANCE opps the "leg2 NO" price is captured as
        // (1 - yesPrice). The history endpoint always returns the YES (or
        // tracked-side) price, so we have to translate. tokenId on each leg
        // is already the side we'd buy: yesTokenId for YES, noTokenId for NO.
        // Each token's price stream is the price of its own side directly.
        // So the buying cost for the pair at time t is just p1(t) + p2(t).
        const sim = replayArb(h1, h2, (a, b) => a + b);
        setResult(sim);
      }
    } catch (e) {
      setError(String(e?.message || e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ padding: "16px 20px" }} accent={C.cyan}>
        <div style={{ fontSize: 11, color: C.cyan, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 8 }}>⏱ HISTORICAL EDGE REPLAY</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          Pulls Polymarket's <span style={{ fontFamily: "IBM Plex Mono, monospace", color: C.text }}>/prices-history</span> for both legs and counts how often the combined cost dropped below $1 — i.e., how often this exact arbitrage actually existed. If hit-rate is near zero, the strategy didn't pay historically and won't going forward.
        </div>
      </Card>

      <Card style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 14, textTransform: "uppercase" }}>Replay an Opportunity</div>
        {opps.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>
            Run a scan first — backtest replays an opportunity captured by the scanner.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 280px" }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>OPPORTUNITY</div>
              <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
                style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, color: C.text, padding: "7px 10px", borderRadius: 4, fontSize: 12, height: 35, boxSizing: "border-box" }}>
                {opps.map(o => (
                  <option key={o.id} value={o.id}>{`[${o.type}] ${o.market}`}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>WINDOW</div>
              <select value={historyRange} onChange={e => setHistoryRange(e.target.value)}
                style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, padding: "7px 10px", borderRadius: 4, fontSize: 12, height: 35 }}>
                <option value="1d">1 day</option>
                <option value="1w">1 week</option>
                <option value="1m">1 month</option>
                <option value="max">Max</option>
              </select>
            </div>
            <button onClick={run} disabled={loading || !opp} style={{
              background: loading ? "none" : C.cyanDim, border: `1px solid ${loading ? C.border : C.cyan}66`,
              color: loading ? C.muted : C.cyan, padding: "7px 16px", borderRadius: 4,
              fontSize: 11, fontWeight: 700, cursor: loading ? "default" : "pointer",
              fontFamily: "IBM Plex Mono, monospace", height: 35,
            }}>{loading ? "REPLAYING…" : "▸ REPLAY"}</button>
          </div>
        )}
        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: C.redDim, border: `1px solid ${C.red}44`, borderRadius: 4, fontSize: 11, color: C.red, fontFamily: "IBM Plex Mono, monospace" }}>
            {error}
          </div>
        )}
      </Card>

      {result && (
        <Card style={{ padding: "16px 20px" }} accent={result.hits > 0 ? C.green : C.red}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 14 }}>RESULTS</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <MetricMini label="Samples" value={result.samples.toString()} color={C.text} />
            <MetricMini label="Hit count" value={result.hits.toString()} color={result.hits > 0 ? C.green : C.red} />
            <MetricMini label="Hit rate" value={`${(result.hitRate * 100).toFixed(1)}%`} color={result.hits > 0 ? C.green : C.red} />
            <MetricMini label="Avg edge" value={`${(result.avgEdge * 100).toFixed(2)}¢`} color={C.amber} />
            <MetricMini label="Max edge" value={`${(result.maxEdge * 100).toFixed(2)}¢`} color={C.purple} />
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: C.dim, fontStyle: "italic", lineHeight: 1.6 }}>
            {result.hits === 0
              ? "Zero hits in this window. The arb didn't exist historically — current scanner reading may be a transient quote anomaly or stale price."
              : `Arb existed in ${(result.hitRate * 100).toFixed(1)}% of samples. Average realisable edge ${(result.avgEdge * 100).toFixed(2)}¢ per pair, peak ${(result.maxEdge * 100).toFixed(2)}¢.`}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "api",      label: "Scanner",     icon: "⇄" },
  { id: "backtest", label: "Backtest",    icon: "⏱" },
  { id: "paper",    label: "Paper Trade", icon: "✎" },
  { id: "kelly",    label: "Kelly Sizer", icon: "◎" },
  { id: "claude",   label: "CLAUDE.md",   icon: "⧫" },
];

export default function ArbBotV2() {
  const [tab, setTab] = useState("api");
  const [botActive, setBotActive] = useState(false);
  // Counts of real scans completed and the most recent scan's market totals.
  const [scanCount, setScanCount] = useState(0);
  const [lastScan, setLastScan] = useState({ cross: 0, near: 0, status: "unknown" });
  // Lifted so Backtest and Paper-Trade tabs can act on the latest scan's opps.
  const [latestOpps, setLatestOpps] = useState([]);
  // Paper-trade journal lives at the top so the Scanner can append from a
  // per-opp button while the Paper tab reads the same array. localStorage is
  // the canonical source; React state mirrors it.
  const [paperJournal, setPaperJournal] = useState(loadPaperJournal);
  useEffect(() => { savePaperJournal(paperJournal); }, [paperJournal]);

  const handleScanComplete = useCallback((info) => {
    setScanCount(c => c + 1);
    setLastScan({ cross: info.cross, near: info.near, status: info.status });
    setLatestOpps(info.opportunities || []);
  }, []);

  const addPaperTrade = useCallback((entry) => {
    setPaperJournal(j => [...j, entry]);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 14, lineHeight: 1.6 }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        <div style={{ padding: "14px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: C.purple, letterSpacing: "0.5px" }}>ARBITRAGE//BOT</span>
              <span style={{ color: C.dim }}>|</span>
              <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: C.muted }}>v3.0 — Polymarket · Logic Arb + Near-Resolution</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Polymarket Arb Scanner</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 14, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 16px" }}>
              {[
                ["Scans", scanCount.toString(), C.blue],
                ["API", lastScan.status === "live" ? "LIVE" : lastScan.status === "demo" ? "DEMO" : "—", lastScan.status === "live" ? C.green : lastScan.status === "demo" ? C.amber : C.muted],
                ["Bot", botActive ? "ACTIVE" : "IDLE", botActive ? C.green : C.muted],
              ].map(([l, v, c]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.6px", textTransform: "uppercase" }}>{l}</div>
                  <div style={{ fontSize: 13, color: c, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                    <Dot active={v !== "OFF" && v !== "IDLE"} color={c} size={5} />
                    {v}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setBotActive(p => !p)} style={{
              background: botActive ? C.redDim : C.greenDim,
              border: `1px solid ${botActive ? C.red : C.green}55`,
              color: botActive ? C.red : C.green,
              padding: "8px 18px", borderRadius: 5, fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.4px", transition: "all 0.2s",
            }}>{botActive ? "■ STOP" : "▸ START"}</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", padding: "0 24px", marginTop: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: "none", border: "none",
              borderBottom: tab === t.id ? `2px solid ${C.purple}` : "2px solid transparent",
              color: tab === t.id ? C.text : C.muted,
              padding: "10px 16px", fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
              cursor: "pointer", letterSpacing: "0.3px", transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ opacity: 0.5 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active bar */}
      {botActive && (
        <div style={{ background: C.greenDim, borderBottom: `1px solid ${C.green}22`, padding: "5px 24px", fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: C.green, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <span><Dot active color={C.green} size={6} /> BOT ACTIVE</span>
          <span>LAST SCAN: {lastScan.cross} LOGIC ARB · {lastScan.near} NEAR-RES</span>
          <span>STRATEGIES: LOGIC ARB (THRESHOLD + MUTEX) · NEAR-RESOLUTION</span>
          <span style={{ color: C.amber }}>Kelly ¼ · Max exposure 50%</span>
        </div>
      )}

      {/* Content */}
      <div style={{ padding: "24px", maxWidth: 980, margin: "0 auto" }}>
        {tab === "api"      && <APIFeedSection onScanComplete={handleScanComplete} onPaperTrade={addPaperTrade} />}
        {tab === "backtest" && <BacktestSection opps={latestOpps} />}
        {tab === "paper"    && <PaperTradeSection journal={paperJournal} setJournal={setPaperJournal} />}
        {tab === "kelly"    && <KellySection />}
        {tab === "claude"   && <ClaudeMdSection />}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 24px", fontSize: 10, color: C.muted, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span>API: Polymarket CLOB (clob.polymarket.com)</span>
        <span>Not financial advice. Capital at risk. Verify resolution criteria before trading.</span>
      </div>
    </div>
  );
}
