/**
 * Real-world calibration tables keyed by ISO 3166-1 alpha-3 code (2030
 * estimates). Nations missing from a table (or procedural worlds) fall back to
 * formulas based on development level.
 */

/** Government gross debt / GDP. */
export const DEBT_RATIO: Record<string, number> = {
  JPN: 2.45, GRC: 1.5, ITA: 1.42, SGP: 1.6, USA: 1.26, FRA: 1.18, CAN: 1.05, ESP: 1.02, BEL: 1.06, GBR: 1.02,
  PRT: 0.92, BRA: 0.92, CHN: 0.96, IND: 0.82, ARG: 0.85, EGY: 0.88, AUT: 0.78, FIN: 0.82, HUN: 0.72, ISR: 0.68,
  ZAF: 0.8, MEX: 0.58, DEU: 0.63, NLD: 0.47, KOR: 0.58, AUS: 0.5, POL: 0.62, TUR: 0.36, IDN: 0.42, RUS: 0.22,
  SAU: 0.32, ARE: 0.3, NOR: 0.42, CHE: 0.36, SWE: 0.33, DNK: 0.3, KAZ: 0.26, IRN: 0.36, NGA: 0.46, PAK: 0.74,
  UKR: 0.98, VNM: 0.36, THA: 0.64, MYS: 0.66, PHL: 0.6, COL: 0.56, CHL: 0.42, PER: 0.35, IRL: 0.38, NZL: 0.52,
  QAT: 0.38, KWT: 0.12, IRQ: 0.52, LBN: 1.4, VEN: 1.4, SDN: 1.8, ETH: 0.4, KEN: 0.68, GHA: 0.8, AGO: 0.62,
  MAR: 0.7, DZA: 0.5, TUN: 0.82, JOR: 0.9, CZE: 0.45, ROU: 0.6, SVK: 0.6, HRV: 0.62, SRB: 0.55, BGR: 0.25,
  PRK: 0.3, CUB: 1.2, BGD: 0.42, LKA: 1.0, MMR: 0.6, TWN: 0.3,
};

/** Average annual interest rate on existing government debt. */
export const INTEREST_RATE: Record<string, number> = {
  JPN: 0.007, CHE: 0.01, DEU: 0.021, NLD: 0.022, USA: 0.033, GBR: 0.036, ITA: 0.035, FRA: 0.028, ESP: 0.03,
  CHN: 0.027, IND: 0.071, BRA: 0.095, TUR: 0.16, ARG: 0.18, EGY: 0.15, RUS: 0.09, ZAF: 0.09, MEX: 0.075,
  KOR: 0.03, AUS: 0.037, CAN: 0.032, SAU: 0.045, IDN: 0.065, NGA: 0.13, PAK: 0.12, UKR: 0.08, IRN: 0.14,
  GRC: 0.03, POL: 0.05, SGP: 0.025, TWN: 0.015, ISR: 0.04, SWE: 0.022, NOR: 0.03, DNK: 0.02,
};

/** Aircraft carriers in service in 2030. */
export const CARRIERS: Record<string, number> = {
  USA: 11, CHN: 4, GBR: 2, IND: 2, ITA: 2, FRA: 1, RUS: 1, ESP: 1,
};

/** Large-deck amphibious ships (incl. helicopter carriers). */
export const AMPHIBS: Record<string, number> = {
  USA: 9, CHN: 4, JPN: 4, FRA: 3, KOR: 2, AUS: 2, GBR: 2, ESP: 2, ITA: 3, RUS: 2, TUR: 1, BRA: 1, EGY: 2, IND: 1, NLD: 2,
};

/** Cruisers in service in 2030. */
export const CRUISERS: Record<string, number> = { USA: 8, RUS: 3, CHN: 8, KOR: 3, JPN: 2 };

/** Nuclear-powered submarine fleets (only these get SSNs/large sub fleets). */
export const SUBMARINES: Record<string, number> = {
  USA: 50, RUS: 30, CHN: 34, GBR: 10, FRA: 10, IND: 18, JPN: 24, KOR: 20, PRK: 30, IRN: 12, TUR: 12, DEU: 6,
  ITA: 8, AUS: 6, BRA: 7, ISR: 6, PAK: 8, ESP: 3, GRC: 11, NOR: 6, SWE: 5, CAN: 4, TWN: 6, VNM: 6, SGP: 4,
  IDN: 5, EGY: 8, DZA: 6, NLD: 4, CHL: 4, PER: 6, COL: 4, ARG: 2, POL: 1, PRT: 2, MYS: 2, ZAF: 3,
};

/** Share of electricity from nuclear power. */
export const NUCLEAR_POWER: Record<string, number> = {
  FRA: 0.65, SVK: 0.6, UKR: 0.5, HUN: 0.46, BEL: 0.3, CZE: 0.4, FIN: 0.42, SWE: 0.3, CHE: 0.33, SVN: 0.36,
  BGR: 0.35, ARM: 0.3, KOR: 0.3, ESP: 0.2, USA: 0.18, RUS: 0.2, GBR: 0.14, ROU: 0.2, CAN: 0.14, JPN: 0.12,
  CHN: 0.06, IND: 0.04, ARG: 0.06, BRA: 0.02, ZAF: 0.05, MEX: 0.04, PAK: 0.15, IRN: 0.02, ARE: 0.25, BLR: 0.3,
  NLD: 0.03, TUR: 0.08, EGY: 0.05, BGD: 0.08, TWN: 0.05,
};

