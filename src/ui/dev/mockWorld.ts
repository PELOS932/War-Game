/**
 * DEV ONLY — builds a coarse real-Earth WorldData (1° hexes) in the browser by
 * rasterising world-atlas country outlines. Used to exercise the UI before the
 * real world builder / simulation / renderer are available.
 */
import { feature } from 'topojson-client';
import { HexGrid } from '../../core/hex';
import { Noise2D } from '../../core/noise';
import { RNG } from '../../core/rng';
import {
  BlocSeed, CitySeed, FlagSpec, Government, NationSeed, Terrain, WorldData, WorldSettings, Deposit,
  worldWidth, worldHeight,
} from '../../worldgen/types';

interface Known {
  code: string;
  pop: number;
  gdp: number;
  mil: number;
  gov: Government;
  title: string;
  leader: string;
  blocs: string[];
  color: [number, number, number];
  flag: FlagSpec;
  cap: [string, number, number];
  nuclear?: boolean;
  tech?: number;
  navy?: number;
  air?: number;
  formal?: string;
  adj?: string;
}

const hs = (colors: string[], ratios?: number[]): FlagSpec => ({ layout: 'hstripes', colors, ratios });
const vs = (colors: string[], ratios?: number[]): FlagSpec => ({ layout: 'vstripes', colors, ratios });

