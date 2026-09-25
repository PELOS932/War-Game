import { RNG } from '../core/rng';

/**
 * Character-level Markov name generator. Each culture is trained on a small
 * corpus of invented place-name-like words; output is filtered so it never
 * repeats a training word verbatim.
 */

interface CultureDef {
  name: string;
  corpus: string;
  nationSuffixes: string[];
  firstNames: string[];
  adjSuffix: string[];
}

export const CULTURES: CultureDef[] = [
  {
    name: 'Nordic',
    corpus: 'haldor svenmark ostergard lindholm rosendal kalmark vesteras nordvik sandefjor tromsvik eskilstad brandholm falkenborg grunwald hohenfels kirchbeck lauterbach mittenwald rotenburg schonfeld tannheim waldkirch ehrenfeld dornbach alstermark bergholm dalvik egersund fjellstad gislaved hammarby jorvik kungsholm lodvik oskarholm ringsted skagerik torshavik uddevalla varberg ystadt aalborg hjorring solvik frostad isenholm',
    nationSuffixes: ['ia', 'land', 'mark', 'heim', 'ria'],
    firstNames: ['Erik', 'Astrid', 'Magnus', 'Ingrid', 'Henrik', 'Sigrid', 'Lars', 'Freya', 'Olaf', 'Katrin', 'Anders', 'Helga', 'Stefan', 'Maren'],
    adjSuffix: ['ian', 'ish', 'ic'],
  },
  {
    name: 'Latin',
    corpus: 'valdoria castellano monterosa santarem vilanova albaceta bellaterra caravaggio doralisa estrella florenza granadina lusitano marbella novaterra oliveira portalegre quintana ravenna salvadora tolvedo umbriano valencio verona zaragosa aurelia belmonte cortona duarte esperanza fontana guarda lorena mirando navarra orvieto palmira sorrento tavares viseu albarino corvara solerno',
    nationSuffixes: ['ia', 'a', 'ora', 'ana', 'era'],
    firstNames: ['Mateo', 'Lucia', 'Alvaro', 'Isabela', 'Rafael', 'Carmen', 'Diego', 'Valeria', 'Marco', 'Giulia', 'Andres', 'Elena', 'Tomas', 'Beatriz'],
    adjSuffix: ['an', 'ese', 'ian'],
  },
  {
    name: 'Slavic',
    corpus: 'borovsk czerniak dobrograd gorodnya kalinovka lesnoy mirograd novgorin olshany pereslav rostovka smolensky tverskoy velikoye yaroslava zelenogorsk bryansko chernovka drozdovo gradishte kozelsk lubovna medvezhye orlovka pskovets radomir sosnovka tomashov uglichy vyshgorod zvenigrad belogorsk krasnoyar stravinsk volodarsk bialystok przemka',
    nationSuffixes: ['ia', 'ovia', 'avia', 'ystan', 'ina'],
    firstNames: ['Dmitri', 'Anya', 'Mikhail', 'Natalya', 'Pavel', 'Irina', 'Boris', 'Oksana', 'Viktor', 'Milena', 'Stanislav', 'Olga', 'Yuri', 'Katya'],
    adjSuffix: ['ian', 'ic', 'an'],
  },
  {
    name: 'Arabic',
    corpus: 'alqasira bahrimah darassim farazad hadiyah jabalur kashvar marabad nasirah qadiyan rashidun samarqal tabrizan zahirah almunir baysan dhahrani esfandar ghazira isfahar kermanshir mashadan najafar qazvani shirazan yazdabad zarqan hamadir khorasar ardabil sulaymar tarifah wadiyah',
    nationSuffixes: ['stan', 'iyah', 'ar', 'ia', 'an'],
    firstNames: ['Tariq', 'Layla', 'Karim', 'Yasmin', 'Farid', 'Samira', 'Omar', 'Nadia', 'Rashid', 'Zahra', 'Hassan', 'Amira', 'Dariush', 'Soraya'],
    adjSuffix: ['i', 'ani', 'ian'],
  },
  {
    name: 'EastAsian',
    corpus: 'shanxiao haiyang longmen qingshan baozhou tianhai yunling jinhua kaoshan nanling wuhai xiamen daegu hanseong jeonju suwon tokamura hakone kiyosato matsuyama nagahara sakurai takayama yokohara minato kanazu rinhae bailong fenghuang guilin changmo seoryeong',
    nationSuffixes: ['', '', 'ou', 'an', 'eon'],
    firstNames: ['Wei', 'Mei', 'Jun', 'Hana', 'Hiroshi', 'Yuki', 'Min-jun', 'Seo-yeon', 'Chen', 'Lan', 'Kenji', 'Sora', 'Tae-ho', 'Lin'],
    adjSuffix: ['ese', 'an', 'i'],
  },
  {
    name: 'African',
    corpus: 'mbandaka kisanga lubumbo ndolani tamale zambeze bamaku kigoma mwanza nakuru oyomba ruvuma sokoti tabora umtata zomba kasama lilongo mbeya nzega ibadu kumasi onitsha makeni bouake gulu kabale moroto ngozi abomey kanemba sahelo tumbara',
    nationSuffixes: ['a', 'i', 'ia', 'we', 'ga'],
    firstNames: ['Kwame', 'Amara', 'Tendai', 'Nia', 'Sekou', 'Zawadi', 'Jabari', 'Imani', 'Kofi', 'Ayo', 'Babatunde', 'Chiamaka', 'Moussa', 'Fatou'],
    adjSuffix: ['an', 'ian', 'i'],
  },
  {
    name: 'Indic',
    corpus: 'rajpur chandrapur devgarh haripur jaisalar kanpuri lakshmipur madhuban nagapur pratapgarh ramnagar sitapur udaipura varanpur amravati bharatpur durgapur gopalganj indrapur jhansi kolhapur mirzapur nandigram patiala rewati shivpuri tirupati vellore anandpur bilaspur',
    nationSuffixes: ['desh', 'pur', 'a', 'stan', 'garh'],
    firstNames: ['Arjun', 'Priya', 'Vikram', 'Ananya', 'Rohan', 'Kavya', 'Rahul', 'Meera', 'Sanjay', 'Divya', 'Aditya', 'Lakshmi', 'Nikhil', 'Pooja'],
    adjSuffix: ['i', 'ian', 'an'],
  },
  {
    name: 'Anglo',
    corpus: 'ashford brighton carlisle dunmore everton fairhaven glenwood hartford kingsbridge lancastor millbrook northamber oakridge penrith redwater stanford thornbury wexford westbury ashbourne blackwater clearwater easton greystone hollowell kenmore lindfield marlow newhaven rosewood',
    nationSuffixes: ['land', 'ia', 'shire', 'mont', 'ria'],
    firstNames: ['James', 'Charlotte', 'William', 'Eleanor', 'Thomas', 'Olivia', 'Henry', 'Grace', 'Edward', 'Amelia', 'Jack', 'Victoria', 'Samuel', 'Harriet'],
    adjSuffix: ['ish', 'ian', 'er'],
  },
  {
    name: 'Turkic',
    corpus: 'almatau bishkara karatau ordabay shymkala tarazan aktobe balkhash dzhambul ekibas kyzylorda naryn oshkent semey termez urgench zhezkent karshi nukus tashkala kokand andijan bukhara samarkal yarkent turkestan qaraghan',
    nationSuffixes: ['stan', 'ia', 'ar', 'kent', 'an'],
    firstNames: ['Nurlan', 'Aigerim', 'Timur', 'Dinara', 'Erlan', 'Saule', 'Bakhyt', 'Gulnara', 'Askar', 'Madina', 'Rustam', 'Zarina', 'Daniyar', 'Aizhan'],
    adjSuffix: ['i', 'ian', 'ek'],
  },
  {
    name: 'Austronesian',
    corpus: 'kalamaku honolua mauiloa tahanui rarotoa palawan surabaya bandungan makassar semarang pakanbaru kupang manado ternate ambon lomboki kediri malang madiun cirebon waikato tauranga motuhaka kailua pagaru selatan',
    nationSuffixes: ['a', 'nesia', 'ua', 'ia', 'ki'],
    firstNames: ['Kai', 'Leilani', 'Rizal', 'Putri', 'Mana', 'Aroha', 'Budi', 'Sari', 'Tane', 'Ari', 'Wiremu', 'Dewi', 'Hemi', 'Ayu'],
    adjSuffix: ['an', 'ese', 'i'],
  },
];