/** Share of electricity from hydro power. */
export const HYDRO_POWER: Record<string, number> = {
  NOR: 0.9, BRA: 0.6, CAN: 0.6, PRY: 1.0, VEN: 0.7, COL: 0.65, ISL: 0.7, AUT: 0.6, CHE: 0.55, NZL: 0.55,
  SWE: 0.4, ETH: 0.9, ZMB: 0.8, CHN: 0.15, RUS: 0.18, PER: 0.5, VNM: 0.3, TUR: 0.25, USA: 0.06, IND: 0.1,
  JPN: 0.08, GEO: 0.75, TJK: 0.9, KGZ: 0.9, LAO: 0.8, MMR: 0.5, NPL: 0.9, BTN: 1.0, COD: 0.95, MOZ: 0.8,
  AGO: 0.7, UGA: 0.8, KEN: 0.3, ECU: 0.7, URY: 0.5, ARG: 0.25, CHL: 0.3, MEX: 0.1, PAK: 0.3, EGY: 0.08,
  IRN: 0.1, ESP: 0.1, FRA: 0.1, ITA: 0.15, GHA: 0.4, ALB: 1.0, CMR: 0.6, SDN: 0.6, TZA: 0.35, ZWE: 0.5,
};

/** Share of electricity from wind & solar. */
export const RENEWABLE_POWER: Record<string, number> = {
  DEU: 0.4, DNK: 0.6, ESP: 0.4, GBR: 0.35, NLD: 0.35, AUS: 0.3, USA: 0.2, CHN: 0.2, IND: 0.14, BRA: 0.18,
  ITA: 0.22, PRT: 0.35, CHL: 0.3, MAR: 0.18, IRL: 0.4, URY: 0.4, GRC: 0.35, JPN: 0.14, KOR: 0.1, MEX: 0.12,
  TUR: 0.18, ZAF: 0.1, SWE: 0.25, FIN: 0.2, BEL: 0.2, FRA: 0.12, POL: 0.2, ARE: 0.1, SAU: 0.08, EGY: 0.1,
};

/** Consumer manufacturing intensity (relative to GDP). */
export const MANUFACTURING: Record<string, number> = {
  CHN: 2.4, DEU: 1.5, JPN: 1.4, KOR: 1.7, TWN: 1.8, VNM: 1.7, MEX: 1.35, THA: 1.4, MYS: 1.4, IDN: 1.2,
  IND: 1.0, ITA: 1.2, CZE: 1.5, POL: 1.25, TUR: 1.25, BGD: 1.5, HUN: 1.3, SVK: 1.4, IRL: 1.4, CHE: 1.2,
  AUT: 1.15, SWE: 1.1, USA: 0.7, GBR: 0.6, FRA: 0.8, CAN: 0.7, AUS: 0.35, BRA: 0.9, RUS: 0.6, SAU: 0.4,
  ARE: 0.5, PHL: 1.0, KHM: 1.3, ROU: 1.2, SGP: 1.2, ISR: 0.9, ESP: 0.8, NLD: 0.8, BEL: 0.9, PAK: 0.9,
  EGY: 0.8, MAR: 1.0, TUN: 1.0, ETH: 0.7, NGA: 0.5, ARG: 0.8, COL: 0.7, CHL: 0.5, PER: 0.6,
};

/** Heavy industry intensity. */
export const HEAVY_INDUSTRY: Record<string, number> = {
  CHN: 2.8, IND: 1.35, RUS: 1.4, JPN: 1.4, KOR: 1.6, DEU: 1.4, TWN: 1.4, BRA: 1.1, TUR: 1.2, UKR: 1.3,
  USA: 0.75, ITA: 1.0, IRN: 1.1, VNM: 1.3, IDN: 1.0, MEX: 1.0, POL: 1.1, CZE: 1.2, KAZ: 1.1, ZAF: 1.0,
  SAU: 0.9, FRA: 0.8, GBR: 0.55, CAN: 0.8, AUS: 0.5, ESP: 0.8, SWE: 1.0, AUT: 1.0, EGY: 0.8, BLR: 1.1,
};

/** Arms industry capability (relative to defence spending). */
export const ARMS_INDUSTRY: Record<string, number> = {
  USA: 1.6, RUS: 1.6, CHN: 1.4, FRA: 1.4, GBR: 1.2, DEU: 1.1, ISR: 1.5, KOR: 1.3, ITA: 1.1, TUR: 1.2,
  SWE: 1.3, ESP: 0.9, JPN: 0.7, IND: 0.75, UKR: 1.0, BRA: 0.7, IRN: 1.0, PAK: 0.6, POL: 0.9, CZE: 0.8,
  NOR: 0.8, CHE: 0.7, AUS: 0.6, CAN: 0.6, NLD: 0.6, SGP: 0.7, ZAF: 0.6, PRK: 1.0, TWN: 0.8, BLR: 0.6,
  FIN: 0.6, EGY: 0.4, SAU: 0.3, ARE: 0.5, IDN: 0.4, SRB: 0.6, BGR: 0.5, ROU: 0.4,
};

