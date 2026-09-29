/**
 * Hand-authored skyline profiles for real cities (approximate counts, ~2030).
 * Keyed by `ISO3|CityName` exactly as in cities.ts. A city with no entry has no
 * skyscrapers at all and simply gets the fabric of its regional default style.
 *
 *  towers150 - buildings >= 150 m      towers100 - buildings >= 100 m
 *  tallest   - height of the tallest building (m)
 *  style     - drives colours, storey heights and block layout in the renderer
 *  landmarks - simple signature shapes (and layout flags such as cbd-offset)
 */
export type SkylineStyle =
  | 'gulf-supertall'
  | 'asian-megacity'
  | 'american-downtown'
  | 'european-cbd'
  | 'latin-dense'
  | 'soviet-blocks'
  | 'european-historic'
  | 'south-asian-dense'
  | 'african-growing'
  | 'mena-dense'
  | 'japan-dense'
  | 'korean-apartments'
  | 'lowrise';

export type Landmark = 'eiffel' | 'burj' | 'cn-tower' | 'kremlin' | 'dome' | 'minarets' | 'pagoda' | 'bridge' | 'cathedral';

export interface SkylineProfile {
  towers150: number;
  towers100: number;
  tallest: number;
  style: SkylineStyle;
  landmarks: Landmark[];
  /** Tower cluster sits outside the (low, historic) centre, like La Défense. */
  cbdOffset: boolean;
}

const S: Record<string, SkylineStyle> = {
  g: 'gulf-supertall', a: 'asian-megacity', u: 'american-downtown', e: 'european-cbd', l: 'latin-dense',
  s: 'soviet-blocks', h: 'european-historic', d: 'south-asian-dense', f: 'african-growing', m: 'mena-dense',
  j: 'japan-dense', k: 'korean-apartments', w: 'lowrise',
};
const LM = new Set(['eiffel', 'burj', 'cn-tower', 'kremlin', 'dome', 'minarets', 'pagoda', 'bridge', 'cathedral']);

