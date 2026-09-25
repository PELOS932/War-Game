/**
 * Real-world nations (2030 estimates), blocs and initial relation overrides for
 * the Earth scenario. Rows live in countries-*.ts (layout documented in build.ts);
 * capital coordinates come from the capital entry in cities.ts.
 * Validate with: npx tsx scripts/data-check.ts
 */
import type { BlocData, CountryData, RelationOverride } from './schema';
import { buildCountry } from './build';
import { CITIES } from './cities';
import { EUROPE } from './countries-europe';
import { ASIA } from './countries-asia';
import { AFRICA } from './countries-africa';
import { AMERICAS } from './countries-americas';

function build(): CountryData[] {
  const list = [...EUROPE, ...ASIA, ...AFRICA, ...AMERICAS].map(buildCountry);
  for (const c of list) {
    const cap =
      CITIES.find((ct) => ct.country === c.code && ct.capital) ??
      CITIES.find((ct) => ct.country === c.code && ct.name === c.capital) ??
      CITIES.find((ct) => ct.country === c.code);
    if (cap) {
      c.capitalLat = cap.lat;
      c.capitalLon = cap.lon;
    }
  }
  return list;
}

export const COUNTRIES: CountryData[] = build();

export const BLOCS: BlocData[] = [
  { code: 'NATO', name: 'North Atlantic Treaty Organization', short: 'NATO', color: '#2b5ba8', military: true, leader: 'USA' },
  { code: 'EU', name: 'European Union', short: 'EU', color: '#ffcc00', military: false, leader: 'DEU' },
  { code: 'CSTO', name: 'Collective Security Treaty Organization', short: 'CSTO', color: '#9b2226', military: true, leader: 'RUS' },
  { code: 'SCO', name: 'Shanghai Cooperation Organisation', short: 'SCO', color: '#2a9d8f', military: false, leader: 'CHN' },
  { code: 'BRICS', name: 'BRICS', short: 'BRICS', color: '#e76f51', military: false, leader: 'CHN' },
  { code: 'GCC', name: 'Gulf Cooperation Council', short: 'GCC', color: '#2d6a4f', military: true, leader: 'SAU' },
  { code: 'ARAB', name: 'Arab League', short: 'Arab League', color: '#6a994e', military: false, leader: 'EGY' },
  { code: 'ASEAN', name: 'Association of Southeast Asian Nations', short: 'ASEAN', color: '#f4a261', military: false, leader: 'IDN' },
  { code: 'AU', name: 'African Union', short: 'AU', color: '#3a7d44', military: false, leader: 'ZAF' },
  { code: 'ECOWAS', name: 'Economic Community of West African States', short: 'ECOWAS', color: '#7b9e3c', military: false, leader: 'NGA' },
  { code: 'AES', name: 'Alliance of Sahel States', short: 'AES', color: '#8d5524', military: true, leader: 'MLI' },
  { code: 'MERCOSUR', name: 'Southern Common Market', short: 'MERCOSUR', color: '#0077b6', military: false, leader: 'BRA' },
  { code: 'ANZUS', name: 'ANZUS Security Treaty', short: 'ANZUS', color: '#5e60ce', military: true, leader: 'USA' },
  { code: 'AUKUS', name: 'AUKUS Security Partnership', short: 'AUKUS', color: '#48cae4', military: false, leader: 'USA' },
];

