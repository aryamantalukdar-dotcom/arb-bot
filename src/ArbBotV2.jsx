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
const TYPE_COLOR = { CROSS_PLAT: C.blue, NEAR_RES: C.green, LOGIC: C.purple, KELLY: C.amber };

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

// ─── Mock API Engine ──────────────────────────────────────────────────────────
// Simulates real Polymarket Gamma API + Kalshi API responses
// In production: replace fetch calls with real endpoints

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const KALSHI_BASE = "https://trading-api.kalshi.com/trade-api/v2";
const CLOB_BASE = "https://clob.polymarket.com";

// Realistic mock data seeded from real market snapshots (March 2026)
const MOCK_POLY_MARKETS = [
  { id: "poly_bond_elordi", slug: "next-james-bond-elordi", question: "Will Jacob Elordi be cast as the next James Bond?", endDate: "2026-06-30", outcomePrices: [0.08, 0.92], volume: 42100, liquidity: 4200, category: "Entertainment" },
  { id: "poly_bond_turner", slug: "next-james-bond-turner", question: "Will Callum Turner be cast as the next James Bond?", endDate: "2026-06-30", outcomePrices: [0.23, 0.77], volume: 118000, liquidity: 11800, category: "Entertainment" },
  { id: "poly_fed_jun", slug: "fed-rate-cut-june-2026", question: "Will the Fed cut rates at the June 2026 FOMC meeting?", endDate: "2026-06-18", outcomePrices: [0.31, 0.69], volume: 893000, liquidity: 89300, category: "Macro" },
  { id: "poly_btc_80k", slug: "btc-above-80k-apr1", question: "Will Bitcoin be above $80,000 on April 1, 2026?", endDate: "2026-04-01", outcomePrices: [0.91, 0.09], volume: 3120000, liquidity: 312000, category: "Crypto" },
  { id: "poly_wi_gov", slug: "wi-gov-dem-nominee-rodriguez", question: "Will Sara Rodriguez win the Wisconsin Democratic gubernatorial primary?", endDate: "2026-05-01", outcomePrices: [0.75, 0.25], volume: 221000, liquidity: 22100, category: "Politics" },
  { id: "poly_nato", slug: "nato-summit-june-2026", question: "Will the NATO Summit be held in June 2026?", endDate: "2026-06-30", outcomePrices: [0.96, 0.04], volume: 440000, liquidity: 44000, category: "Geopolitics" },
  { id: "poly_cpi", slug: "us-cpi-below-3-5-march", question: "Will US CPI be below 3.5% in the March 2026 reading?", endDate: "2026-04-10", outcomePrices: [0.95, 0.05], volume: 1560000, liquidity: 156000, category: "Macro" },
  { id: "poly_senate_r", slug: "republicans-win-senate-2026", question: "Will Republicans maintain Senate majority after 2026 midterms?", endDate: "2026-11-10", outcomePrices: [0.61, 0.39], volume: 2800000, liquidity: 280000, category: "Politics" },
];

const MOCK_KALSHI_MARKETS = [
  { id: "kalshi_bond_elordi", ticker: "BOND-ELORDI", title: "Jacob Elordi as next James Bond", expirationDate: "2026-06-30", yesPrice: 0.27, noPrice: 0.73, volume: 18000, category: "Entertainment" },
  { id: "kalshi_bond_turner", ticker: "BOND-TURNER", title: "Callum Turner as next James Bond", expirationDate: "2026-06-30", yesPrice: 0.36, noPrice: 0.64, volume: 31000, category: "Entertainment" },
  { id: "kalshi_fed_jun", ticker: "FED-JUNE26", title: "Fed rate cut at June 2026 FOMC", expirationDate: "2026-06-18", yesPrice: 0.39, noPrice: 0.61, volume: 450000, category: "Macro" },
  { id: "kalshi_wi_gov", ticker: "WI-GOV-DEM-ROD", title: "Sara Rodriguez wins WI Dem primary", expirationDate: "2026-05-01", yesPrice: 0.19, noPrice: 0.81, volume: 88000, category: "Politics" },
  { id: "kalshi_senate_r", ticker: "SENATE-R-2026", title: "Republicans win Senate majority 2026", expirationDate: "2026-11-10", yesPrice: 0.54, noPrice: 0.46, volume: 1200000, category: "Politics" },
];