// ISO|Name|towers150|towers100|tallest(m)|style|landmarks,flags
const RAW = `
ARE|Dubai|280|480|828|g|burj;ARE|Abu Dhabi|55|150|381|g;ARE|Sharjah|4|30|205|m;ARE|Al Ain|0|5|110|m
QAT|Doha|55|110|300|g;KWT|Kuwait City|12|45|412|g;KWT|Ahmadi|0|0|45|m;BHR|Manama|20|45|260|g;OMN|Muscat|0|8|130|m|minarets
SAU|Riyadh|22|65|385|g;SAU|Jeddah|12|40|260|g;SAU|Mecca|15|40|601|m|minarets;SAU|Medina|0|3|120|m|minarets;SAU|Dammam|2|8|165|g;SAU|Taif|0|0|60|m
IRQ|Baghdad|0|3|115|m|minarets;IRQ|Erbil|0|3|110|m;IRN|Tehran|8|30|436|m|cn-tower;IRN|Mashhad|0|4|130|m|minarets;IRN|Isfahan|0|1|100|m|dome;IRN|Shiraz|0|1|100|m;IRN|Tabriz|0|2|100|m
TUR|Istanbul|45|200|300|m|minarets,bridge;TUR|Ankara|2|25|170|m;TUR|Izmir|3|20|200|m;TUR|Antalya|0|5|110|m;TUR|Bursa|0|6|130|m;TUR|Adana|0|4|110|m
TUR|Gaziantep|0|3|120|m;TUR|Konya|0|4|110|m;TUR|Kayseri|0|2|100|m;TUR|Mersin|1|6|150|m;TUR|Samsun|0|3|100|m
ISR|Tel Aviv|26|80|238|e;ISR|Jerusalem|0|4|120|m|dome;ISR|Haifa|0|5|130|m;JOR|Amman|3|14|200|m;LBN|Beirut|3|18|200|m;SYR|Damascus|0|1|80|m|minarets
EGY|Cairo|12|60|393|m|minarets;EGY|Alexandria|0|6|130|m
IND|Mumbai|90|300|320|d;IND|New Delhi|22|110|250|d;IND|Bangalore|5|60|180|d;IND|Chennai|4|40|200|d;IND|Hyderabad|6|55|200|d;IND|Kolkata|4|25|262|d
IND|Pune|4|40|190|d;IND|Ahmedabad|1|18|170|d;IND|Surat|2|15|170|d;IND|Thane|5|45|190|d;IND|Ghaziabad|1|10|120|d;IND|Faridabad|0|4|110|d;IND|Jaipur|0|8|120|d
IND|Lucknow|0|5|120|d;IND|Kochi|1|12|150|d;IND|Nagpur|0|4|110|d;IND|Indore|0|6|110|d;IND|Bhopal|0|1|100|d;IND|Visakhapatnam|0|3|100|d;IND|Patna|0|3|100|d;IND|Chandigarh|0|2|100|d
PAK|Karachi|4|30|300|d;PAK|Lahore|1|15|180|d;PAK|Islamabad|2|10|170|d;BGD|Dhaka|3|30|200|d;BGD|Chittagong|0|5|100|d;LKA|Colombo|3|20|350|d|cn-tower;NPL|Kathmandu|0|2|100|d
SGP|Singapore|140|450|290|a;MYS|Kuala Lumpur|110|260|679|a;MYS|Johor Bahru|6|25|280|a;MYS|George Town|3|20|250|a;MYS|Ipoh|0|3|100|a;MYS|Kota Kinabalu|0|6|120|a;MYS|Kuching|0|3|100|a;MYS|Klang|0|3|100|a
IDN|Jakarta|120|300|382|a;IDN|Surabaya|6|40|200|a;IDN|Bandung|0|10|150|a;IDN|Medan|2|12|180|a;IDN|Tangerang|12|40|250|a;IDN|Semarang|0|6|110|a;IDN|Makassar|1|10|165|a;IDN|Palembang|0|3|100|a;IDN|Batam|0|4|100|a;IDN|Depok|0|3|100|a
THA|Bangkok|90|300|314|a;THA|Pattaya|12|60|240|a;THA|Phuket|0|3|100|a;THA|Chiang Mai|0|2|100|a;THA|Hat Yai|0|2|100|a;THA|Khon Kaen|0|1|100|a
VNM|Ho Chi Minh City|30|100|461|a;VNM|Hanoi|18|70|350|a;VNM|Da Nang|1|25|200|a;VNM|Hai Phong|1|8|150|a;VNM|Nha Trang|2|15|200|a;VNM|Can Tho|0|3|100|a;VNM|Bien Hoa|0|3|100|a;VNM|Vung Tau|0|5|100|a
KHM|Phnom Penh|6|18|220|a;MMR|Yangon|0|12|140|a;PHL|Manila|30|180|300|a;PHL|Cebu|0|8|150|a;PHL|Davao|0|3|100|a
CHN|Shanghai|175|560|632|a|cn-tower;CHN|Shenzhen|180|500|599|a;CHN|Hong Kong|130|480|484|a;CHN|Guangzhou|110|350|530|a|cn-tower;CHN|Beijing|70|250|528|a|pagoda
CHN|Chongqing|110|400|470|a;CHN|Tianjin|65|230|530|a;CHN|Chengdu|60|220|468|a;CHN|Wuhan|65|230|475|a;CHN|Xi'an|30|110|350|a|pagoda;CHN|Hangzhou|45|170|350|a|pagoda
CHN|Nanjing|55|180|450|a;CHN|Shenyang|35|120|350|a;CHN|Harbin|8|60|300|a;CHN|Dalian|30|100|383|a;CHN|Kunming|25|75|350|a;CHN|Qingdao|25|95|369|a;CHN|Xiamen|18|70|300|a
CHN|Suzhou|30|110|450|a;CHN|Dongguan|25|90|426|a;CHN|Foshan|20|70|335|a;CHN|Zhengzhou|25|110|280|a;CHN|Changsha|20|80|452|a;CHN|Jinan|15|55|340|a;CHN|Hefei|12|55|300|a
CHN|Fuzhou|10|55|300|a;CHN|Nanchang|12|45|303|a;CHN|Taiyuan|8|40|350|a;CHN|Shijiazhuang|8|35|260|a;CHN|Changchun|8|40|300|a;CHN|Nanning|20|60|402|a;CHN|Guiyang|20|65|401|a
CHN|Lanzhou|3|15|200|a;CHN|Hohhot|1|10|200|a;CHN|Yinchuan|1|6|150|a;CHN|Xining|0|8|150|a;CHN|Haikou|6|25|300|a;CHN|Sanya|0|8|150|a;CHN|Ningbo|15|60|300|a
CHN|Wuxi|25|70|328|a;CHN|Wenzhou|12|45|300|a;CHN|Zhuhai|15|50|300|a;CHN|Xuzhou|8|35|350|a;CHN|Luoyang|0|10|200|a;CHN|Tangshan|3|12|200|a;CHN|Baotou|0|5|150|a;CHN|Datong|0|3|120|a
CHN|Yantai|6|30|250|a;CHN|Weifang|3|12|200|a;CHN|Linyi|2|10|200|a;CHN|Zibo|2|10|200|a;CHN|Handan|2|10|200|a;CHN|Baoding|1|6|150|a;CHN|Dandong|0|4|150|a;CHN|Anshan|1|6|150|a
CHN|Fushun|0|4|100|a;CHN|Jilin|0|5|150|a;CHN|Daqing|0|5|120|a;CHN|Yichang|2|10|250|a;CHN|Xiangyang|1|8|150|a;CHN|Zhanjiang|2|10|150|a;CHN|Shantou|4|20|200|a;CHN|Huizhou|6|30|250|a
CHN|Quanzhou|6|25|250|a;CHN|Guilin|1|6|150|a;CHN|Liuzhou|3|12|200|a;CHN|Zunyi|2|10|150|a;CHN|Mianyang|2|8|150|a;CHN|Ordos|1|6|150|a;CHN|Changzhou|8|35|300|a;CHN|Nantong|8|35|300|a
CHN|Jiaxing|4|16|200|a;CHN|Shaoxing|4|16|200|a;CHN|Jinhua|3|12|200|a;CHN|Taizhou|4|14|200|a;CHN|Nanyang|1|6|150|a;CHN|Jining|2|8|150|a;CHN|Ürümqi|5|20|230|a;CHN|Lhasa|0|1|80|a|pagoda
TWN|Taipei|14|55|509|a;TWN|Kaohsiung|6|30|378|a;TWN|Taichung|6|40|300|a;TWN|Tainan|0|8|150|a;TWN|Hsinchu|0|8|130|a;TWN|Taoyuan|3|20|200|a
JPN|Tokyo|60|350|330|j|cn-tower;JPN|Yokohama|8|40|296|j;JPN|Osaka|18|85|300|j;JPN|Nagoya|8|40|247|j;JPN|Fukuoka|3|20|193|j;JPN|Sapporo|1|10|173|j;JPN|Sendai|1|8|180|j
JPN|Hiroshima|1|8|170|j;JPN|Kobe|2|12|160|j;JPN|Kyoto|0|3|131|j|pagoda;JPN|Saitama|2|12|155|j;JPN|Chiba|2|8|150|j;JPN|Kitakyushu|0|4|120|j;JPN|Niigata|0|4|140|j;JPN|Kumamoto|0|1|100|j
KOR|Seoul|45|200|555|k;KOR|Busan|35|110|411|k;KOR|Incheon|8|35|305|k;KOR|Daegu|1|18|233|k;KOR|Daejeon|0|6|130|k;KOR|Gwangju|0|4|130|k;KOR|Ulsan|0|6|130|k;KOR|Suwon|0|8|150|k
PRK|Pyongyang|3|30|330|s
RUS|Moscow|30|120|374|s|kremlin,cbd-offset;RUS|Saint Petersburg|4|25|462|h|dome,cbd-offset;RUS|Yekaterinburg|2|14|209|s;RUS|Novosibirsk|0|3|100|s;RUS|Kazan|0|3|100|s
RUS|Nizhny Novgorod|0|2|100|s;RUS|Samara|0|3|100|s;RUS|Krasnodar|0|3|100|s;RUS|Rostov-on-Don|0|1|100|s;RUS|Krasnoyarsk|0|1|100|s;RUS|Sochi|0|2|100|s
UKR|Kyiv|1|10|170|s;UKR|Kharkiv|0|2|100|s;UKR|Odesa|0|2|100|s;BLR|Minsk|0|4|130|s;LTU|Vilnius|0|4|129|s;LVA|Riga|0|3|123|h;EST|Tallinn|0|2|314|h
KAZ|Astana|5|30|310|s;KAZ|Almaty|1|14|200|s;KAZ|Shymkent|0|3|100|s;UZB|Tashkent|1|14|200|s;TJK|Dushanbe|0|3|100|s;TKM|Ashgabat|0|8|100|s;MNG|Ulaanbaatar|0|6|110|s
AZE|Baku|4|30|209|e;GEO|Tbilisi|0|3|100|s;GEO|Batumi|0|8|200|s;ARM|Yerevan|0|5|105|s
GBR|London|60|140|310|e|bridge,dome,cbd-offset;GBR|Manchester|6|24|201|e;GBR|Birmingham|1|14|170|e;GBR|Glasgow|0|5|130|h;GBR|Leeds|0|6|105|h;GBR|Liverpool|0|4|138|h
GBR|Portsmouth|1|1|170|h;GBR|Sheffield|0|3|100|h;GBR|Edinburgh|0|1|100|h|dome;IRL|Dublin|0|3|120|h
FRA|Paris|22|75|231|h|eiffel,dome,cbd-offset;FRA|Lyon|1|8|202|h;FRA|Marseille|0|4|147|h;FRA|Lille|0|3|120|h;FRA|Nice|0|1|100|h
DEU|Frankfurt|14|50|259|e;DEU|Berlin|0|8|138|h|cn-tower;DEU|Hamburg|0|5|130|h;DEU|Munich|0|6|146|h;DEU|Cologne|0|4|157|h|cathedral;DEU|Düsseldorf|0|5|170|h;DEU|Leipzig|0|3|142|h;DEU|Essen|0|2|120|h
ESP|Madrid|8|30|250|e|cbd-offset;ESP|Barcelona|1|5|172|h|cathedral;ESP|Valencia|0|4|130|h;ESP|Seville|1|1|178|h;ESP|Bilbao|1|3|165|h;ESP|Málaga|0|1|100|h
PRT|Lisbon|0|2|120|h|bridge;PRT|Porto|0|1|100|h
ITA|Milan|6|20|231|e|cbd-offset,cathedral;ITA|Rome|0|2|120|h|dome;ITA|Naples|0|3|129|h;ITA|Turin|1|4|209|h;ITA|Florence|0|0|60|h|dome;ITA|Genoa|0|2|100|h
NLD|Rotterdam|4|22|165|e|bridge;NLD|Amsterdam|1|8|150|h|cbd-offset;NLD|The Hague|0|9|142|h;NLD|Utrecht|0|4|110|h;NLD|Eindhoven|0|1|100|h
BEL|Brussels|0|6|150|h|cbd-offset;BEL|Antwerp|0|3|118|h;CHE|Zurich|0|3|126|h;CHE|Basel|1|4|178|h;LUX|Luxembourg|0|2|100|h
AUT|Vienna|2|10|250|h|cbd-offset,dome;SWE|Stockholm|0|8|155|h;SWE|Malmö|1|1|190|h;SWE|Gothenburg|0|2|100|h;NOR|Oslo|0|3|117|h;DNK|Copenhagen|0|2|110|h
POL|Warsaw|12|30|310|e;POL|Wrocław|1|3|212|h;POL|Kraków|0|2|100|h;POL|Katowice|0|2|100|h;CZE|Prague|0|2|110|h|dome;HUN|Budapest|0|2|100|h|dome;SVK|Bratislava|0|2|100|s
ROU|Bucharest|0|5|137|s;BGR|Sofia|0|1|100|s;SRB|Belgrade|2|8|168|s;HRV|Zagreb|0|2|100|h;GRC|Athens|0|1|100|h
USA|New York|320|850|541|u|bridge;USA|Chicago|120|350|442|u;USA|Houston|35|75|305|u;USA|Dallas|22|55|281|u;USA|Miami|60|140|300|u;USA|Atlanta|20|50|312|u;USA|Seattle|20|55|285|u
USA|San Francisco|45|100|326|u|bridge;USA|Los Angeles|30|90|335|u;USA|Denver|5|22|217|u;USA|Boston|25|60|241|u;USA|Phoenix|3|15|140|u;USA|Detroit|7|20|222|u;USA|San Diego|1|16|152|u
USA|Honolulu|3|10|160|u;USA|Minneapolis|6|20|241|u;USA|New Orleans|3|10|160|u;USA|Philadelphia|16|40|342|u;USA|Baltimore|3|14|161|u;USA|Tampa|3|14|170|u;USA|Orlando|3|12|170|u
USA|Charlotte|10|30|265|u;USA|Las Vegas|18|50|350|u;USA|Portland|2|10|170|u;USA|San Antonio|2|12|180|u;USA|Austin|8|30|210|u;USA|Sacramento|1|8|150|u;USA|St. Louis|2|9|190|u
USA|Pittsburgh|2|14|256|u;USA|Cincinnati|1|12|170|u;USA|Kansas City|3|14|190|u;USA|Columbus|1|12|150|u;USA|Indianapolis|1|10|250|u;USA|Cleveland|4|13|290|u;USA|Nashville|6|24|190|u
USA|Milwaukee|3|10|180|u;USA|Jacksonville|2|8|180|u;USA|Oklahoma City|3|10|260|u;USA|Raleigh|1|6|150|u;USA|Memphis|0|5|120|u;USA|Richmond|1|6|150|u;USA|Louisville|2|8|170|u
USA|Salt Lake City|2|8|170|u;USA|Birmingham|2|9|150|u;USA|Buffalo|1|4|150|u;USA|Hartford|1|6|160|u;USA|Omaha|2|6|180|u;USA|San Jose|1|10|150|u;USA|Tulsa|1|5|170|u
USA|Washington|2|18|170|u|cbd-offset,dome;USA|Providence|0|3|120|u;USA|Norfolk|0|3|130|u;USA|Albuquerque|0|2|100|u;USA|El Paso|0|2|100|u;USA|Fresno|0|2|100|u;USA|Baton Rouge|0|2|100|u
CAN|Toronto|70|300|298|u|cn-tower;CAN|Montreal|3|25|205|u;CAN|Vancouver|6|70|200|u;CAN|Calgary|8|30|247|u;CAN|Edmonton|2|12|150|u;CAN|Ottawa|0|3|110|u;CAN|Winnipeg|0|2|110|u;CAN|Hamilton|0|3|110|u
MEX|Mexico City|25|100|267|l;MEX|Monterrey|6|25|305|l;MEX|Guadalajara|1|10|170|l;MEX|Puebla|0|2|100|l;MEX|Tijuana|1|5|150|l;MEX|Querétaro|1|6|150|l;MEX|Cancún|0|8|120|l
PAN|Panama City|30|90|284|l;GTM|Guatemala City|0|4|110|l;DOM|Santo Domingo|1|10|165|l;CRI|San José|0|1|100|l;CUB|Havana|0|2|100|l
BRA|São Paulo|8|280|170|l;BRA|Rio de Janeiro|1|30|170|l;BRA|Belo Horizonte|0|10|120|l;BRA|Brasília|0|3|120|l;BRA|Curitiba|0|10|130|l;BRA|Porto Alegre|0|8|120|l;BRA|Salvador|1|20|150|l
BRA|Fortaleza|0|15|120|l;BRA|Recife|0|15|150|l;BRA|Goiânia|0|10|120|l;BRA|Santos|0|10|120|l;BRA|Campinas|0|12|120|l;BRA|Florianópolis|0|3|100|l
COL|Bogotá|1|25|216|l;COL|Medellín|0|10|175|l;COL|Cali|0|5|110|l;COL|Barranquilla|0|4|110|l;COL|Cartagena|0|8|180|l
VEN|Caracas|3|10|225|l;PER|Lima|3|30|200|l;CHL|Santiago|5|45|300|l;ARG|Buenos Aires|2|30|235|l;ARG|Córdoba|0|3|100|l;URY|Montevideo|0|3|158|l;ECU|Quito|0|3|110|l;ECU|Guayaquil|0|8|140|l
ZAF|Johannesburg|6|18|234|f;ZAF|Cape Town|0|3|139|f;ZAF|Durban|0|3|140|f;ZAF|Pretoria|0|1|100|f
NGA|Lagos|4|14|170|f;KEN|Nairobi|2|14|163|f;ETH|Addis Ababa|2|8|198|f;TZA|Dar es Salaam|0|3|130|f;GHA|Accra|0|4|100|f;AGO|Luanda|3|12|170|f;COD|Kinshasa|1|5|150|f;CIV|Abidjan|3|10|150|f
MAR|Casablanca|1|8|180|m|minarets;MAR|Rabat|1|3|250|m;DZA|Algiers|0|4|110|m;TUN|Tunis|0|5|120|m;RWA|Kigali|0|3|100|f;UGA|Kampala|0|3|100|f;MOZ|Maputo|0|3|100|f;SEN|Dakar|0|3|100|f
LBY|Tripoli|0|4|110|m;SDN|Khartoum|0|3|100|m
AUS|Sydney|12|65|309|u|bridge;AUS|Melbourne|45|150|317|u;AUS|Brisbane|8|50|274|u;AUS|Perth|4|25|249|u;AUS|Adelaide|0|6|130|u;AUS|Gold Coast|20|55|322|u;AUS|Newcastle|0|2|100|u
NZL|Auckland|1|8|328|u|cn-tower;NZL|Wellington|0|1|100|u;NZL|Christchurch|0|1|100|u
`;