export const RELATION_OVERRIDES: RelationOverride[] = [
  // --- US alliance network ---
  ['USA', 'GBR', 90], ['USA', 'CAN', 70], ['USA', 'ISR', 85], ['USA', 'JPN', 85], ['USA', 'KOR', 80],
  ['USA', 'AUS', 88], ['USA', 'NZL', 70], ['USA', 'TWN', 75], ['USA', 'PHL', 75], ['USA', 'POL', 80],
  ['USA', 'DEU', 65], ['USA', 'FRA', 60], ['USA', 'ITA', 65], ['USA', 'SAU', 55], ['USA', 'ARE', 60],
  ['USA', 'QAT', 55], ['USA', 'BHR', 60], ['USA', 'KWT', 60], ['USA', 'JOR', 60], ['USA', 'EGY', 40],
  ['USA', 'IND', 45], ['USA', 'MEX', 40], ['USA', 'UKR', 55], ['USA', 'COL', 35], ['USA', 'SGP', 60],
  ['USA', 'VNM', 25], ['USA', 'ARG', 60], ['USA', 'MAR', 50], ['USA', 'BLR', -45], ['USA', 'NIC', -40],
  // --- Europe & Anglosphere ---
  ['GBR', 'FRA', 60], ['GBR', 'AUS', 85], ['GBR', 'CAN', 85], ['GBR', 'NZL', 85], ['GBR', 'UKR', 75],
  ['GBR', 'POL', 70], ['FRA', 'DEU', 80], ['DEU', 'POL', 60], ['FRA', 'IND', 55], ['FRA', 'UKR', 65],
  ['DEU', 'UKR', 65], ['POL', 'UKR', 60], ['AUS', 'NZL', 90], ['GRC', 'CYP', 90], ['FIN', 'SWE', 85],
  ['NOR', 'SWE', 80], ['EST', 'FIN', 80], ['LTU', 'POL', 75], ['CAN', 'UKR', 60], ['GBR', 'JPN', 60],
  // --- Indo-Pacific partners ---
  ['JPN', 'AUS', 70], ['JPN', 'KOR', 45], ['JPN', 'TWN', 60], ['JPN', 'PHL', 60], ['IND', 'JPN', 60],
  ['IND', 'RUS', 50], ['IND', 'ISR', 55], ['IND', 'BTN', 80], ['IND', 'NPL', 40], ['IND', 'LKA', 40],
  ['AUS', 'PHL', 50], ['AUS', 'PNG', 60], ['IND', 'VNM', 45],
  // --- Russia / China axis ---
  ['RUS', 'BLR', 90], ['CHN', 'PAK', 85], ['CHN', 'RUS', 75], ['RUS', 'PRK', 70], ['CHN', 'PRK', 55],
  ['RUS', 'IRN', 60], ['CHN', 'IRN', 50], ['RUS', 'KAZ', 55], ['RUS', 'SRB', 55], ['RUS', 'VEN', 45],
  ['RUS', 'CUB', 55], ['RUS', 'NIC', 50], ['CHN', 'KHM', 70], ['CHN', 'LAO', 60], ['CHN', 'MMR', 50],
  ['CHN', 'SRB', 50], ['CHN', 'BLR', 60], ['RUS', 'MLI', 55], ['RUS', 'BFA', 50], ['RUS', 'NER', 50],
  ['RUS', 'CAF', 55], ['RUS', 'TJK', 55], ['RUS', 'KGZ', 55], ['RUS', 'ARM', 10], ['IRN', 'IRQ', 45],
  ['IRN', 'YEM', 50], ['IRN', 'VEN', 40], ['CHN', 'BRA', 40], ['RUS', 'SYR', -10], ['IRN', 'SYR', -40],
  // --- Middle East partnerships ---
  ['SAU', 'ARE', 60], ['SAU', 'EGY', 60], ['SAU', 'PAK', 75], ['TUR', 'AZE', 90], ['TUR', 'PAK', 65],
  ['TUR', 'QAT', 70], ['TUR', 'SYR', 60], ['AZE', 'ISR', 50], ['AZE', 'PAK', 60], ['ISR', 'ARE', 45],
  ['ISR', 'BHR', 35], ['ISR', 'MAR', 30], ['EGY', 'ISR', 15], ['JOR', 'ISR', 10], ['EGY', 'SDN', 50],
  ['EGY', 'ERI', 45],
  // --- Hostilities & rivalries ---
  ['RUS', 'UKR', -90], ['RUS', 'USA', -55], ['RUS', 'GBR', -65], ['RUS', 'POL', -70], ['RUS', 'LTU', -65],
  ['RUS', 'LVA', -60], ['RUS', 'EST', -65], ['RUS', 'FIN', -55], ['RUS', 'GEO', -50], ['RUS', 'DEU', -45],
  ['RUS', 'FRA', -45], ['RUS', 'SWE', -50], ['RUS', 'JPN', -30], ['BLR', 'UKR', -55], ['BLR', 'POL', -50],
  ['BLR', 'LTU', -45], ['CHN', 'TWN', -85], ['CHN', 'USA', -45], ['CHN', 'JPN', -45], ['CHN', 'IND', -35],
  ['CHN', 'PHL', -50], ['CHN', 'VNM', -15], ['CHN', 'AUS', -20], ['CHN', 'LTU', -30], ['IND', 'PAK', -80],
  ['AFG', 'PAK', -45], ['KOR', 'PRK', -85], ['JPN', 'PRK', -75], ['USA', 'PRK', -85], ['ISR', 'IRN', -95],
  ['ISR', 'PSE', -80], ['ISR', 'LBN', -60], ['ISR', 'SYR', -45], ['ISR', 'YEM', -70], ['ISR', 'TUR', -40],
  ['ISR', 'IRQ', -50], ['USA', 'IRN', -80], ['SAU', 'IRN', -30], ['ARE', 'IRN', -20], ['BHR', 'IRN', -45],
  ['SAU', 'YEM', -50], ['USA', 'YEM', -55], ['ARM', 'AZE', -40], ['ARM', 'TUR', -30], ['MAR', 'DZA', -60],
  ['SRB', 'KOS', -70], ['ETH', 'ERI', -65], ['EGY', 'ETH', -45], ['ETH', 'SOM', -20], ['VEN', 'GUY', -60],
  ['USA', 'VEN', -50], ['USA', 'CUB', -60], ['GRC', 'TUR', -25], ['CYP', 'TUR', -50], ['COD', 'RWA', -60],
  ['BDI', 'RWA', -40], ['SDN', 'ARE', -35], ['KHM', 'THA', -40], ['AFG', 'IRN', -15], ['MLI', 'DZA', -40],
  ['MLI', 'FRA', -50], ['NER', 'FRA', -50], ['BFA', 'FRA', -45], ['BFA', 'CIV', -30], ['NER', 'BEN', -35],
  ['ARG', 'GBR', -35], ['UKR', 'PRK', -60], ['UKR', 'IRN', -50], ['SDN', 'SSD', -20],
];