const KNOWN: Record<string, Known> = {
  'United States of America': { code: 'USA', pop: 350, gdp: 32000, mil: 1330, gov: Government.PresidentialRepublic, title: 'President', leader: 'Daniel Whitmore', blocs: ['NATO'], color: [70, 110, 190], flag: { layout: 'starsStripes', colors: ['#b22234', '#ffffff'], accent: '#3c3b6e' }, cap: ['Washington', -77.04, 38.9], nuclear: true, tech: 0.95, navy: 10, air: 10, formal: 'United States of America', adj: 'American' },
  China: { code: 'CHN', pop: 1400, gdp: 25000, mil: 2035, gov: Government.OneParty, title: 'President', leader: 'Zhao Weiming', blocs: ['SCO', 'BRICS'], color: [200, 70, 60], flag: { layout: 'plain', colors: ['#de2910'], emblems: [{ shape: 'star', color: '#ffde00', x: 0.17, y: 0.27, size: 0.3 }] }, cap: ['Beijing', 116.4, 39.9], nuclear: true, tech: 0.85, navy: 8, air: 8, formal: "People's Republic of China", adj: 'Chinese' },
  Russia: { code: 'RUS', pop: 140, gdp: 2300, mil: 1150, gov: Government.PresidentialRepublic, title: 'President', leader: 'Mikhail Voronov', blocs: ['CSTO', 'SCO', 'BRICS'], color: [110, 150, 90], flag: hs(['#ffffff', '#0039a6', '#d52b1e']), cap: ['Moscow', 37.6, 55.75], nuclear: true, tech: 0.8, navy: 7, air: 8, formal: 'Russian Federation', adj: 'Russian' },
  India: { code: 'IND', pop: 1520, gdp: 6500, mil: 1460, gov: Government.FederalRepublic, title: 'Prime Minister', leader: 'Arjun Mehta', blocs: ['SCO', 'BRICS'], color: [230, 150, 60], flag: { ...hs(['#ff9933', '#ffffff', '#138808']), emblems: [{ shape: 'wheel', color: '#000080', x: 0.5, y: 0.5, size: 0.28 }] }, cap: ['New Delhi', 77.2, 28.6], nuclear: true, tech: 0.65, navy: 6, air: 6, formal: 'Republic of India', adj: 'Indian' },
  Germany: { code: 'DEU', pop: 83, gdp: 5400, mil: 190, gov: Government.FederalRepublic, title: 'Chancellor', leader: 'Katrin Albrecht', blocs: ['NATO', 'EU'], color: [150, 150, 150], flag: hs(['#000000', '#dd0000', '#ffce00']), cap: ['Berlin', 13.4, 52.5], tech: 0.9, navy: 4, air: 5, formal: 'Federal Republic of Germany', adj: 'German' },
  France: { code: 'FRA', pop: 69, gdp: 3800, mil: 205, gov: Government.PresidentialRepublic, title: 'President', leader: 'Claire Dubois', blocs: ['NATO', 'EU'], color: [80, 90, 200], flag: vs(['#0055a4', '#ffffff', '#ef4135']), cap: ['Paris', 2.35, 48.85], nuclear: true, tech: 0.88, navy: 6, air: 6, formal: 'French Republic', adj: 'French' },
  'United Kingdom': { code: 'GBR', pop: 70, gdp: 4200, mil: 150, gov: Government.ConstitutionalMonarchy, title: 'Prime Minister', leader: 'James Hartley', blocs: ['NATO'], color: [200, 60, 90], flag: { layout: 'union', colors: ['#012169', '#ffffff', '#c8102e'] }, cap: ['London', -0.12, 51.5], nuclear: true, tech: 0.9, navy: 7, air: 6, formal: 'United Kingdom of Great Britain and Northern Ireland', adj: 'British' },
  Japan: { code: 'JPN', pop: 120, gdp: 4600, mil: 250, gov: Government.ConstitutionalMonarchy, title: 'Prime Minister', leader: 'Hiroshi Tanaka', blocs: [], color: [230, 200, 210], flag: { layout: 'plain', colors: ['#ffffff'], emblems: [{ shape: 'circle', color: '#bc002d', x: 0.5, y: 0.5, size: 0.6 }] }, cap: ['Tokyo', 139.7, 35.7], tech: 0.92, navy: 7, air: 6, formal: 'Japan', adj: 'Japanese' },
  Brazil: { code: 'BRA', pop: 222, gdp: 2600, mil: 370, gov: Government.FederalRepublic, title: 'President', leader: 'Rafael Oliveira', blocs: ['BRICS'], color: [90, 180, 90], flag: { layout: 'plain', colors: ['#009c3b'], emblems: [{ shape: 'circle', color: '#002776', x: 0.5, y: 0.5, size: 0.5 }] }, cap: ['Brasília', -47.9, -15.8], tech: 0.6, navy: 4, air: 4, formal: 'Federative Republic of Brazil', adj: 'Brazilian' },
  Canada: { code: 'CAN', pop: 43, gdp: 2700, mil: 70, gov: Government.ConstitutionalMonarchy, title: 'Prime Minister', leader: 'Emily Tremblay', blocs: ['NATO'], color: [210, 90, 80], flag: { ...vs(['#d52b1e', '#ffffff', '#d52b1e'], [1, 2, 1]), emblems: [{ shape: 'leaf', color: '#d52b1e', x: 0.5, y: 0.5, size: 0.5 }] }, cap: ['Ottawa', -75.7, 45.4], tech: 0.88, navy: 3, air: 3, formal: 'Canada', adj: 'Canadian' },
  Mexico: { code: 'MEX', pop: 136, gdp: 2100, mil: 280, gov: Government.FederalRepublic, title: 'President', leader: 'Sofía Hernández', blocs: [], color: [120, 160, 80], flag: vs(['#006847', '#ffffff', '#ce1126']), cap: ['Mexico City', -99.1, 19.4], tech: 0.55, navy: 2, air: 2, formal: 'United Mexican States', adj: 'Mexican' },
  Turkey: { code: 'TUR', pop: 88, gdp: 1500, mil: 355, gov: Government.PresidentialRepublic, title: 'President', leader: 'Mehmet Aydın', blocs: ['NATO'], color: [200, 110, 70], flag: { layout: 'plain', colors: ['#e30a17'], emblems: [{ shape: 'crescentStar', color: '#ffffff', x: 0.4, y: 0.5, size: 0.5 }] }, cap: ['Ankara', 32.85, 39.93], tech: 0.62, navy: 4, air: 5, formal: 'Republic of Türkiye', adj: 'Turkish' },
  Iran: { code: 'IRN', pop: 92, gdp: 480, mil: 610, gov: Government.Theocracy, title: 'Supreme Leader', leader: 'Ali Rezaei', blocs: ['SCO'], color: [70, 160, 110], flag: hs(['#239f40', '#ffffff', '#da0000']), cap: ['Tehran', 51.4, 35.7], tech: 0.5, navy: 2, air: 3, formal: 'Islamic Republic of Iran', adj: 'Iranian' },
  Ukraine: { code: 'UKR', pop: 36, gdp: 250, mil: 700, gov: Government.PresidentialRepublic, title: 'President', leader: 'Oleksandr Kovalenko', blocs: [], color: [230, 210, 80], flag: hs(['#0057b7', '#ffd700']), cap: ['Kyiv', 30.5, 50.45], tech: 0.55, navy: 1, air: 3, formal: 'Ukraine', adj: 'Ukrainian' },
  Poland: { code: 'POL', pop: 37, gdp: 1100, mil: 200, gov: Government.Democracy, title: 'Prime Minister', leader: 'Tomasz Nowak', blocs: ['NATO', 'EU'], color: [220, 100, 120], flag: hs(['#ffffff', '#dc143c']), cap: ['Warsaw', 21, 52.23], tech: 0.72, navy: 1, air: 3, formal: 'Republic of Poland', adj: 'Polish' },
  Italy: { code: 'ITA', pop: 58, gdp: 2600, mil: 165, gov: Government.Democracy, title: 'Prime Minister', leader: 'Marco Rinaldi', blocs: ['NATO', 'EU'], color: [110, 190, 120], flag: vs(['#009246', '#ffffff', '#ce2b37']), cap: ['Rome', 12.5, 41.9], tech: 0.82, navy: 4, air: 4, formal: 'Italian Republic', adj: 'Italian' },
  Spain: { code: 'ESP', pop: 48, gdp: 1900, mil: 120, gov: Government.ConstitutionalMonarchy, title: 'Prime Minister', leader: 'Lucía Martín', blocs: ['NATO', 'EU'], color: [230, 180, 60], flag: hs(['#aa151b', '#f1bf00', '#aa151b'], [1, 2, 1]), cap: ['Madrid', -3.7, 40.4], tech: 0.8, navy: 3, air: 3, formal: 'Kingdom of Spain', adj: 'Spanish' },
  'Saudi Arabia': { code: 'SAU', pop: 38, gdp: 1350, mil: 260, gov: Government.AbsoluteMonarchy, title: 'King', leader: 'Faisal bin Khalid', blocs: ['ARAB'], color: [80, 150, 80], flag: { layout: 'plain', colors: ['#006c35'] }, cap: ['Riyadh', 46.7, 24.7], tech: 0.55, navy: 2, air: 5, formal: 'Kingdom of Saudi Arabia', adj: 'Saudi' },
  Egypt: { code: 'EGY', pop: 120, gdp: 520, mil: 440, gov: Government.PresidentialRepublic, title: 'President', leader: 'Karim Mansour', blocs: ['AU', 'ARAB'], color: [210, 190, 110], flag: hs(['#ce1126', '#ffffff', '#000000']), cap: ['Cairo', 31.2, 30.05], tech: 0.45, navy: 3, air: 4, formal: 'Arab Republic of Egypt', adj: 'Egyptian' },
  Australia: { code: 'AUS', pop: 29, gdp: 2200, mil: 60, gov: Government.ConstitutionalMonarchy, title: 'Prime Minister', leader: 'Liam Carter', blocs: [], color: [230, 160, 90], flag: { layout: 'plain', colors: ['#012169'], emblems: [{ shape: 'star', color: '#ffffff', x: 0.25, y: 0.75, size: 0.3 }] }, cap: ['Canberra', 149.1, -35.3], tech: 0.88, navy: 4, air: 4, formal: 'Commonwealth of Australia', adj: 'Australian' },
  Indonesia: { code: 'IDN', pop: 295, gdp: 2000, mil: 400, gov: Government.PresidentialRepublic, title: 'President', leader: 'Budi Santoso', blocs: ['ASEAN'], color: [200, 80, 80], flag: hs(['#ff0000', '#ffffff']), cap: ['Jakarta', 106.8, -6.2], tech: 0.5, navy: 3, air: 3, formal: 'Republic of Indonesia', adj: 'Indonesian' },
  Pakistan: { code: 'PAK', pop: 265, gdp: 480, mil: 650, gov: Government.Democracy, title: 'Prime Minister', leader: 'Imran Qureshi', blocs: ['SCO'], color: [60, 130, 70], flag: { ...vs(['#ffffff', '#01411c'], [1, 3]), emblems: [{ shape: 'crescentStar', color: '#ffffff', x: 0.62, y: 0.5, size: 0.5 }] }, cap: ['Islamabad', 73, 33.7], nuclear: true, tech: 0.45, navy: 2, air: 4, formal: 'Islamic Republic of Pakistan', adj: 'Pakistani' },
  Nigeria: { code: 'NGA', pop: 262, gdp: 620, mil: 145, gov: Government.FederalRepublic, title: 'President', leader: 'Chinedu Okafor', blocs: ['AU'], color: [90, 170, 90], flag: vs(['#008751', '#ffffff', '#008751']), cap: ['Abuja', 7.5, 9.06], tech: 0.35, navy: 1, air: 1, formal: 'Federal Republic of Nigeria', adj: 'Nigerian' },
  'South Africa': { code: 'ZAF', pop: 65, gdp: 520, mil: 75, gov: Government.Democracy, title: 'President', leader: 'Thabo Nkosi', blocs: ['AU', 'BRICS'], color: [230, 160, 60], flag: hs(['#e03c31', '#ffffff', '#007749', '#ffffff', '#001489'], [3, 1, 3, 1, 3]), cap: ['Pretoria', 28.2, -25.75], tech: 0.55, navy: 1, air: 2, formal: 'Republic of South Africa', adj: 'South African' },
  Argentina: { code: 'ARG', pop: 48, gdp: 700, mil: 80, gov: Government.FederalRepublic, title: 'President', leader: 'Martín Gómez', blocs: [], color: [140, 190, 230], flag: { ...hs(['#74acdf', '#ffffff', '#74acdf']), emblems: [{ shape: 'sun', color: '#f6b40e', x: 0.5, y: 0.5, size: 0.28 }] }, cap: ['Buenos Aires', -58.4, -34.6], tech: 0.55, navy: 1, air: 1, formal: 'Argentine Republic', adj: 'Argentine' },
  'South Korea': { code: 'KOR', pop: 51, gdp: 2300, mil: 500, gov: Government.PresidentialRepublic, title: 'President', leader: 'Park Ji-hoon', blocs: [], color: [100, 140, 220], flag: { layout: 'plain', colors: ['#ffffff'], emblems: [{ shape: 'circle', color: '#cd2e3a', x: 0.5, y: 0.5, size: 0.5 }] }, cap: ['Seoul', 126.98, 37.57], tech: 0.9, navy: 4, air: 5, formal: 'Republic of Korea', adj: 'South Korean' },
  'North Korea': { code: 'PRK', pop: 27, gdp: 30, mil: 1280, gov: Government.OneParty, title: 'Supreme Leader', leader: 'Kim Jong-su', blocs: [], color: [160, 60, 80], flag: hs(['#024fa2', '#ffffff', '#ed1c27', '#ffffff', '#024fa2'], [4, 1, 12, 1, 4]), cap: ['Pyongyang', 125.75, 39.03], nuclear: true, tech: 0.35, navy: 2, air: 2, formal: "Democratic People's Republic of Korea", adj: 'North Korean' },
  Israel: { code: 'ISR', pop: 11, gdp: 700, mil: 170, gov: Government.Democracy, title: 'Prime Minister', leader: 'David Levi', blocs: [], color: [120, 160, 230], flag: { ...hs(['#ffffff', '#0038b8', '#ffffff', '#0038b8', '#ffffff'], [1, 1, 5, 1, 1]), emblems: [{ shape: 'star', color: '#0038b8', x: 0.5, y: 0.5, size: 0.35 }] }, cap: ['Jerusalem', 35.2, 31.78], nuclear: true, tech: 0.92, navy: 2, air: 6, formal: 'State of Israel', adj: 'Israeli' },
  Sweden: { code: 'SWE', pop: 11, gdp: 750, mil: 25, gov: Government.ConstitutionalMonarchy, title: 'Prime Minister', leader: 'Anders Lindqvist', blocs: ['NATO', 'EU'], color: [90, 140, 200], flag: { layout: 'nordic', colors: ['#006aa7', '#fecc00'] }, cap: ['Stockholm', 18.07, 59.33], tech: 0.9, navy: 2, air: 3, formal: 'Kingdom of Sweden', adj: 'Swedish' },
  Norway: { code: 'NOR', pop: 5.8, gdp: 620, mil: 25, gov: Government.ConstitutionalMonarchy, title: 'Prime Minister', leader: 'Ingrid Solberg', blocs: ['NATO'], color: [200, 90, 90], flag: { layout: 'nordic', colors: ['#ba0c2f', '#ffffff', '#00205b'] }, cap: ['Oslo', 10.75, 59.91], tech: 0.9, navy: 2, air: 2, formal: 'Kingdom of Norway', adj: 'Norwegian' },
  Kazakhstan: { code: 'KAZ', pop: 21, gdp: 330, mil: 40, gov: Government.PresidentialRepublic, title: 'President', leader: 'Nursultan Abenov', blocs: ['CSTO', 'SCO'], color: [110, 190, 210], flag: { layout: 'plain', colors: ['#00afca'], emblems: [{ shape: 'sun', color: '#fec50c', x: 0.5, y: 0.45, size: 0.4 }] }, cap: ['Astana', 71.45, 51.17], tech: 0.5, navy: 0, air: 1, formal: 'Republic of Kazakhstan', adj: 'Kazakh' },
  Vietnam: { code: 'VNM', pop: 104, gdp: 700, mil: 480, gov: Government.OneParty, title: 'President', leader: 'Nguyen Van Minh', blocs: ['ASEAN'], color: [220, 100, 60], flag: { layout: 'plain', colors: ['#da251d'], emblems: [{ shape: 'star', color: '#ffff00', x: 0.5, y: 0.5, size: 0.55 }] }, cap: ['Hanoi', 105.85, 21.03], tech: 0.5, navy: 2, air: 2, formal: 'Socialist Republic of Vietnam', adj: 'Vietnamese' },
  Algeria: { code: 'DZA', pop: 50, gdp: 280, mil: 140, gov: Government.PresidentialRepublic, title: 'President', leader: 'Karim Benali', blocs: ['AU', 'ARAB'], color: [170, 200, 120], flag: vs(['#006233', '#ffffff']), cap: ['Algiers', 3.06, 36.75], tech: 0.45, navy: 1, air: 2, formal: "People's Democratic Republic of Algeria", adj: 'Algerian' },
  Ethiopia: { code: 'ETH', pop: 150, gdp: 250, mil: 160, gov: Government.FederalRepublic, title: 'Prime Minister', leader: 'Abiy Tesfaye', blocs: ['AU'], color: [200, 170, 80], flag: hs(['#078930', '#fcdd09', '#da121a']), cap: ['Addis Ababa', 38.75, 9.03], tech: 0.3, navy: 0, air: 1, formal: 'Federal Democratic Republic of Ethiopia', adj: 'Ethiopian' },
  Netherlands: { code: 'NLD', pop: 18, gdp: 1300, mil: 35, gov: Government.ConstitutionalMonarchy, title: 'Prime Minister', leader: 'Pieter de Vries', blocs: ['NATO', 'EU'], color: [240, 140, 60], flag: hs(['#ae1c28', '#ffffff', '#21468b']), cap: ['Amsterdam', 4.9, 52.37], tech: 0.9, navy: 2, air: 2, formal: 'Kingdom of the Netherlands', adj: 'Dutch' },
  Venezuela: { code: 'VEN', pop: 30, gdp: 110, mil: 120, gov: Government.PresidentialRepublic, title: 'President', leader: 'Diego Ramírez', blocs: [], color: [230, 190, 70], flag: hs(['#ffcc00', '#00247d', '#cf142b']), cap: ['Caracas', -66.9, 10.5], tech: 0.35, navy: 1, air: 1, formal: 'Bolivarian Republic of Venezuela', adj: 'Venezuelan' },
  Greece: { code: 'GRC', pop: 10, gdp: 290, mil: 140, gov: Government.Democracy, title: 'Prime Minister', leader: 'Nikos Papadakis', blocs: ['NATO', 'EU'], color: [110, 170, 230], flag: hs(['#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf']), cap: ['Athens', 23.73, 37.98], tech: 0.72, navy: 3, air: 3, formal: 'Hellenic Republic', adj: 'Greek' },
  Syria: { code: 'SYR', pop: 25, gdp: 25, mil: 170, gov: Government.PresidentialRepublic, title: 'President', leader: 'Omar Haddad', blocs: ['ARAB'], color: [180, 120, 110], flag: hs(['#ce1126', '#ffffff', '#000000']), cap: ['Damascus', 36.3, 33.5], tech: 0.3, navy: 0, air: 1, formal: 'Syrian Arab Republic', adj: 'Syrian' },
};

