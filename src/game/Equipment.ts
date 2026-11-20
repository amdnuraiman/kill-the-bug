export type EquipmentId = 'za_zapper' | 'emerald_repellent' | 'ora_gauntlets';

export interface SpecialEquipment {
  id: EquipmentId;
  name: string;
  standTag: string;
  unlockHint: string;
  effectSummary: string;
  accentColor: string;
  gloveColor: number;
  cuffColor: number;
  smashRadiusBonus: number;
  clapRadiusBonus: number;
  bugSlowFactor: number;
}

export const SPECIAL_EQUIPMENT_LIST: SpecialEquipment[] = [
  {
    id: 'za_zapper',
    name: 'Za Zapper Gloves',
    standTag: 'ELECTRO STAND',
    unlockHint: 'Win a 15s+ Panic Attack',
    effectSummary: '+28% Left & Right Smash hit radius',
    accentColor: '#facc15',
    gloveColor: 0xfde047,
    cuffColor: 0x4c1d95,
    smashRadiusBonus: 0.14,
    clapRadiusBonus: 0.04,
    bugSlowFactor: 1.0,
  },
  {
    id: 'emerald_repellent',
    name: 'Emerald Splash Repellent',
    standTag: 'AURA BARRIER',
    unlockHint: 'Win a 30s+ Panic Attack or 2 wins',
    effectSummary: 'Slows blood-sucking dive speed by 22%',
    accentColor: '#34d399',
    gloveColor: 0x6ee7b7,
    cuffColor: 0x064e3b,
    smashRadiusBonus: 0.06,
    clapRadiusBonus: 0.08,
    bugSlowFactor: 0.78,
  },
  {
    id: 'ora_gauntlets',
    name: 'Star Clap Gauntlets',
    standTag: 'OVERDRIVE CLAP',
    unlockHint: 'Win a 60s Panic Attack or 3 wins',
    effectSummary: '+42% Two-Hand Clap shockwave radius',
    accentColor: '#e879f9',
    gloveColor: 0xc084fc,
    cuffColor: 0xfacc15,
    smashRadiusBonus: 0.1,
    clapRadiusBonus: 0.24,
    bugSlowFactor: 0.9,
  },
];

export function getEquipmentById(id: EquipmentId | null): SpecialEquipment | null {
  if (!id) return null;
  return SPECIAL_EQUIPMENT_LIST.find((item) => item.id === id) ?? null;
}
