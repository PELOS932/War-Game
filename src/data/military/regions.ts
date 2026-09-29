/**
 * Region wiring: the regional data files are aggregated here. Each region
 * exports `DESIGNS` / `INVENTORY` (see schema.ts).
 */
import type { MilitaryDesign, NationInventory } from './schema';
import * as americas from './americas';
import * as asiaPacific from './asia_pacific';
import * as europe from './europe';
import * as eurasia from './eurasia_mideast_africa';

export interface RegionSource { name: string; DESIGNS: MilitaryDesign[]; INVENTORY: NationInventory[] }

export const REGIONS: RegionSource[] = [
  { name: 'americas', ...americas },
  { name: 'europe', ...europe },
  { name: 'eurasia_mideast_africa', ...eurasia },
  { name: 'asia_pacific', ...asiaPacific },
];

/**
 * Manual id aliases: an id referenced by one region but not defined anywhere ->
 * the closest defined design (or, failing that, a generic sim design of the
 * same category, e.g. 'frigate_g2').
 */
export const ALIASES: Record<string, string> = {
  f16v: 'f16v_block70',
  m113_apc: 'm113a3', m60a3_patton: 'm60t_sabra', m60a3: 'm60t_sabra', m60a1_patton: 'm60t_sabra', m270_mlrs: 'm270a2_mlrs',
  m109a6_paladin: 'm109a5_paladin', m109a6: 'm109a5_paladin', mim23_hawk: 'airdef_g1', hawk_mk128: 'airdef_g1', hawk_mk120: 'airdef_g1',
  damen_stan_patrol_4207: 'damen_stan_4207', mi24v_hind: 'mi24p', mi35p: 'mi24p', jas39_gripen_e: 'jas39e_gripen',
  su30mk2: 'su30sm2', su30mkk: 'su30sm2', su30mkm: 'su30sm2', fa18c_hornet: 'cf18_hornet', fa18c: 'cf18_hornet',
  m2a3_bradley: 'm2a4_bradley', m2_bradley: 'm2a4_bradley', gowind_2500: 'frigate_g3', fremm_frigate: 'frigate_g3', agosta_90b: 'submarine_g2',
  meko_a200: 'frigate_g3', meko_140: 'frigate_g2', p8a: 'p8a_poseidon', kfir_c10: 'kfir_c7', k8_karakorum: 'k8_karakoram', amx13: 'armor_g1',
  ah1f_cobra: 'ah1s_cobra', ah1w: 'ah1z_viper', c17_globemaster: 'c17a_globemaster_iii', mirage2000_5: 'mirage_2000c', mirage_2000_5: 'mirage_2000c',
  mirage_2000_9: 'mirage_2000c', mirage_5: 'mirage_2000c', mirage_f1: 'multirole_g1', ah64d: 'ah64e_apache_guardian', t54: 'armor_g1',
  erc90_sagaie: 'recon_g1', pc7_turbo_trainer: 'strike_g1', knox_class: 'frigate_g1', osa_ii: 'patrol_g1', fs1500_padilla: 'frigate_g1',
  t72b1: 't72m', amx30: 'armor_g1', s300vm: 's300v4', esmeraldas_corvette: 'frigate_g1', sk105_kurassier: 'armor_g1', as532_cougar: 'helicopter_g1',
  duke_class: 'type_23_duke', av8b_harrier_ii: 'multirole_g1', m1126_stryker: 'stryker_a1_icv', m777_howitzer: 'm777a2_howitzer', t80u: 't80bvm',
  t80ud: 't80bvm', m198_howitzer: 'artillery_g1', ch53k_yasur: 'helicopter_g3', challenger_1: 'challenger_2', f14a: 'fighter_g1', f4e_phantom: 'multirole_g1',
  f4ej_kai: 'multirole_g1', df_3a: 'missile_g1', f15sa: 'f15ex_eagle_ii', f15k: 'f15ex_eagle_ii', f15sg: 'f15ex_eagle_ii', ch4_rainbow: 'ch4',
  al_riyadh_class: 'frigate_g3', al_madinah_class: 'frigate_g3', al_zubarah_class: 'frigate_g3', badr_class: 'patrol_g2', piranha_iii_lav: 'piranha_iiic',
  mistral_lhd: 'amphib_g3', ambassador_iii: 'patrol_g2', c28a_corvette: 'frigate_g2', kalaat_beni_abbes: 'amphib_g2', vab_apc: 'vab',
  sigma_class: 'frigate_g3', floreal_class: 'frigate_g2', smerch: 'rocket_g2', rafale_m: 'rafale_f4', heron_mk2: 'drone_g2', talwar_class: 'frigate_g3',
  c130e: 'c130h_hercules', e2d: 'transport_g3', ch47j: 'ch47f_chinook', ch47d: 'ch47f_chinook', il28: 'strike_g1', kidd_class: 'destroyer_g2',
  newport_lst: 'amphib_g1', boxer_crv: 'mech_g3', f18f_super_hornet: 'fa18ef_super_hornet', f18d: 'fa18ef_super_hornet', kc30a: 'transport_g3',
  e7a: 'transport_g3', leopard_2rev: 'leopard_2a6', chiron: 'airdef_g2', t50i: 'strike_g2', g550_caew: 'transport_g3', type_218sg: 'submarine_g3',
  hamilton_class: 'frigate_g1', ah6: 'helicopter_g1', pt76: 'recon_g1', pt91m_twardy: 't72m', s300pmu: 's300pmu2', buk_m1: 'buk_m2', mig29a: 'mig29',
};