// Simulated API clients (replace fetch with real calls in production)
const polymarketAPI = {
  async getMarkets(category = null) {
    await new Promise(r => setTimeout(r, 180 + Math.random() * 120));
    let markets = [...MOCK_POLY_MARKETS];
    // Add random ±2% price drift to simulate live feed
    markets = markets.map(m => ({
      ...m,
      outcomePrices: [
        Math.max(0.01, Math.min(0.99, m.outcomePrices[0] + (Math.random() - 0.5) * 0.02)),
        0, // computed below
      ],
    })).map(m => ({ ...m, outcomePrices: [m.outcomePrices[0], 1 - m.outcomePrices[0]] }));
    if (category) markets = markets.filter(m => m.category === category);
    return markets;
  },
  async getOrderBook(marketId) {
    await new Promise(r => setTimeout(r, 80 + Math.random() * 60));
    const basePrice = MOCK_POLY_MARKETS.find(m => m.id === marketId)?.outcomePrices[0] || 0.5;
    return {
      marketId,
      bids: Array.from({length: 5}, (_, i) => ({ price: basePrice - (i+1)*0.01, size: Math.floor(Math.random()*500+100) })),
      asks: Array.from({length: 5}, (_, i) => ({ price: basePrice + (i+1)*0.01, size: Math.floor(Math.random()*500+100) })),
      spread: 0.02,
      lastPrice: basePrice,
    };
  }
};

const kalshiAPI = {
  async getMarkets(category = null) {
    await new Promise(r => setTimeout(r, 200 + Math.random() * 150));
    let markets = [...MOCK_KALSHI_MARKETS];
    markets = markets.map(m => ({
      ...m,
      yesPrice: Math.max(0.01, Math.min(0.99, m.yesPrice + (Math.random() - 0.5) * 0.02)),
    })).map(m => ({ ...m, noPrice: parseFloat((1 - m.yesPrice).toFixed(2)) }));
    if (category) markets = markets.filter(m => m.category === category);
    return markets;
  }
};

// Cross-platform scanner: finds arb when combined cost < $1
async function scanCrossPlatform() {
  const [polyMarkets, kalshiMarkets] = await Promise.all([
    polymarketAPI.getMarkets(),
    kalshiAPI.getMarkets(),
  ]);

  const opportunities = [];

  // Map known cross-platform pairs
  const pairs = [
    { polyId: "poly_bond_elordi",  kalshiId: "kalshi_bond_elordi",  polySide: "YES", kalshiSide: "NO", market: "Next James Bond — Jacob Elordi" },
    { polyId: "poly_bond_turner",  kalshiId: "kalshi_bond_turner",   polySide: "YES", kalshiSide: "NO", market: "Next James Bond — Callum Turner" },
    { polyId: "poly_fed_jun",      kalshiId: "kalshi_fed_jun",       polySide: "YES", kalshiSide: "NO", market: "Fed Rate Cut — June 2026 FOMC" },
    { polyId: "poly_wi_gov",       kalshiId: "kalshi_wi_gov",        polySide: "NO",  kalshiSide: "YES", market: "WI Governor Dem Nominee — Rodriguez" },
    { polyId: "poly_senate_r",     kalshiId: "kalshi_senate_r",      polySide: "YES", kalshiSide: "NO", market: "Republicans Win Senate 2026" },
  ];

  for (const pair of pairs) {
    const poly = polyMarkets.find(m => m.id === pair.polyId);
    const kalshi = kalshiMarkets.find(m => m.id === pair.kalshiId);
    if (!poly || !kalshi) continue;

    const polyPrice = pair.polySide === "YES" ? poly.outcomePrices[0] : poly.outcomePrices[1];
    const kalshiPrice = pair.kalshiSide === "YES" ? kalshi.yesPrice : kalshi.noPrice;
    const combined = polyPrice + kalshiPrice;
    const profit = 1 - combined;
    const roi = profit / combined * 100;

    if (combined < 0.98) { // require >2% spread after fees
      const expiry = pair.polyId.includes("bond") ? "2026-06-30" : poly.endDate;
      const daysToExpiry = Math.max(1, Math.round((new Date(expiry) - new Date()) / 86400000));
      opportunities.push({
        id: `${pair.polyId}_${pair.kalshiId}_${Date.now()}`,
        market: pair.market,
        poly: { side: pair.polySide, price: polyPrice, platform: "Polymarket" },
        kalshi: { side: pair.kalshiSide, price: kalshiPrice, platform: "Kalshi" },
        cost: parseFloat(combined.toFixed(4)),
        profit: parseFloat(profit.toFixed(4)),
        roi: parseFloat(roi.toFixed(2)),
        apy: parseFloat((roi / daysToExpiry * 365).toFixed(1)),
        expiry,
        daysToExpiry,
        liquidity: `$${((poly.liquidity + (kalshi.volume / 10)) / 1000).toFixed(0)}K`,
        riskLevel: roi > 10 ? "medium" : "low",
        category: poly.category,
        scannedAt: nowTs(),
      });
    }
  }

  return opportunities.sort((a, b) => b.roi - a.roi);
}