class MarkovModel {
  private order: number;
  private table = new Map<string, string[]>();
  readonly words: Set<string>;

  constructor(corpus: string[], order = 2) {
    this.order = order;
    this.words = new Set(corpus);
    for (const word of corpus) {
      const padded = '^'.repeat(order) + word + '$';
      for (let i = 0; i < padded.length - order; i++) {
        const key = padded.slice(i, i + order);
        const next = padded[i + order];
        let arr = this.table.get(key);
        if (!arr) { arr = []; this.table.set(key, arr); }
        arr.push(next);
      }
    }
  }

  generate(rng: RNG, minLen: number, maxLen: number): string {
    for (let attempt = 0; attempt < 60; attempt++) {
      let key = '^'.repeat(this.order);
      let out = '';
      for (let i = 0; i < maxLen + 2; i++) {
        const arr = this.table.get(key);
        if (!arr) break;
        const c = rng.pick(arr);
        if (c === '$') break;
        out += c;
        key = (key + c).slice(-this.order);
      }
      if (out.length >= minLen && out.length <= maxLen && !this.words.has(out)) return out;
    }
    return 'nova';
  }
}

export function capitalize(s: string): string {
  return s
    .split(/([ -])/)
    .map((p) => (p.length > 0 && p !== ' ' && p !== '-' ? p[0].toUpperCase() + p.slice(1) : p))
    .join('');
}