const BLOCS: Omit<BlocSeed, 'id' | 'leader'>[] = [
  { code: 'NATO', name: 'North Atlantic Treaty Organization', short: 'NATO', color: '#2c5aa0', military: true },
  { code: 'EU', name: 'European Union', short: 'EU', color: '#003399', military: false },
  { code: 'CSTO', name: 'Collective Security Treaty Organization', short: 'CSTO', color: '#a0302c', military: true },
  { code: 'SCO', name: 'Shanghai Cooperation Organisation', short: 'SCO', color: '#2c8a6a', military: false },
  { code: 'AU', name: 'African Union', short: 'AU', color: '#3a8a2c', military: false },
  { code: 'ASEAN', name: 'Association of Southeast Asian Nations', short: 'ASEAN', color: '#2c6aa0', military: false },
  { code: 'ARAB', name: 'Arab League', short: 'AL', color: '#2c7a3a', military: false },
  { code: 'BRICS', name: 'BRICS Economic Forum', short: 'BRICS', color: '#8a6a2c', military: false },
];

const EXTRA_CITIES: [string, string, number, number, number][] = [
  ['United States of America', 'New York', -74, 40.7, 20000], ['United States of America', 'Los Angeles', -118.2, 34.05, 13000], ['United States of America', 'Chicago', -87.6, 41.9, 9500], ['United States of America', 'Houston', -95.4, 29.76, 7500], ['United States of America', 'Seattle', -122.3, 47.6, 4200], ['United States of America', 'Miami', -80.2, 25.8, 6300], ['United States of America', 'Denver', -104.99, 39.74, 3000],
  ['China', 'Shanghai', 121.5, 31.2, 30000], ['China', 'Guangzhou', 113.3, 23.1, 20000], ['China', 'Chengdu', 104.07, 30.67, 17000], ['China', 'Wuhan', 114.3, 30.6, 12000], ['China', 'Harbin', 126.6, 45.75, 7000], ['China', 'Urumqi', 87.6, 43.8, 4500],
  ['Russia', 'Saint Petersburg', 30.3, 59.94, 5500], ['Russia', 'Novosibirsk', 82.9, 55.03, 1700], ['Russia', 'Yekaterinburg', 60.6, 56.84, 1600], ['Russia', 'Vladivostok', 131.9, 43.1, 600], ['Russia', 'Rostov-on-Don', 39.7, 47.24, 1200],
  ['India', 'Mumbai', 72.88, 19.07, 25000], ['India', 'Kolkata', 88.36, 22.57, 17000], ['India', 'Bengaluru', 77.6, 12.97, 16000], ['India', 'Chennai', 80.27, 13.08, 13000],
  ['Germany', 'Hamburg', 10, 53.55, 2000], ['Germany', 'Munich', 11.58, 48.14, 3000], ['France', 'Marseille', 5.37, 43.3, 1800], ['France', 'Lyon', 4.83, 45.76, 2300],
  ['United Kingdom', 'Manchester', -2.24, 53.48, 2900], ['Brazil', 'São Paulo', -46.6, -23.55, 23000], ['Brazil', 'Rio de Janeiro', -43.2, -22.9, 14000], ['Brazil', 'Manaus', -60, -3.1, 2500],
  ['Canada', 'Toronto', -79.4, 43.65, 7000], ['Canada', 'Vancouver', -123.1, 49.28, 3000], ['Mexico', 'Monterrey', -100.3, 25.67, 6000], ['Turkey', 'Istanbul', 28.98, 41.01, 17000],
  ['Iran', 'Isfahan', 51.67, 32.65, 2300], ['Ukraine', 'Kharkiv', 36.23, 49.99, 1400], ['Ukraine', 'Odesa', 30.73, 46.48, 1000], ['Japan', 'Osaka', 135.5, 34.69, 19000],
  ['Australia', 'Sydney', 151.2, -33.87, 5800], ['Australia', 'Perth', 115.86, -31.95, 2400], ['Egypt', 'Alexandria', 29.9, 31.2, 6000], ['Nigeria', 'Lagos', 3.38, 6.52, 21000],
  ['Pakistan', 'Karachi', 67, 24.86, 20000], ['Indonesia', 'Surabaya', 112.75, -7.25, 10000], ['Saudi Arabia', 'Jeddah', 39.2, 21.5, 5000], ['Kazakhstan', 'Almaty', 76.9, 43.24, 2200],
];

