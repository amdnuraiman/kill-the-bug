export type StandCryId = 'ora_rush' | 'muda_rush' | 'dora_rush' | 'ari_rush' | 'star_smash';

export interface StandCryClip {
  id: StandCryId;
  label: string;
  mangaShout: string;
  subText: string;
  katakana: string;
  spokenText: string;
  voiceStyle: string;
  voiceName: 'Fenrir' | 'Charon' | 'Puck';
  syllables: Array<{ f1: number; f2: number; pitch: number; dur: number }>;
}

export const STAND_CRY_LIBRARY: StandCryClip[] = [
  {
    id: 'ora_rush',
    label: 'ORA! ORA!',
    mangaShout: 'ORA! ORA! ORA! ORAAA!!',
    subText: 'STAR PLATINUM FLOOR CRUSH',
    katakana: 'オラオラオラァ!!',
    spokenText: 'Ora! Ora! Ora! Ora! ORAAA!',
    voiceStyle:
      'Explosive, fierce anime hero battle cry shouting rapid punchy Japanese syllables with intense power and dramatic echo',
    voiceName: 'Fenrir',
    syllables: [
      { f1: 520, f2: 920, pitch: 155, dur: 0.085 },
      { f1: 760, f2: 1280, pitch: 175, dur: 0.095 },
      { f1: 520, f2: 920, pitch: 165, dur: 0.085 },
      { f1: 780, f2: 1320, pitch: 185, dur: 0.095 },
      { f1: 520, f2: 900, pitch: 178, dur: 0.08 },
      { f1: 820, f2: 1400, pitch: 215, dur: 0.24 },
    ],
  },
  {
    id: 'muda_rush',
    label: 'MUDA! MUDA!',
    mangaShout: 'MUDA! MUDA! MUDA! MUDAAA!!',
    subText: 'THE WORLD FLOOR SLAM',
    katakana: '無駄無駄無駄ァ!!',
    spokenText: 'Muda! Muda! Muda! Muda! MUDAAA!',
    voiceStyle:
      'Commanding, theatrical anime villain battle cry shouting sharp staccato Japanese syllables with menacing intensity',
    voiceName: 'Charon',
    syllables: [
      { f1: 360, f2: 880, pitch: 135, dur: 0.085 },
      { f1: 740, f2: 1260, pitch: 152, dur: 0.095 },
      { f1: 360, f2: 880, pitch: 142, dur: 0.085 },
      { f1: 760, f2: 1300, pitch: 162, dur: 0.095 },
      { f1: 360, f2: 860, pitch: 154, dur: 0.08 },
      { f1: 810, f2: 1360, pitch: 192, dur: 0.25 },
    ],
  },
  {
    id: 'dora_rush',
    label: 'DORA! DORA!',
    mangaShout: 'DORARARARARA!! DO-RAAA!!',
    subText: 'CRAZY DIAMOND IMPACT',
    katakana: 'ドララララァ!!',
    spokenText: 'Dora! Dora! Dorararara! DORAAA!',
    voiceStyle:
      'High-energy hot-blooded anime brawler battle shout delivered fast and loud',
    voiceName: 'Puck',
    syllables: [
      { f1: 480, f2: 980, pitch: 170, dur: 0.08 },
      { f1: 760, f2: 1320, pitch: 185, dur: 0.08 },
      { f1: 740, f2: 1280, pitch: 192, dur: 0.075 },
      { f1: 760, f2: 1340, pitch: 202, dur: 0.075 },
      { f1: 790, f2: 1380, pitch: 220, dur: 0.23 },
    ],
  },
  {
    id: 'ari_rush',
    label: 'ARI! ARI!',
    mangaShout: 'ARI! ARI! ARI! ARRIVEDERCI!!',
    subText: 'ZIPPER STAND ANNIHILATION',
    katakana: 'アリアリアリ!!',
    spokenText: 'Ari! Ari! Ari! Ari! Arrivederci!',
    voiceStyle:
      'Cool, sharp, rapid-fire anime stand rush shout ending with a decisive Italian finisher',
    voiceName: 'Fenrir',
    syllables: [
      { f1: 740, f2: 1300, pitch: 160, dur: 0.085 },
      { f1: 320, f2: 2150, pitch: 175, dur: 0.085 },
      { f1: 740, f2: 1300, pitch: 182, dur: 0.085 },
      { f1: 320, f2: 2200, pitch: 195, dur: 0.095 },
      { f1: 780, f2: 1360, pitch: 210, dur: 0.24 },
    ],
  },
  {
    id: 'star_smash',
    label: 'ZA HANDO!',
    mangaShout: 'GA-HOOOON!! ZA HANDO CRUSH!!',
    subText: 'SPACE-ERASING PALM SLAM',
    katakana: 'ガホォォン!!',
    spokenText: 'Ora! Smash them flat! Za Hando!',
    voiceStyle:
      'Thunderous, booming anime Stand finisher roar with heroic weight',
    voiceName: 'Charon',
    syllables: [
      { f1: 540, f2: 960, pitch: 140, dur: 0.1 },
      { f1: 780, f2: 1340, pitch: 168, dur: 0.11 },
      { f1: 820, f2: 1420, pitch: 196, dur: 0.26 },
    ],
  },
];

export function getStandCryById(id: StandCryId): StandCryClip {
  return STAND_CRY_LIBRARY.find((c) => c.id === id) ?? STAND_CRY_LIBRARY[0];
}