/** Agricultural export orientation. */
export const AGRI_EXPORT: Record<string, number> = {
  USA: 1.5, BRA: 2.0, ARG: 2.0, AUS: 1.5, CAN: 1.4, UKR: 2.0, RUS: 1.3, FRA: 1.3, NZL: 1.8, THA: 1.4,
  VNM: 1.3, IND: 1.0, CHN: 0.9, IDN: 1.0, MYS: 1.3, KAZ: 1.3, NLD: 1.4, URY: 1.8, PRY: 1.8, ESP: 1.1,
  POL: 1.1, ROU: 1.2, HUN: 1.2, BGR: 1.2, CIV: 1.3, GHA: 1.2, ETH: 1.0, JPN: 0.35, KOR: 0.4, SAU: 0.2,
  ARE: 0.1, QAT: 0.05, KWT: 0.05, SGP: 0.02, ISR: 0.5, EGY: 0.6, DZA: 0.5, LBY: 0.2, GBR: 0.7, CHE: 0.6,
};

/** Trend real GDP growth (annual). */
export const TREND_GROWTH: Record<string, number> = {
  IND: 0.065, CHN: 0.04, IDN: 0.05, VNM: 0.06, BGD: 0.06, PHL: 0.055, EGY: 0.045, NGA: 0.035, ETH: 0.06,
  USA: 0.02, JPN: 0.008, DEU: 0.012, ITA: 0.007, FRA: 0.012, GBR: 0.014, RUS: 0.012, BRA: 0.022, MEX: 0.02,
  KOR: 0.02, TUR: 0.03, SAU: 0.03, ARG: 0.025, ZAF: 0.015, CAN: 0.018, AUS: 0.022, ESP: 0.018, POL: 0.028,
  PAK: 0.035, IRN: 0.02, KEN: 0.05, TZA: 0.055, CIV: 0.06, MYS: 0.04, THA: 0.03, COL: 0.03, CHL: 0.025,
};

/** Unemployment rate at start. */
export const UNEMPLOYMENT: Record<string, number> = {
  ZAF: 0.31, ESP: 0.11, GRC: 0.09, TUR: 0.09, BRA: 0.075, IND: 0.07, FRA: 0.072, ITA: 0.068, USA: 0.042,
  DEU: 0.035, JPN: 0.026, CHN: 0.05, RUS: 0.035, NGA: 0.18, IRN: 0.09, EGY: 0.07, SAU: 0.05, MEX: 0.03,
  KOR: 0.03, GBR: 0.045, CAN: 0.058, AUS: 0.04, POL: 0.03, ARG: 0.07, COL: 0.1, IRQ: 0.15, JOR: 0.2,
};

/** Warship name prefixes. */
export const SHIP_PREFIX: Record<string, string> = {
  USA: 'USS', GBR: 'HMS', CAN: 'HMCS', AUS: 'HMAS', NZL: 'HMNZS', IND: 'INS', JPN: 'JS', FRA: 'FS', DEU: 'FGS',
  ITA: 'ITS', ESP: 'ESPS', KOR: 'ROKS', TUR: 'TCG', RUS: 'RFS', CHN: 'PLANS', PAK: 'PNS', IDN: 'KRI', PHL: 'BRP',
  THA: 'HTMS', MYS: 'KD', SGP: 'RSS', ISR: 'INS', NLD: 'HNLMS', DNK: 'HDMS', NOR: 'HNoMS', SWE: 'HSwMS',
  POL: 'ORP', GRC: 'HS', PRT: 'NRP', TWN: 'ROCS', IRN: 'IRIS', EGY: 'ENS', ZAF: 'SAS', ARG: 'ARA', PER: 'BAP',
  COL: 'ARC', BRA: 'NAM', CHL: 'CNS', MEX: 'ARM', VNM: 'HQ', BGD: 'BNS', LKA: 'SLNS', SAU: 'HMS',
};

export interface RealStats {
  debtRatio: number;
  interest: number;
  trendGrowth: number;
  unemployment: number;
}

export function realStats(code: string, dev: number, hash: number): RealStats {
  return {
    debtRatio: DEBT_RATIO[code] ?? 0.3 + 0.4 * dev + 0.2 * hash,
    interest: INTEREST_RATE[code] ?? 0.025 + 0.07 * (1 - dev) * (0.6 + 0.8 * hash),
    trendGrowth: TREND_GROWTH[code] ?? 0.014 + 0.035 * (1 - dev) * (0.7 + 0.6 * hash),
    unemployment: UNEMPLOYMENT[code] ?? 0.035 + 0.08 * (1 - dev) * (0.5 + hash),
  };
}