// Near-resolution scanner
async function scanNearResolution() {
  const polyMarkets = await polymarketAPI.getMarkets();
  const results = [];

  for (const m of polyMarkets) {
    const prob = m.outcomePrices[0];
    const daysLeft = Math.max(1, Math.round((new Date(m.endDate) - new Date()) / 86400000));
    
    if (prob >= 0.88 && daysLeft <= 30) {
      const edge = prob - (prob * 0.97); // assume 3% fee drag
      const roi = (1 / (prob * 0.97) - 1) * 100;
      results.push({
        id: m.id,
        market: m.question,
        platform: "Polymarket",
        prob: parseFloat(prob.toFixed(3)),
        price: parseFloat((prob * 0.97).toFixed(3)),
        edge: parseFloat(edge.toFixed(3)),
        roi: parseFloat(roi.toFixed(2)),
        daysToExpiry: daysLeft,
        liquidity: `$${(m.liquidity / 1000).toFixed(0)}K`,
        riskLevel: "low",
        category: m.category,
        apy: parseFloat((roi / daysLeft * 365).toFixed(1)),
        scannedAt: nowTs(),
      });
    }
  }

  return results.sort((a, b) => b.roi - a.roi);
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
  const expectedROI = (expectedValue / betSize) * 100;
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

// ─── WebSocket Simulator ──────────────────────────────────────────────────────
// In production: replace with real WebSocket at wss://ws-subscriptions.polymarket.com
function useWebSocketFeed(active) {
  const [messages, setMessages] = useState([]);
  const [prices, setPrices] = useState({});
  const intervalRef = useRef(null);

  const MARKETS_WS = [
    { id: "poly_btc_80k", label: "BTC >$80K", base: 0.91 },
    { id: "poly_fed_jun", label: "Fed Cut Jun", base: 0.31 },
    { id: "poly_cpi", label: "CPI <3.5%", base: 0.95 },
    { id: "poly_senate_r", label: "R Senate", base: 0.61 },
    { id: "poly_nato", label: "NATO Summit", base: 0.96 },
  ];

  useEffect(() => {
    if (!active) { clearInterval(intervalRef.current); return; }
    // Initialize
    const init = {};
    MARKETS_WS.forEach(m => { init[m.id] = m.base; });
    setPrices(init);

    intervalRef.current = setInterval(() => {
      const updates = {};
      const newMsgs = [];
      MARKETS_WS.forEach(m => {
        const delta = (Math.random() - 0.49) * 0.012;
        const newPrice = Math.max(0.01, Math.min(0.99, (prices[m.id] || m.base) + delta));
        updates[m.id] = parseFloat(newPrice.toFixed(3));
        if (Math.abs(delta) > 0.008) {
          newMsgs.push({
            id: Date.now() + m.id,
            ts: nowTs(),
            market: m.label,
            price: newPrice,
            delta: delta,
            type: "PRICE_UPDATE",
          });
        }
      });
      setPrices(prev => ({ ...prev, ...updates }));
      if (newMsgs.length > 0) {
        setMessages(prev => [...newMsgs, ...prev].slice(0, 50));
      }
    }, 1200);

    return () => clearInterval(intervalRef.current);
  }, [active]);

  return { messages, prices, MARKETS_WS };
}

// ─── Sections ─────────────────────────────────────────────────────────────────

// API Feed Panel
function APIFeedSection({ wsActive, onToggleWS }) {
  const { messages, prices, MARKETS_WS } = useWebSocketFeed(wsActive);
  const [scanLoading, setScanLoading] = useState(false);
  const [crossOpps, setCrossOpps] = useState([]);
  const [nearOpps, setNearOpps] = useState([]);
  const [apiLog, setApiLog] = useState([
    { ts: "09:41:22", method: "GET", endpoint: "/gamma-api/markets?active=true&limit=50", status: 200, ms: 187, source: "Polymarket" },
    { ts: "09:41:22", method: "GET", endpoint: "/trade-api/v2/markets?status=open&limit=50", status: 200, ms: 213, source: "Kalshi" },
    { ts: "09:41:23", method: "GET", endpoint: "/clob/orderbook?market=0xa23f4...", status: 200, ms: 94, source: "CLOB" },
  ]);

  const runScan = async () => {
    setScanLoading(true);
    const start = Date.now();
    setApiLog(prev => [
      { ts: nowTs(), method: "GET", endpoint: "/gamma-api/markets?active=true", status: "...", ms: null, source: "Polymarket" },
      { ts: nowTs(), method: "GET", endpoint: "/trade-api/v2/markets?status=open", status: "...", ms: null, source: "Kalshi" },
      ...prev,
    ]);

    try {
      const [cross, near] = await Promise.all([scanCrossPlatform(), scanNearResolution()]);
      const elapsed = Date.now() - start;
      setCrossOpps(cross);
      setNearOpps(near);
      setApiLog(prev => {
        const updated = [...prev];
        updated[0] = { ...updated[0], status: 200, ms: Math.round(elapsed * 0.55) };
        updated[1] = { ...updated[1], status: 200, ms: Math.round(elapsed * 0.65) };
        return [
          { ts: nowTs(), method: "SCAN", endpoint: `→ ${cross.length} cross-platform + ${near.length} near-res opportunities`, status: "OK", ms: elapsed, source: "SCANNER" },
          ...updated,
        ].slice(0, 20);
      });
    } catch(e) {
      setApiLog(prev => [
        { ts: nowTs(), method: "ERR", endpoint: e.message, status: 500, ms: null, source: "SCANNER" },
        ...prev,
      ]);
    }
    setScanLoading(false);
  };

  const statusColor = { 200: C.green, "OK": C.green, "...": C.amber, 500: C.red };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* API Config */}
      <Card style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 14, textTransform: "uppercase" }}>API Integration Layer</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {[
            { label: "Polymarket Gamma", url: "gamma-api.polymarket.com", status: "LIVE", color: C.green },
            { label: "Polymarket CLOB", url: "clob.polymarket.com", status: "LIVE", color: C.green },
            { label: "Kalshi REST", url: "trading-api.kalshi.com", status: "LIVE", color: C.green },
            { label: "WebSocket Feed", url: "ws-subscriptions.polymarket.com", status: wsActive ? "CONNECTED" : "OFF", color: wsActive ? C.cyan : C.muted },
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
          <div style={{ color: C.dim }}>// Production API Client (Python)</div>
          <div><span style={{ color: C.purple }}>from</span> <span style={{ color: C.blue }}>py_clob_client.client</span> <span style={{ color: C.purple }}>import</span> ClobClient</div>
          <div><span style={{ color: C.purple }}>import</span> <span style={{ color: C.blue }}>kalshi_python</span></div>
          <div style={{ marginTop: 4 }}><span style={{ color: C.muted }}>poly</span> = ClobClient(<span style={{ color: C.amber }}>"https://clob.polymarket.com"</span>, key=<span style={{ color: C.amber }}>POLY_KEY</span>)</div>
          <div><span style={{ color: C.muted }}>kalshi</span> = kalshi_python.ApiInstance(env=<span style={{ color: C.amber }}>"prod"</span>, key=<span style={{ color: C.amber }}>KALSHI_KEY</span>)</div>
          <div style={{ marginTop: 4 }}><span style={{ color: C.dim }}>// See GitHub: Polymarket/py-clob-client</span></div>
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
          <button onClick={onToggleWS} style={{
            background: wsActive ? C.cyanDim : "none",
            border: `1px solid ${wsActive ? C.cyan : C.border}66`,
            color: wsActive ? C.cyan : C.muted,
            padding: "8px 18px", borderRadius: 4, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "IBM Plex Mono, monospace", transition: "all 0.15s",
          }}>
            {wsActive ? "◼ STOP WS FEED" : "⇄ START WS FEED"}
          </button>
        </div>
      </Card>

      {/* WebSocket Live Feed */}
      {wsActive && (
        <Card style={{ padding: "16px 20px" }} accent={C.cyan}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Dot active color={C.cyan} />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.cyan, letterSpacing: "0.8px" }}>WEBSOCKET LIVE FEED</span>
              <Tag label="ws-subscriptions.polymarket.com" color={C.muted} size="xs" />
            </div>
          </div>
          {/* Live price tickers */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {MARKETS_WS.map(m => {
              const p = prices[m.id] || m.base;
              const delta = p - m.base;
              return (
                <div key={m.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 12px", flex: "1 1 100px", minWidth: 100 }}>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 16, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: C.text }}>{pct(p)}</div>
                  <div style={{ fontSize: 10, color: delta >= 0 ? C.green : C.red, fontFamily: "IBM Plex Mono, monospace" }}>
                    {delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}pp
                  </div>
                </div>
              );
            })}
          </div>
          {/* Message stream */}
          <div style={{ background: C.bg, borderRadius: 4, padding: "10px 12px", maxHeight: 140, overflowY: "auto", fontFamily: "IBM Plex Mono, monospace", fontSize: 11 }}>
            {messages.length === 0 ? (
              <span style={{ color: C.muted }}>Waiting for price movements... <Blink color={C.muted} /></span>
            ) : messages.map(msg => (
              <div key={msg.id} style={{ display: "flex", gap: 10, marginBottom: 3, alignItems: "center" }}>
                <span style={{ color: C.dim }}>{msg.ts}</span>
                <span style={{ color: C.muted }}>PRICE</span>
                <span style={{ color: C.text }}>{msg.market}</span>
                <span style={{ color: C.text, fontWeight: 700 }}>{pct(msg.price)}</span>
                <span style={{ color: msg.delta >= 0 ? C.green : C.red }}>
                  {msg.delta >= 0 ? "▲" : "▼"}{Math.abs(msg.delta * 100).toFixed(2)}pp
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Scan Results */}
      {(crossOpps.length > 0 || nearOpps.length > 0) && (
        <Card style={{ padding: "16px 20px" }} accent={C.green}>
          <div style={{ fontSize: 11, color: C.green, fontWeight: 700, letterSpacing: "0.8px", marginBottom: 14 }}>
            SCAN RESULTS — {crossOpps.length + nearOpps.length} OPPORTUNITIES DETECTED
          </div>
          {crossOpps.slice(0, 3).map(opp => (
            <div key={opp.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <Tag label="CROSS-PLAT" color={C.blue} size="xs" />
                <span style={{ color: C.text, fontSize: 12, marginLeft: 8, fontWeight: 600 }}>{opp.market}</span>
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <MetricMini label="Cost" value={money(opp.cost)} color={C.amber} />
                <MetricMini label="ROI" value={`+${opp.roi}%`} color={C.green} />
                <MetricMini label="APY" value={`${opp.apy}%`} color={C.purple} />
                <MetricMini label="Scanned" value={opp.scannedAt} color={C.muted} />
              </div>
            </div>
          ))}
          {nearOpps.slice(0, 2).map(opp => (
            <div key={opp.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <Tag label="NEAR-RES" color={C.green} size="xs" />
                <span style={{ color: C.text, fontSize: 12, marginLeft: 8 }}>{opp.market.slice(0, 55)}...</span>
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <MetricMini label="Prob" value={pct(opp.prob)} color={C.cyan} />
                <MetricMini label="Price" value={pct(opp.price)} color={C.amber} />
                <MetricMini label="ROI" value={`+${opp.roi}%`} color={C.green} />
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
              <Tag label={req.source} color={req.source === "Polymarket" ? C.purple : req.source === "Kalshi" ? C.blue : req.source === "SCANNER" ? C.green : C.muted} size="xs" />
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
    { id: 1, label: "Next Bond — Elordi (Cross-Plat)", prob: 0.97, odds: 1.235, type: "CROSS_PLAT" },
    { id: 2, label: "BTC >$80K Apr 1 (Near-Res)", prob: 0.94, odds: 1.099, type: "NEAR_RES" },
    { id: 3, label: "CPI <3.5% Mar (Near-Res)", prob: 0.97, odds: 1.053, type: "NEAR_RES" },
  ]);
  const [newPos, setNewPos] = useState({ label: "", prob: "", odds: "", type: "CROSS_PLAT" });
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
    setNewPos({ label: "", prob: "", odds: "", type: "CROSS_PLAT" });
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
              <option value="CROSS_PLAT">Cross-Platform</option>
              <option value="NEAR_RES">Near-Resolution</option>
              <option value="LOGIC">Logic Arb</option>
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
Automated prediction market arbitrage bot targeting cross-platform and logical arbitrage
between Polymarket and Kalshi. Built and operated via Claude Code.

## Architecture
\`\`\`
├── scanner/
│   ├── cross_platform.py     # Polymarket vs Kalshi spread scanner
│   ├── near_resolution.py    # Near-expiry harvest scanner
│   ├── logic_arb.py          # Logical/combinatorial inconsistency detector
│   └── ws_feed.py            # WebSocket price feed listener
├── execution/
│   ├── poly_client.py        # py-clob-client wrapper
│   ├── kalshi_client.py      # kalshi-python wrapper
│   ├── order_manager.py      # FOK/IOC order placement
│   └── position_tracker.py  # Open position + P&L tracking
├── risk/
│   ├── kelly.py              # Kelly criterion sizing engine
│   ├── portfolio.py          # Portfolio-level exposure management
│   └── safeguards.py         # Hard stop-loss, max drawdown, orphan detection
├── intelligence/
│   └── logic_engine.py       # Claude API calls for logical arb detection
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
- **No orphan legs:** Never place one leg of a cross-platform trade without the other
  - If leg 2 fails, immediately unwind leg 1
  - Use atomic execution with rollback logic
- **Minimum edge:** Only trade if net spread > ${config.minEdge}% after estimated fees
- **Liquidity gate:** Only trade markets with >${config.minLiquidity} liquidity
- **Resolution verification:** For cross-platform: manually verify resolution criteria match before first trade on a new market pair

## Kelly Criterion Configuration
- Fraction: ${config.kellyFraction} (¼ Kelly)
- Max single bet: ${config.maxSingleBet}% of bankroll
- Portfolio scaling: Yes (cap total at ${config.maxTotalExposure}%)
- Recalculate sizing on each scan

## Strategy Priority
1. **Near-Resolution Harvest** — lowest risk, execute immediately when found
2. **Cross-Platform Arb** — verify resolution criteria first, then execute
3. **Logical/Combinatorial** — use Claude API for analysis, require high confidence

## Loop Command
Run this command in Claude Code to start the scanner loop:
\`\`\`
/loop every 5 minutes:
  python scanner/cross_platform.py
  python scanner/near_resolution.py
  python scanner/logic_arb.py
  If opportunities found: python execution/order_manager.py --execute
  python monitoring/telegram_alerts.py --summary
\`\`\`

## API Keys Required
\`\`\`bash
POLYMARKET_PRIVATE_KEY=    # Polygon wallet private key
POLYMARKET_API_KEY=        # From clob.polymarket.com
POLYMARKET_API_SECRET=
POLYMARKET_API_PASSPHRASE=
KALSHI_EMAIL=
KALSHI_PASSWORD=           # Or API key if using v2 key auth
ANTHROPIC_API_KEY=         # For logic engine (Claude Sonnet)
TELEGRAM_BOT_TOKEN=        # Optional: trade alerts
TELEGRAM_CHAT_ID=
\`\`\`

## Dependencies
\`\`\`bash
pip install py-clob-client kalshi-python anthropic python-telegram-bot websockets aiohttp pandas
\`\`\`

## Multi-Agent Workflow (Claude Code)
When building complex features, spawn subagents:
- **Quant agent:** "Review kelly.py and verify the math is correct"
- **Risk agent:** "Audit safeguards.py for any gaps in the orphan detection logic"
- **API agent:** "Debug the Kalshi auth flow in kalshi_client.py"

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
          { n: "3", title: "Configure API keys", desc: "Add your Polymarket private key, Kalshi credentials, and Anthropic API key to .env", color: C.amber },
          { n: "4", title: "Run in sandbox first", desc: "Use Kalshi demo env and Polymarket test mode. Verify scanner output before using real capital.", color: C.green },
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
  { id: "api",    label: "API Integration", icon: "⇄" },
  { id: "kelly",  label: "Kelly Sizer",     icon: "◎" },
  { id: "claude", label: "CLAUDE.md",       icon: "⧫" },
];

export default function ArbBotV2() {
  const [tab, setTab] = useState("api");
  const [botActive, setBotActive] = useState(false);
  const [wsActive, setWsActive]   = useState(false);
  const [scanCount, setScanCount] = useState(0);

  useEffect(() => {
    if (!botActive) return;
    const t = setInterval(() => setScanCount(p => p + 1), 5000);
    return () => clearInterval(t);
  }, [botActive]);

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
              <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: C.muted }}>v2.0 — API + Kelly + CLAUDE.md</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Polymarket Arb Scanner</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 14, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 16px" }}>
              {[
                ["Scans", (scanCount + 127).toString(), C.blue],
                ["WS Feed", wsActive ? "LIVE" : "OFF", wsActive ? C.cyan : C.muted],
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
          <span>MARKETS CHECKED: {(scanCount + 1) * 847}</span>
          <span>STRATEGIES: CROSS-PLATFORM · NEAR-RESOLUTION · LOGICAL</span>
          <span style={{ color: C.amber }}>Kelly ¼ · Max exposure 50%</span>
        </div>
      )}

      {/* Content */}
      <div style={{ padding: "24px", maxWidth: 980, margin: "0 auto" }}>
        {tab === "api"    && <APIFeedSection wsActive={wsActive} onToggleWS={() => setWsActive(p => !p)} />}
        {tab === "kelly"  && <KellySection />}
        {tab === "claude" && <ClaudeMdSection />}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 24px", fontSize: 10, color: C.muted, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span>APIs: Polymarket Gamma · CLOB · Kalshi REST · WebSocket feed</span>
        <span>Not financial advice. Capital at risk. Verify resolution criteria before trading.</span>
      </div>
    </div>
  );
}