const GOV_TITLE: Record<number, string> = {
  [Government.Democracy]: 'Prime Minister', [Government.FederalRepublic]: 'President', [Government.ConstitutionalMonarchy]: 'Prime Minister',
  [Government.PresidentialRepublic]: 'President', [Government.OneParty]: 'Chairman', [Government.MilitaryJunta]: 'General', [Government.AbsoluteMonarchy]: 'King', [Government.Theocracy]: 'Supreme Leader',
};

const FIRST = ['Adrian', 'Elena', 'Victor', 'Amara', 'Tomas', 'Leila', 'Samuel', 'Nadia', 'Kofi', 'Mariam', 'Luis', 'Anya', 'Hassan', 'Irina', 'Pedro', 'Aisha', 'Viktor', 'Yuki'];
const LAST = ['Moreau', 'Kovac', 'Mensah', 'Haddad', 'Silva', 'Novak', 'Osei', 'Petrov', 'Rahman', 'Castillo', 'Lindgren', 'Abara', 'Farouk', 'Dimitrov', 'Okoro', 'Varga', 'Santos', 'Ivanova'];

export async function buildMockWorld(progress?: (s: string, f: number) => void): Promise<WorldData> {
  progress?.('Loading map data', 0.05);
  const topo = await import('world-atlas/countries-110m.json');
  const data = ((topo as { default?: unknown }).default ?? topo) as { objects: { countries: unknown } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fc = feature(data as any, data.objects.countries as any) as unknown as { features: { id?: string; properties: { name: string }; geometry: { type: string; coordinates: unknown } }[] };
  const cols = 360;
  const rows = 163;
  const settings: WorldSettings = {
    kind: 'earth', seed: 2030, cols, rows, latNorth: 84,
    latSouth: 84 - (1.5 * rows + 0.5) * (360 / (Math.sqrt(3) * (cols + 0.5))), lonWest: -180, lonEast: 180, landFraction: 0, nationCount: 0,
  };
  const grid = new HexGrid(cols, rows);
  const W = worldWidth(settings);
  const Hh = worldHeight(settings);
  const lonOf = (x: number) => settings.lonWest + (x / W) * 360;
  const latOf = (z: number) => settings.latNorth - (z / Hh) * (settings.latNorth - settings.latSouth);
  const xOf = (lon: number) => ((lon - settings.lonWest) / 360) * W;
  const zOf = (lat: number) => ((settings.latNorth - lat) / (settings.latNorth - settings.latSouth)) * Hh;

  // rasterise with isPointInPath on a scratch canvas in lon/lat space (scaled x10)
  const cnv = document.createElement('canvas');
  cnv.width = 4;
  cnv.height = 4;
  const ctx = cnv.getContext('2d') as CanvasRenderingContext2D;
  const owner = new Uint16Array(grid.count);
  const feats = fc.features.filter((f) => f.properties.name !== 'Antarctica' && f.properties.name !== 'Fr. S. Antarctic Lands');
  progress?.('Rasterising borders', 0.15);
  feats.forEach((f, fi) => {
    const polys: number[][][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
    for (const poly of polys) {
      const path = new Path2D();
      let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
      for (const ring of poly) {
        ring.forEach(([lon, lat], i) => {
          if (i === 0) path.moveTo(lon * 10, -lat * 10);
          else path.lineTo(lon * 10, -lat * 10);
          if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        });
        path.closePath();
      }
      const r0 = Math.max(0, Math.floor(zOf(maxLat) / 1.5) - 1);
      const r1 = Math.min(rows - 1, Math.ceil(zOf(minLat) / 1.5) + 1);
      const c0 = Math.max(0, Math.floor(xOf(minLon) / Math.sqrt(3)) - 1);
      const c1 = Math.min(cols - 1, Math.ceil(xOf(maxLon) / Math.sqrt(3)) + 1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        if (owner[i]) continue;
        const lon = lonOf(grid.cx[i]);
        const lat = latOf(grid.cz[i]);
        if (ctx.isPointInPath(path, lon * 10, -lat * 10, 'evenodd')) owner[i] = fi + 1;
      }
    }
  });

  progress?.('Founding nations', 0.35);
  const rng = new RNG(2030);
  const noise = new Noise2D(rng.fork(1));
  // nation seeds (only features with at least one hex, or known)
  const featToNation = new Int32Array(feats.length + 1).fill(-1);
  const counts = new Int32Array(feats.length + 1);
  for (let i = 0; i < owner.length; i++) counts[owner[i]]++;
  const nations: NationSeed[] = [];
  const blocs: BlocSeed[] = BLOCS.map((b, i) => ({ ...b, id: i, leader: -1 }));
  const blocIdx = new Map(BLOCS.map((b, i) => [b.code, i]));
  feats.forEach((f, fi) => {
    const name = f.properties.name;
    const k = KNOWN[name];
    if (!counts[fi + 1] && !k) return;
    const id = nations.length;
    featToNation[fi + 1] = id;
    const hexCount = counts[fi + 1];
    const r2 = rng.fork(fi + 7);
    const pop = k?.pop ?? Math.max(0.3, hexCount * r2.range(0.05, 1.2));
    const dev = k ? Math.min(1, Math.log10(Math.max(1, (k.gdp * 1000) / k.pop)) / 5) : r2.range(0.15, 0.6);
    const gdp = k?.gdp ?? Math.max(2, pop * Math.pow(10, dev * 5) / 1000 * r2.range(0.6, 1.4));
    const gov = k?.gov ?? r2.pick([Government.Democracy, Government.PresidentialRepublic, Government.PresidentialRepublic, Government.OneParty, Government.MilitaryJunta, Government.AbsoluteMonarchy, Government.FederalRepublic]);
    const hue = r2.range(0, 360);
    const col = hslToRgb(hue, 0.42, 0.55);
    nations.push({
      id, code: k?.code ?? name.slice(0, 3).toUpperCase(), name: name.replace('Dem. Rep.', 'DR').replace('Rep.', 'Republic'),
      formalName: k?.formal ?? `Republic of ${name}`, adjective: k?.adj ?? name + 'ian', culture: fi % 8,
      capitalHex: -1, capitalName: k?.cap[0] ?? name + ' City', color: k?.color ?? col,
      flag: k?.flag ?? randomFlag(r2), government: gov, leaderTitle: k?.title ?? GOV_TITLE[gov], leaderName: k?.leader ?? `${r2.pick(FIRST)} ${r2.pick(LAST)}`,
      population: pop, gdp, activeMilitary: k?.mil ?? Math.round(pop * r2.range(1, 6)), defenseBudget: r2.range(1, 4),
      techLevel: k?.tech ?? dev * 0.8, nuclear: !!k?.nuclear, navyRating: k?.navy ?? r2.int(0, 2), airRating: k?.air ?? r2.int(0, 2),
      development: dev, aggression: r2.range(0.1, 0.7), ideology: gov <= 3 ? r2.range(0.2, 1) : r2.range(-1, -0.1),
      blocs: (k?.blocs ?? (r2.chance(0.4) ? [lonOf(0) > 0 ? 'AU' : 'AU'] : [])).map((b) => blocIdx.get(b) ?? -1).filter((b) => b >= 0),
      militarism: r2.range(0.2, 0.8), navalFocus: r2.range(0, 1), hexCount,
    });
  });
  const hexOwner = new Uint16Array(grid.count);
  for (let i = 0; i < owner.length; i++) if (owner[i]) hexOwner[i] = featToNation[owner[i]] + 1;

  // Africa / Asia / Americas bloc assignment for unknown nations based on capital position
  progress?.('Placing cities', 0.5);
  const cities: CitySeed[] = [];
  const hexCity = new Int32Array(grid.count).fill(-1);
  const addCity = (nation: number, name: string, lon: number, lat: number, pop: number, capital: boolean) => {
    let hx = grid.fromWorld(xOf(lon), zOf(lat));
    if (hx < 0 || hexOwner[hx] !== nation + 1) {
      // snap to nearest owned hex
      let best = -1, bd = 1e9;
      grid.forRadius(Math.max(0, hx), 6, (j) => {
        if (hexOwner[j] === nation + 1) {
          const d = (grid.cx[j] - xOf(lon)) ** 2 + (grid.cz[j] - zOf(lat)) ** 2;
          if (d < bd) { bd = d; best = j; }
        }
      });
      if (best < 0) return -1;
      hx = best;
    }
    if (hexCity[hx] >= 0) return hexCity[hx];
    const id = cities.length;
    cities.push({ id, name, hex: hx, nation, population: pop, capital, port: false, urbanHexes: [hx], x: grid.cx[hx], z: grid.cz[hx], gridAngle: 0 });
    hexCity[hx] = id;
    return id;
  };
  // centroid for capitals of unknown nations
  const sumX = new Float64Array(nations.length), sumZ = new Float64Array(nations.length), cnt = new Int32Array(nations.length);
  for (let i = 0; i < grid.count; i++) if (hexOwner[i]) { const n = hexOwner[i] - 1; sumX[n] += grid.cx[i]; sumZ[n] += grid.cz[i]; cnt[n]++; }
  for (const n of nations) {
    const k = Object.values(KNOWN).find((kk) => kk.code === n.code && KNOWN[n.name] === kk);
    let cid = -1;
    if (k) cid = addCity(n.id, k.cap[0], k.cap[1], k.cap[2], Math.round(n.population * 60), true);
    if (cid < 0 && cnt[n.id]) {
      const cx = sumX[n.id] / cnt[n.id], cz = sumZ[n.id] / cnt[n.id];
      cid = addCity(n.id, n.capitalName, lonOf(cx), latOf(cz), Math.round(n.population * 60), true);
    }
    if (cid >= 0) { n.capitalHex = cities[cid].hex; n.capitalName = cities[cid].name; cities[cid].capital = true; }
  }
  for (const [nat, name, lon, lat, pop] of EXTRA_CITIES) {
    const n = nations.find((x) => x.name === nat);
    if (n) addCity(n.id, name, lon, lat, pop, false);
  }

  progress?.('Shaping terrain', 0.65);
  const hexTerrain = new Uint8Array(grid.count);
  const hexElevation = new Float32Array(grid.count);
  const hexPopulation = new Float32Array(grid.count);
  const hexDeposit = new Uint8Array(grid.count);
  const hexDepositSize = new Float32Array(grid.count);
  const hexTemperature = new Float32Array(grid.count);
  const hexPrecip = new Float32Array(grid.count);
  const hexCoast = new Uint8Array(grid.count);
  const hexForest = new Uint8Array(grid.count);
  for (let i = 0; i < grid.count; i++) {
    const lat = latOf(grid.cz[i]);
    const lon = lonOf(grid.cx[i]);
    const nz = noise.fbm(lon * 0.05, lat * 0.05, 4);
    const land = hexOwner[i] > 0;
    const temp = 28 - Math.abs(lat) * 0.55 + nz * 6;
    hexTemperature[i] = temp;
    hexPrecip[i] = Math.max(50, 900 + noise.fbm(lon * 0.03 + 9, lat * 0.03, 3) * 900 - (Math.abs(Math.abs(lat) - 25) < 8 ? 500 : 0));
    if (!land) {
      let coast = false;
      for (let d = 0; d < 6; d++) { const nb = grid.neighbours[i * 6 + d]; if (nb >= 0 && hexOwner[nb]) coast = true; }
      hexTerrain[i] = coast ? Terrain.Coastal : Terrain.DeepOcean;
      hexElevation[i] = coast ? -80 : -3500 + nz * 1000;
      continue;
    }
    for (let d = 0; d < 6; d++) { const nb = grid.neighbours[i * 6 + d]; if (nb >= 0 && !hexOwner[nb]) hexCoast[i] = 1; }
    const ridge = noise.ridged(lon * 0.045 + 3, lat * 0.045, 4);
    const elev = Math.max(5, 200 + nz * 400 + ridge * ridge * 3000);
    hexElevation[i] = elev;
    let t: Terrain;
    if (Math.abs(lat) > 72) t = Terrain.Ice;
    else if (elev > 2200) t = Terrain.Mountains;
    else if (elev > 1100) t = Terrain.Hills;
    else if (temp < -2) t = Terrain.Tundra;
    else if (hexPrecip[i] < 350) t = Terrain.Desert;
    else if (temp > 22 && hexPrecip[i] > 1300) t = Terrain.Jungle;
    else if (hexPrecip[i] > 1000) t = Terrain.Forest;
    else if (noise.noise(lon * 0.2, lat * 0.2) > 0.55) t = Terrain.Marsh;
    else t = nz > 0.1 ? Terrain.Farmland : Terrain.Plains;
    hexTerrain[i] = t;
    hexForest[i] = t === Terrain.Forest || t === Terrain.Jungle ? 200 : 20;
    const n = hexOwner[i] - 1;
    hexPopulation[i] = (nations[n].population * 1000) / Math.max(1, cnt[n]) * (0.3 + Math.max(0, nz + 0.6));
    const dr = noise.noise(lon * 0.3 + 77, lat * 0.3);
    if (dr > 0.72) { hexDeposit[i] = 1 + (i % 4); hexDepositSize[i] = dr; }
  }
  for (const c of cities) {
    hexTerrain[c.hex] = Terrain.Urban;
    hexPopulation[c.hex] = c.population;
    c.port = !!hexCoast[c.hex];
  }

  progress?.('Diplomatic relations', 0.8);
  const n = nations.length;
  const relations = new Int8Array(n * n);
  const code = (s: string) => nations.findIndex((x) => x.code === s);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    if (a === b) { relations[a * n + b] = 100; continue; }
    let r = Math.round(noise.noise(a * 0.37, b * 0.37) * 25);
    const shared = nations[a].blocs.filter((x) => nations[b].blocs.includes(x));
    for (const s of shared) r += blocs[s].military ? 55 : 20;
    relations[a * n + b] = Math.max(-100, Math.min(100, r));
  }
  const setRel = (x: string, y: string, v: number) => {
    const a = code(x), b = code(y);
    if (a >= 0 && b >= 0) { relations[a * n + b] = v; relations[b * n + a] = v; }
  };
  setRel('USA', 'RUS', -55); setRel('USA', 'CHN', -35); setRel('USA', 'IRN', -80); setRel('USA', 'PRK', -90);
  setRel('RUS', 'UKR', -95); setRel('IND', 'PAK', -70); setRel('ISR', 'IRN', -90); setRel('KOR', 'PRK', -85);
  setRel('USA', 'GBR', 85); setRel('USA', 'JPN', 75); setRel('USA', 'KOR', 70); setRel('USA', 'ISR', 70);
  setRel('RUS', 'CHN', 55); setRel('CHN', 'PRK', 50); setRel('SAU', 'IRN', -60); setRel('GRC', 'TUR', -30);
  for (const b of blocs) {
    const leaderCode = { NATO: 'USA', EU: 'DEU', CSTO: 'RUS', SCO: 'CHN', AU: 'NGA', ASEAN: 'IDN', ARAB: 'SAU', BRICS: 'CHN' }[b.code];
    if (leaderCode) b.leader = code(leaderCode);
  }
  progress?.('Done', 1);
  const tiny = (len: number) => new Float32Array(len);
  return {
    settings: { ...settings, nationCount: n },
    hw: 2, hh: 2, elevation: tiny(4), temperature: tiny(4), precipitation: tiny(4), biome: new Uint8Array(4), albedo: new Uint8Array(16), climateTex: new Uint8Array(16), waterLevel: tiny(4),
    rivers: [], lakes: [],
    hexTerrain, hexElevation, hexOwner, hexPopulation, hexRiverEdges: new Uint8Array(grid.count), hexRoad: new Uint8Array(grid.count), hexRail: new Uint8Array(grid.count),
    hexDeposit, hexDepositSize, hexForest, hexTemperature, hexPrecip, hexHabitability: new Float32Array(grid.count), hexCity, hexCoast,
    nations, blocs, cities, roads: [], rails: [], relations, claims: nations.map(() => new Int32Array(0)),
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function randomFlag(r: RNG): FlagSpec {
  const pal = ['#ce1126', '#ffffff', '#000000', '#007a3d', '#fcd116', '#0038a8', '#ef7d00', '#6cace4', '#8a1538'];
  const c = r.shuffle([...pal]).slice(0, 3);
  return r.chance(0.5) ? hs(c) : vs(c);
}

export const DEPOSIT_KINDS = [Deposit.None, Deposit.Oil, Deposit.Coal, Deposit.Ore, Deposit.Uranium];
