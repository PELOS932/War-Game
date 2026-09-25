/**
 * World market: nations post daily buy/sell orders (auto trade policies or
 * manual trades); the market clears pro-rata against an external liquidity
 * buffer (rest-of-world traders) and prices move with the demand/supply ratio.
 */
import { RESOURCE_COUNT, Resource, type Nation, type WorldMarket } from './types';
import type { Sim } from './core';
import { clamp } from './core';

/** Base prices in USD millions per resource unit. */
export const BASE_PRICE = [1.0, 1.5, 0.8, 2.5, 0.6, 1.2, 8.0, 1.0, 3.0, 2.5, 6.0];
/** Price bounds relative to base. */
const MIN_REL = 0.3, MAX_REL = 4.0;
/** Buyer premium / seller discount vs. mid price. */
export const SPREAD = 0.03;

export function createMarket(): WorldMarket {
  return {
    price: Float64Array.from(BASE_PRICE),
    basePrice: Float64Array.from(BASE_PRICE),
    supply: new Float64Array(RESOURCE_COUNT),
    demand: new Float64Array(RESOURCE_COUNT),
  };
}

/** Days of total demand a nation wants to keep in stock, by resource. */
export const TARGET_STOCK_DAYS = [30, 45, 45, 45, 40, 40, 90, 3, 30, 30, 60];

export class MarketBook {
  buy: Float64Array[];
  sell: Float64Array[];
  /** Consumption scale per resource (world production) for external liquidity. */
  worldProd = new Float64Array(RESOURCE_COUNT);
  worldCons = new Float64Array(RESOURCE_COUNT);

  constructor(n: number) {
    this.buy = Array.from({ length: n }, () => new Float64Array(RESOURCE_COUNT));
    this.sell = Array.from({ length: n }, () => new Float64Array(RESOURCE_COUNT));
  }

  reset(): void {
    for (const b of this.buy) b.fill(0);
    for (const s of this.sell) s.fill(0);
    this.worldProd.fill(0);
    this.worldCons.fill(0);
  }
}

/** Auto trade policy: decide today's orders for one nation (after production & consumption). */
export function planTrade(sim: Sim, n: Nation, book: MarketBook): void {
  const m = sim.state.market;
  const buy = book.buy[n.id], sell = book.sell[n.id];
  const treasuryRoom = Math.max(0, n.treasury) * 0.08 * 1000; // $M per day we may spend on imports
  let spend = 0;
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    const policy = n.tradePolicy[r];
    if (policy === 'hold') continue;
    const dem = Math.max(n.demand[r], 0.001);
    const stock = n.stock[r];
    const days = stock / dem;
    const target = TARGET_STOCK_DAYS[r];
    const price = m.price[r] * (1 + SPREAD);
    if (policy === 'sell') {
      const amt = Math.max(0, stock - dem * 5);
      if (amt > 0) sell[r] += amt;
      continue;
    }
    if (policy === 'buy') {
      const want = Math.max(0, dem * target * 2 - stock);
      if (want > 0) buy[r] += want * 0.25;
      continue;
    }
    // auto
    if (days < target * 0.8) {
      // Buy toward target over ~5 days; always cover today's shortfall.
      let want = (dem * target - stock) / 5;
      const essential = r === Resource.Agriculture || r === Resource.ElectricPower || r === Resource.Petroleum || r === Resource.ConsumerGoods;
      // Avoid buying at extreme prices unless essential.
      const rel = m.price[r] / m.basePrice[r];
      if (!essential && rel > 2) want *= 0.4;
      const cost = want * price;
      const room = essential ? treasuryRoom * 2 + dem * price * 2 : treasuryRoom;
      if (spend + cost > room) want = Math.max(0, (room - spend) / price);
      if (n.treasury <= 0 && !essential) want = 0;
      if (want > 0) { buy[r] += want; spend += want * price; }
    } else if (days > target * 1.6) {
      const excess = stock - dem * target * 1.2;
      if (excess > 0) sell[r] += excess * 0.35;
    }
  }
}

