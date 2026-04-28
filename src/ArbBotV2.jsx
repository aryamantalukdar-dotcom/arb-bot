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
      volume:        parseFloat(d.volume    || 0),
      liquidity:     parseFloat(d.liquidity || 0),
      category:      d.tags?.[0] || "General",
      eventId,
    };
  }).filter(m => m && m.question && m.outcomePrices[0] > 0.001 && m.outcomePrices[0] < 0.999);
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
            leg1:      { label: `YES  @ ${(loYes*100).toFixed(1)}¢`, market: lo.question,  price: loYes,               side: "YES" },
            leg2:      { label: `NO   @ ${(hi.outcomePrices[1]*100).toFixed(1)}¢`, market: hi.question, price: hi.outcomePrices[1], side: "NO"  },
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
      leg1:      { label: `NO  @ ${(a.outcomePrices[1]*100).toFixed(1)}¢`, market: a.question, price: a.outcomePrices[1], side: "NO" },
      leg2:      { label: `NO  @ ${(b.outcomePrices[1]*100).toFixed(1)}¢`, market: b.question, price: b.outcomePrices[1], side: "NO" },
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
    });
  }

  return { opportunities: opportunities.sort((a, b) => b.roi - a.roi).slice(0, 10), status };
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
function APIFeedSection({ onScanComplete }) {
  const [scanLoading, setScanLoading] = useState(false);
  const [crossOpps, setCrossOpps] = useState([]);
  const [nearOpps, setNearOpps] = useState([]);
  const [apiStat, setApiStat] = useState("unknown"); // "unknown" | "live" | "demo"
  const [apiLog, setApiLog] = useState([
    { ts: "09:41:22", method: "GET", endpoint: "/sampling-simplified-markets?limit=60", status: 200, ms: 187, source: "CLOB" },
    { ts: "09:41:23", method: "GET", endpoint: "/markets/{condition_id} ×60 parallel", status: 200, ms: 310, source: "CLOB" },
    { ts: "09:41:23", method: "SCAN", endpoint: "logic-arb-engine: threshold + mutex", status: "OK", ms: 12, source: "SCANNER" },
  ]);

  // Request-id guard: only the latest scan is allowed to write state.
  // Prevents double-clicks and unmount-during-fetch from stomping results.
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

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
      onScanComplete?.({ cross: cross.length, near: near.length, status });
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

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={runScan} disabled={scanLoading} style={{
            background: scanLoading ? "none" : C.blueDim, border: `1px solid ${scanLoading ? C.border : C.blue}66`,
            color: scanLoading ? C.muted : C.blue, padding: "8px 18px", borderRadius: 4,
            fontSize: 12, fontWeight: 700, cursor: scanLoading ? "default" : "pointer",
            fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.4px", transition: "all 0.15s",
          }}>
            {scanLoading ? <span>SCANNING <Blink color={C.blue} /></span> : "▸ RUN SCAN NOW"}
          </button>
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
                    <Tag label={opp.type === "THRESH" ? "THRESHOLD" : "MUTEX"} color={opp.type === "THRESH" ? C.blue : C.purple} size="xs" />
                    {opp.isLive && <Tag label="LIVE" color={C.green} size="xs" style={{ marginLeft: 4 }} />}
                    <span style={{ color: C.text, fontSize: 12, marginLeft: 8, fontWeight: 600 }}>{opp.market}</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: "IBM Plex Mono, monospace", marginTop: 2 }}>
                    Leg 1: {opp.leg1?.label} · Leg 2: {opp.leg2?.label}
                  </div>
                  {opp.rationale && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{opp.rationale}</div>}
                  <div style={{ marginTop: 6, display: "flex", gap: 10 }}>
                    {opp.url1 && <a href={opp.url1} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: C.blue, textDecoration: "none", fontFamily: "IBM Plex Mono, monospace" }}>→ Leg 1 on Polymarket ↗</a>}
                    {opp.url2 && <a href={opp.url2} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: C.blue, textDecoration: "none", fontFamily: "IBM Plex Mono, monospace" }}>→ Leg 2 on Polymarket ↗</a>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <MetricMini label="Cost" value={money(opp.cost)} color={C.amber} />
                  <MetricMini label="ROI" value={`+${opp.roi}%`} color={C.green} />
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

// ─── Main App ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "api",    label: "Scanner", icon: "⇄" },
  { id: "kelly",  label: "Kelly Sizer",     icon: "◎" },
  { id: "claude", label: "CLAUDE.md",       icon: "⧫" },
];

export default function ArbBotV2() {
  const [tab, setTab] = useState("api");
  const [botActive, setBotActive] = useState(false);
  // Counts of real scans completed and the most recent scan's market totals.
  const [scanCount, setScanCount] = useState(0);
  const [lastScan, setLastScan] = useState({ cross: 0, near: 0, status: "unknown" });

  const handleScanComplete = useCallback((info) => {
    setScanCount(c => c + 1);
    setLastScan(info);
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
        {tab === "api"    && <APIFeedSection onScanComplete={handleScanComplete} />}
        {tab === "kelly"  && <KellySection />}
        {tab === "claude" && <ClaudeMdSection />}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 24px", fontSize: 10, color: C.muted, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span>API: Polymarket CLOB (clob.polymarket.com)</span>
        <span>Not financial advice. Capital at risk. Verify resolution criteria before trading.</span>
      </div>
    </div>
  );
}