const MAP = new Map<string, SkylineProfile>();
for (const row of RAW.split(/[;\n]/)) {
  const s = row.trim();
  if (!s) continue;
  const f = s.split('|');
  const [iso, name, t150, t100, tall, st, lm = ''] = f;
  const tokens = lm.split(',').filter(Boolean);
  MAP.set(`${iso}|${name}`, {
    towers150: Number(t150),
    towers100: Number(t100),
    tallest: Number(tall),
    style: S[st] ?? 'lowrise',
    landmarks: tokens.filter((t) => LM.has(t)) as Landmark[],
    cbdOffset: tokens.includes('cbd-offset'),
  });
}

/** Number of hand-profiled cities. */
export const SKYLINE_COUNT = MAP.size;

const REGION: Record<SkylineStyle, string> = {
  'european-historic': 'GBR IRL FRA ESP PRT ITA DEU NLD BEL LUX CHE AUT DNK NOR SWE FIN ISL MLT POL CZE HUN SVN HRV BIH MNE ALB MKD GRC CYP AND MCO LIE SMR VAT XKX',
  'soviet-blocks': 'RUS UKR BLR MDA LTU LVA EST KAZ UZB TKM KGZ TJK GEO ARM AZE MNG PRK SVK BGR ROU SRB',
  'latin-dense': 'MEX GTM BLZ HND SLV NIC CRI PAN CUB HTI DOM JAM BHS TTO BRB LCA VCT DMA KNA COL VEN GUY SUR BRA ECU PER BOL PRY ARG URY CHL',
  'south-asian-dense': 'IND PAK BGD LKA NPL BTN AFG MMR LAO KHM THA VNM IDN PHL MYS SGP BRN TLS MDV',
  'asian-megacity': 'CHN TWN HKG MAC',
  'japan-dense': 'JPN',
  'korean-apartments': 'KOR',
  'mena-dense': 'MAR DZA TUN LBY EGY SDN SYR LBN ISR PSE JOR IRQ IRN SAU KWT BHR QAT ARE OMN YEM TUR',
  'african-growing': 'SSD ETH ERI DJI SOM KEN UGA RWA BDI TZA COD COG GAB GNQ CMR CAF TCD NER MLI BFA MRT SEN GMB GNB GIN SLE LBR GHA TGO BEN NGA CIV CPV STP AGO ZMB MWI MOZ ZWE NAM BWA ZAF LSO SWZ MDG MUS SYC COM',
  'american-downtown': '', 'european-cbd': '', 'gulf-supertall': '', lowrise: '',
};
const ISO_STYLE = new Map<string, SkylineStyle>();
for (const [style, list] of Object.entries(REGION)) for (const iso of list.split(' ')) if (iso) ISO_STYLE.set(iso, style as SkylineStyle);

/** Regional default style for cities without a hand-authored profile. */
export function defaultStyle(iso: string): SkylineStyle {
  return ISO_STYLE.get(iso) ?? 'lowrise';
}

/** Profile for a city; unprofiled cities get no skyscrapers and a regional style. */
export function skylineFor(iso: string, name: string): SkylineProfile {
  return MAP.get(`${iso}|${name}`) ?? { towers150: 0, towers100: 0, tallest: 0, style: defaultStyle(iso), landmarks: [], cbdOffset: false };
}

export function hasSkyline(iso: string, name: string): boolean {
  return MAP.has(`${iso}|${name}`);
}

/** Keys of all hand-authored profiles (for validation scripts). */
export function skylineKeys(): string[] {
  return [...MAP.keys()];
}