/** Clear all orders; move goods & money; update prices. */
export function clearMarket(sim: Sim, book: MarketBook): void {
  const st = sim.state;
  const m = st.market;
  const N = st.nations.length;
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    let S = 0, D = 0;
    for (let i = 0; i < N; i++) { S += book.sell[i][r]; D += book.buy[i][r]; }
    // External liquidity (rest-of-world traders), elastic in price.
    const rel = m.price[r] / m.basePrice[r];
    const scale = Math.max(book.worldProd[r], book.worldCons[r], 1);
    const extS = 0.025 * scale * Math.pow(rel, 1.2);
    const extD = 0.025 * scale / Math.pow(rel, 1.2);
    const totalS = S + extS, totalD = D + extD;
    m.supply[r] = totalS;
    m.demand[r] = totalD;
    const buyFill = totalD > 0 ? Math.min(1, totalS / totalD) : 0;
    const sellFill = totalS > 0 ? Math.min(1, totalD / totalS) : 0;
    const pBuy = m.price[r] * (1 + SPREAD);
    const pSell = m.price[r] * (1 - SPREAD);
    for (let i = 0; i < N; i++) {
      const n = st.nations[i];
      if (!n.alive) continue;
      const b = book.buy[i][r] * buyFill;
      const s = book.sell[i][r] * sellFill;
      if (b > 0) {
        const tradeMod = 1 + (n.techMods.tradeCost ?? 0);
        const cost = (b * pBuy * tradeMod) / 1000;
        n.stock[r] += b;
        n.traded[r] += b;
        n.treasury -= cost;
        rec(sim.pendingExpenses[i], 'Resource Imports', cost);
        sim.tradeAccum[i] -= cost;
      }
      if (s > 0) {
        const sold = Math.min(s, n.stock[r]);
        const rev = (sold * pSell) / 1000;
        n.stock[r] -= sold;
        n.traded[r] -= sold;
        n.treasury += rev;
        rec(sim.pendingIncome[i], 'Resource Exports', rev);
        sim.tradeAccum[i] += rev;
      }
    }
    // Price dynamics.
    const ratio = totalD / Math.max(totalS, 1e-6);
    const step = clamp(Math.log(ratio), -1, 1) * 0.035;
    // Weak pull back toward base (long-run supply response).
    const pull = -Math.log(rel) * 0.004;
    m.price[r] = clamp(m.price[r] * Math.exp(step + pull), m.basePrice[r] * MIN_REL, m.basePrice[r] * MAX_REL);
  }
}

/** Immediate manual transaction. amount > 0 buys, < 0 sells. Returns error text or null. */
export function manualTrade(sim: Sim, n: Nation, r: Resource, amount: number): string | null {
  const m = sim.state.market;
  if (!Number.isFinite(amount) || amount === 0) return 'Invalid amount';
  if (amount > 0) {
    const cost = (amount * m.price[r] * (1 + SPREAD * 2)) / 1000;
    if (cost > n.treasury) return 'Insufficient funds';
    n.treasury -= cost;
    n.stock[r] += amount;
    n.traded[r] += amount;
    rec(sim.pendingExpenses[n.id], 'Resource Imports', cost);
    m.price[r] = Math.min(m.price[r] * (1 + Math.min(0.1, amount / Math.max(1, m.supply[r]) * 0.05)), m.basePrice[r] * MAX_REL);
  } else {
    const amt = Math.min(-amount, n.stock[r]);
    if (amt <= 0) return 'Nothing to sell';
    const rev = (amt * m.price[r] * (1 - SPREAD * 2)) / 1000;
    n.treasury += rev;
    n.stock[r] -= amt;
    n.traded[r] -= amt;
    rec(sim.pendingIncome[n.id], 'Resource Exports', rev);
    m.price[r] = Math.max(m.price[r] * (1 - Math.min(0.1, amt / Math.max(1, m.demand[r]) * 0.05)), m.basePrice[r] * MIN_REL);
  }
  return null;
}

function rec(map: Record<string, number>, key: string, v: number): void {
  map[key] = (map[key] ?? 0) + v;
}