export class NameGenerator {
  private models: MarkovModel[];
  private used = new Set<string>();

  constructor() {
    this.models = CULTURES.map((c) => new MarkovModel(c.corpus.split(/\s+/).filter(Boolean), 2));
  }

  private unique(gen: () => string): string {
    for (let i = 0; i < 40; i++) {
      const s = gen();
      if (!this.used.has(s)) {
        this.used.add(s);
        return s;
      }
    }
    const s = gen() + ' ' + (this.used.size % 97);
    this.used.add(s);
    return s;
  }

  place(culture: number, rng: RNG): string {
    return this.unique(() => capitalize(this.models[culture].generate(rng, 4, 10)));
  }

  nationRoot(culture: number, rng: RNG): { name: string; adjective: string } {
    const c = CULTURES[culture];
    let result = { name: '', adjective: '' };
    this.unique(() => {
      let root = this.models[culture].generate(rng, 3, 7);
      // Trim trailing vowels before adding a suffix so names read naturally.
      const suffix = rng.pick(c.nationSuffixes);
      if (suffix && /^[aeiou]/.test(suffix)) root = root.replace(/[aeiouy]+$/, '');
      if (root.length < 3) root = root + 'or';
      const name = capitalize(root + suffix);
      let adjRoot = name.replace(/(ia|a|land|stan|desh|shire|heim|mark|iyah|nesia|ua|e|i|o)$/i, '');
      if (adjRoot.length < 3) adjRoot = name;
      const adj = /stan$/i.test(name) ? name.replace(/stan$/i, '') + 'stani' : adjRoot + rng.pick(c.adjSuffix);
      result = { name, adjective: capitalize(adj) };
      return name;
    });
    return result;
  }

  person(culture: number, rng: RNG): string {
    const c = CULTURES[culture];
    const first = rng.pick(c.firstNames);
    const last = capitalize(this.models[culture].generate(rng, 4, 9));
    return `${first} ${last}`;
  }
}

const BLOC_A = ['Atlantic', 'Northern', 'Pacific', 'Continental', 'Southern', 'Eastern', 'Western', 'Oceanic', 'Allied', 'Collective'];
const BLOC_B = ['Treaty Organization', 'Defense Compact', 'Security Alliance', 'Mutual Defense Pact', 'Union', 'Concord', 'Coalition', 'Cooperation Council'];

export function blocName(rng: RNG, used: Set<string>): { name: string; short: string } {
  for (let i = 0; i < 50; i++) {
    const a = rng.pick(BLOC_A);
    const b = rng.pick(BLOC_B);
    const name = `${a} ${b}`;
    if (used.has(a)) continue;
    used.add(a);
    const short = name
      .split(' ')
      .filter((w) => w.length > 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
    return { name, short };
  }
  return { name: 'Grand Alliance', short: 'GA' };
}
