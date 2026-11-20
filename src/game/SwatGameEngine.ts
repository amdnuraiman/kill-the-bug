import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ProceduralAudioEngine, type BugKind } from '../audio/ProceduralAudioEngine';
import { BugEntity } from './BugEntity';
import {
  getEquipmentById,
  SPECIAL_EQUIPMENT_LIST,
  type EquipmentId,
  type SpecialEquipment,
} from './Equipment';
import {
  HandsRig,
  type BugClapOrder,
  type FloorHandOrder,
} from './HandsRig';
import {
  BACKGROUND_LOCATIONS,
  SceneEnvironments,
  type BackgroundLocation,
} from './SceneEnvironments';
import { SplashVFX } from './SplashVFX';
import {
  getStandCryById,
  STAND_CRY_LIBRARY,
  type StandCryClip,
  type StandCryId,
} from './StandCries';
import {
  classifyWeatherLabel,
  WeatherSystem,
  type WeatherMode,
  type WeatherTier,
} from './WeatherSystem';

export type PanicDuration = 15 | 30 | 60;

export interface FloatingCallout {
  id: number;
  text: string;
  subText?: string;
  x: number;
  y: number;
  accent: 'gold' | 'emerald' | 'crimson' | 'violet';
}

export type SuperComboPhase = 'none' | 'lockon' | 'barrage' | 'floorslam';

export interface LockOnMarker {
  id: number;
  kind: BugKind;
  x: number;
  y: number;
  lockedIndex: number;
  clapped: boolean;
}

export interface BugScreenMarker {
  id: number;
  kind: BugKind;
  x: number;
  y: number;
  inView: boolean;
  edgeSide: 'left' | 'right' | 'top' | 'bottom' | 'center';
  intensity: number;
  distance: number;
  biteCharge: number;
  isDiving: boolean;
}

export interface MatchFinishSummary {
  panicDuration: PanicDuration;
  outcome: 'victory' | 'gameover' | 'hospitalized';
  score: number;
  kills: number;
  superSmashes: number;
  maxCombo: number;
  weatherPeak: string;
}

export interface GameHudSnapshot {
  phase: 'title' | 'playing' | 'victory' | 'gameover' | 'hospitalized';
  panicDuration: PanicDuration;
  timeRemaining: number;
  isPanicSurge: boolean;
  score: number;
  highScore: number;
  kills: number;
  flyKills: number;
  mosquitoKills: number;
  clapKills: number;
  leftSmashKills: number;
  rightSmashKills: number;
  superSmashes: number;
  superComboStep: 0 | 1 | 2;
  superComboPhase: SuperComboPhase;
  superStandFlash: number;
  lockOnActive: boolean;
  lockOnMarkers: LockOnMarker[];
  screenShakeIntensity: number;
  cryPreference: 'random' | StandCryId;
  activeStandCry: StandCryClip | null;
  combo: number;
  maxCombo: number;
  health: number;
  maxHealth: number;
  justBrokeHeart: boolean;
  dengueLosses: number;
  dengueMaxLosses: number;
  totalWins: number;
  unlockedEquipment: EquipmentId[];
  equippedId: EquipmentId | null;
  newlyAwardedEquipment: SpecialEquipment | null;
  buzzIntensity: number;
  nearestBugDist: number | null;
  nearestBugKind: BugKind | null;
  nearestEar: 'left' | 'center' | 'right';
  activeBugsCount: number;
  muted: boolean;
  bgmEnabled: boolean;
  audioUnlocked: boolean;
  biteFlash: number;
  weatherLabel: string;
  weatherMode: WeatherMode;
  location: BackgroundLocation;
  mosquitoFrenzyTier: WeatherTier;
  mosquitoFrenzyActive: boolean;
  windPercent: number;
  rainPercent: number;
  webglLost: boolean;
  bugMarkers: BugScreenMarker[];
}

const STORAGE_KEY = 'killthebug_save_v3';

export interface SavedProgress {
  highScore: number;
  dengueLosses: number;
  totalWins: number;
  unlockedEquipment: EquipmentId[];
  equippedId: EquipmentId | null;
  location?: BackgroundLocation;
}

// Pre-allocated scratch math helpers (zero per-frame GC inside animation loop)
const _lookTarget = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();
const _toBug = new THREE.Vector3();
const _closestOnRay = new THREE.Vector3();
const _localBug = new THREE.Vector3();
const _shockPos = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class SwatGameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private isSoftwareGl: boolean;
  private scene: THREE.Scene;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private camera: THREE.PerspectiveCamera;
  private environments: SceneEnvironments;
  private handsRig: HandsRig;
  private splashVfx: SplashVFX;
  private weatherSystem: WeatherSystem;
  public readonly audio = new ProceduralAudioEngine();

  private bugs: BugEntity[] = [];
  private nextBugId = 1;
  private nextCalloutId = 1;

  private phase: GameHudSnapshot['phase'] = 'title';
  private panicDuration: PanicDuration = 30;
  private timeRemaining = 30;

  private score = 0;
  private highScore = 0;
  private kills = 0;
  private flyKills = 0;
  private mosquitoKills = 0;
  private clapKills = 0;
  private leftSmashKills = 0;
  private rightSmashKills = 0;
  private superSmashes = 0;
  private superComboStep: 0 | 1 | 2 = 0;
  private superComboDecayTimer = 0;
  private superStandFlash = 0;
  private cryPreference: 'random' | StandCryId = 'random';
  private lastCryIndex = -1;
  private activeStandCry: StandCryClip | null = null;
  private combo = 0;
  private maxCombo = 0;

  private health = 3;
  private readonly maxHealth = 3;
  private justBrokeHeart = false;

  private dengueLosses = 0;
  private readonly dengueMaxLosses = 3;
  private totalWins = 0;
  private unlockedEquipment: EquipmentId[] = [];
  private equippedId: EquipmentId | null = null;
  private newlyAwardedEquipment: SpecialEquipment | null = null;

  private aimNdc = new THREE.Vector2(0, 0);
  private smoothAimNdc = new THREE.Vector2(0, 0);
  private baseCamPos = new THREE.Vector3(0, 0.35, 1.35);

  // Variable-Magnitude Screen Shake + Dynamic FOV State
  private shakeTrauma = 0;
  private shakeTime = 0;
  private shakeDuration = 0.42;
  private shakeFreq = 42;
  private shakeIntensity = 0;
  private currentFov = 54;
  private targetFov = 54;

  // Lock-On + Multi-Clap + Multi-Hand Floor Smash Sequence State
  private superComboPhase: SuperComboPhase = 'none';
  private superSequenceTimer = 0;
  private superBarrageStartTime = 0.24;
  private superFloorStartTime = 0.65;
  private superLockedCount = 0;
  private lockedBugs: Array<{
    id: number;
    kind: BugKind;
    pos: THREE.Vector3;
    lockedIndex: number;
    clapped: boolean;
  }> = [];

  private biteFlash = 0;
  private hitStopTimer = 0;
  private spawnCooldown = 0;
  private actionCooldown = 0;
  private weatherPeak = 'Breeze & Drizzle';
  private lastFrenzyTier: WeatherTier = 'calm';
  private location: BackgroundLocation = 'room';
  private webglLost = false;

  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private elapsed = 0;
  private lastHudEmit = 0;

  private onSnapshot: (snap: GameHudSnapshot) => void;
  private onCallout: (callout: FloatingCallout) => void;
  private onMatchFinish?: (summary: MatchFinishSummary, progress: SavedProgress) => void;

  private raycaster = new THREE.Raycaster();

  constructor(
    container: HTMLElement,
    onSnapshot: (snap: GameHudSnapshot) => void,
    onCallout: (callout: FloatingCallout) => void,
    onMatchFinish?: (summary: MatchFinishSummary, progress: SavedProgress) => void,
  ) {
    this.container = container;
    this.onSnapshot = onSnapshot;
    this.onCallout = onCallout;
    this.onMatchFinish = onMatchFinish;

    this.loadProgress();

    this.isSoftwareGl = detectSoftwareGl();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x160d26);
    this.scene.fog = new THREE.FogExp2(0x160d26, 0.082);

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(54, width / height, 0.05, 45);
    this.camera.position.copy(this.baseCamPos);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // Mandatory studio environment reflection on every device
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmremGenerator.dispose();

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.splashVfx = new SplashVFX(this.scene);
    this.handsRig = new HandsRig(this.scene, {
      onBugClapPulse: (bugId, worldPos, clapStep) => {
        this.handleBugClapPulse(bugId, worldPos, clapStep);
      },
      onSuperFloorImpact: (impactPos, handIndex, totalHands) => {
        this.handleSuperStandImpact(impactPos, handIndex, totalHands);
      },
    });
    this.handsRig.applyEquipment(getEquipmentById(this.equippedId));
    this.camera.add(this.handsRig.root);

    this.weatherSystem = new WeatherSystem();
    this.weatherSystem.setLocation(this.location);
    this.scene.add(this.weatherSystem.root);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.environments = new SceneEnvironments(this.scene, maxAniso, this.isSoftwareGl);
    this.environments.setLocation(this.location);
    this.spawnIdlePreviewBugs();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    this.lastTime = performance.now();
    this.emitSnapshot(true);
    this.tick();
  }

  public getProgress(): SavedProgress {
    return {
      highScore: this.highScore,
      dengueLosses: this.dengueLosses,
      totalWins: this.totalWins,
      unlockedEquipment: [...this.unlockedEquipment],
      equippedId: this.equippedId,
      location: this.location,
    };
  }

  public applyCloudProfile(profile: SavedProgress): void {
    this.highScore = Math.max(this.highScore, profile.highScore);
    this.totalWins = Math.max(this.totalWins, profile.totalWins);
    this.dengueLosses = Math.max(this.dengueLosses, profile.dengueLosses);
    for (const eq of profile.unlockedEquipment) {
      if (!this.unlockedEquipment.includes(eq)) {
        this.unlockedEquipment.push(eq);
      }
    }
    if (profile.equippedId && this.unlockedEquipment.includes(profile.equippedId)) {
      this.equippedId = profile.equippedId;
    }
    if (profile.location && BACKGROUND_LOCATIONS.some((l) => l.id === profile.location)) {
      this.location = profile.location;
      this.environments.setLocation(this.location);
      this.weatherSystem.setLocation(this.location);
    }
    this.handsRig.applyEquipment(getEquipmentById(this.equippedId));
    this.saveProgress();
    this.emitSnapshot(true);
  }

  private loadProgress(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SavedProgress>;
      this.highScore = Math.max(0, Number(parsed.highScore) || 0);
      this.dengueLosses = Math.max(0, Number(parsed.dengueLosses) || 0);
      this.totalWins = Math.max(0, Number(parsed.totalWins) || 0);
      if (Array.isArray(parsed.unlockedEquipment)) {
        this.unlockedEquipment = parsed.unlockedEquipment.filter((id): id is EquipmentId =>
          SPECIAL_EQUIPMENT_LIST.some((e) => e.id === id),
        );
      }
      if (parsed.equippedId && this.unlockedEquipment.includes(parsed.equippedId)) {
        this.equippedId = parsed.equippedId;
      }
      if (parsed.location && BACKGROUND_LOCATIONS.some((l) => l.id === parsed.location)) {
        this.location = parsed.location;
      }
    } catch {
      // ignore storage errors
    }
  }

  private saveProgress(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.getProgress()));
    } catch {
      // ignore
    }
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.webglLost = true;
    this.emitSnapshot(true);
  };

  private handleContextRestored = (): void => {
    this.webglLost = false;
    this.emitSnapshot(true);
  };

  private spawnIdlePreviewBugs(): void {
    this.clearAllBugs();
    this.spawnBug('fly');
    this.spawnBug('mosquito');
    this.spawnBug('fly');
    this.spawnBug('mosquito');
  }

  private clearAllBugs(): void {
    for (const bug of this.bugs) {
      this.scene.remove(bug.root);
      this.audio.removeBugVoice(bug.id);
    }
    this.bugs = [];
  }

  private spawnBug(forceKind?: BugKind): void {
    const progressRatio = 1 - this.timeRemaining / Math.max(1, this.panicDuration);
    const kind: BugKind =
      forceKind ?? (Math.random() < 0.48 + progressRatio * 0.22 ? 'mosquito' : 'fly');
    const speedScale = 0.95 + progressRatio * 0.44 + (this.panicDuration === 60 ? 0.12 : 0);
    const bug = new BugEntity(this.nextBugId++, kind, speedScale);
    this.bugs.push(bug);
    this.scene.add(bug.root);
  }

  public setPanicDuration(duration: PanicDuration): void {
    this.panicDuration = duration;
    if (this.phase !== 'playing') {
      this.timeRemaining = duration;
      this.emitSnapshot(true);
    }
  }

  public equipItem(id: EquipmentId | null): void {
    if (id !== null && !this.unlockedEquipment.includes(id)) return;
    this.equippedId = id;
    this.handsRig.applyEquipment(getEquipmentById(id));
    this.saveProgress();
    this.emitSnapshot(true);
  }

  public setCryPreference(pref: 'random' | StandCryId): void {
    this.cryPreference = pref;
    this.emitSnapshot(true);
  }

  public cycleCryPreference(): 'random' | StandCryId {
    const order: Array<'random' | StandCryId> = ['random', ...STAND_CRY_LIBRARY.map((c) => c.id)];
    const idx = order.indexOf(this.cryPreference);
    this.cryPreference = order[(idx + 1) % order.length];
    this.emitSnapshot(true);
    return this.cryPreference;
  }

  private pickNextStandCry(overrideId?: StandCryId): StandCryClip {
    if (overrideId) {
      return getStandCryById(overrideId);
    }
    if (this.cryPreference !== 'random') {
      return getStandCryById(this.cryPreference);
    }
    // Rotate/randomize across iconic cries without repeating twice in a row
    let idx = Math.floor(Math.random() * STAND_CRY_LIBRARY.length);
    if (STAND_CRY_LIBRARY.length > 1 && idx === this.lastCryIndex) {
      idx = (idx + 1) % STAND_CRY_LIBRARY.length;
    }
    this.lastCryIndex = idx;
    return STAND_CRY_LIBRARY[idx];
  }

  public async previewStandCry(overrideId?: StandCryId): Promise<StandCryClip> {
    await this.audio.unlock();
    const clip = overrideId
      ? getStandCryById(overrideId)
      : this.cryPreference === 'random'
        ? this.pickNextStandCry()
        : getStandCryById(this.cryPreference);
    this.activeStandCry = clip;
    this.superStandFlash = Math.max(this.superStandFlash, 0.72);
    this.audio.playStandCry(clip);
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.onCallout({
      id: this.nextCalloutId++,
      text: clip.mangaShout,
      subText: clip.subText,
      x: w * 0.5,
      y: h * 0.3,
      accent: 'gold',
    });
    this.emitSnapshot(true);
    return clip;
  }

  public setWeatherMode(mode: WeatherMode): void {
    this.weatherSystem.setMode(mode);
    const wState = this.weatherSystem.getWeatherState();
    const tier = this.weatherSystem.getWeatherTier();
    if (this.phase === 'playing' && tier !== 'calm' && tier !== this.lastFrenzyTier) {
      this.emitWeatherFrenzyCallout(tier, wState.label);
    }
    this.lastFrenzyTier = tier;
    this.emitSnapshot(true);
  }

  public cycleWeatherMode(): WeatherMode {
    const order: WeatherMode[] = ['auto', 'calm', 'windy', 'stormy'];
    const current = this.weatherSystem.getMode();
    const next = order[(order.indexOf(current) + 1) % order.length];
    this.setWeatherMode(next);
    return next;
  }

  public setLocation(loc: BackgroundLocation): void {
    this.location = loc;
    this.environments.setLocation(loc);
    this.weatherSystem.setLocation(loc);
    this.saveProgress();
    this.emitSnapshot(true);
  }

  public cycleLocation(): BackgroundLocation {
    const idx = BACKGROUND_LOCATIONS.findIndex((l) => l.id === this.location);
    const next = BACKGROUND_LOCATIONS[(idx + 1) % BACKGROUND_LOCATIONS.length].id;
    this.setLocation(next);
    return next;
  }

  private emitWeatherFrenzyCallout(tier: WeatherTier, weatherLabel: string): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.onCallout({
      id: this.nextCalloutId++,
      text: tier === 'stormy' ? 'STORM FRENZY!!' : 'WINDY SURGE!!',
      subText:
        tier === 'stormy'
          ? `${weatherLabel.toUpperCase()} — MOSQUITOES +48% SPEED & GUST DASH!`
          : `${weatherLabel.toUpperCase()} — MOSQUITOES ZIGZAGGING FASTER!`,
      x: w * 0.5,
      y: h * 0.24,
      accent: tier === 'stormy' ? 'crimson' : 'gold',
    });
  }

  public dischargeFromHospital(): void {
    this.dengueLosses = 0;
    this.phase = 'title';
    this.saveProgress();
    this.spawnIdlePreviewBugs();
    this.emitSnapshot(true);
  }

  public async startGame(duration?: PanicDuration): Promise<void> {
    if (duration) this.panicDuration = duration;
    await this.audio.unlock();
    this.clearAllBugs();

    this.phase = 'playing';
    this.timeRemaining = this.panicDuration;
    this.score = 0;
    this.kills = 0;
    this.flyKills = 0;
    this.mosquitoKills = 0;
    this.clapKills = 0;
    this.leftSmashKills = 0;
    this.rightSmashKills = 0;
    this.superSmashes = 0;
    this.superComboStep = 0;
    this.superComboDecayTimer = 0;
    this.superStandFlash = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.health = this.maxHealth;
    this.justBrokeHeart = false;
    this.newlyAwardedEquipment = null;
    this.biteFlash = 0;
    this.shakeTrauma = 0;
    this.shakeIntensity = 0;
    this.currentFov = 54;
    this.targetFov = 54;
    this.camera.fov = 54;
    this.camera.updateProjectionMatrix();
    this.superComboPhase = 'none';
    this.lockedBugs = [];
    this.superSequenceTimer = 0;
    this.spawnCooldown = 0.25;
    this.weatherPeak = this.weatherSystem.getWeatherState().label;
    this.lastFrenzyTier = this.weatherSystem.getWeatherTier();

    this.handsRig.applyEquipment(getEquipmentById(this.equippedId));
    this.handsRig.setStandAuraStage(0);
    this.spawnBug('fly');
    this.spawnBug('mosquito');
    this.spawnBug('fly');
    this.spawnBug('mosquito');
    this.spawnBug('mosquito');

    this.emitSnapshot(true);
  }

  public triggerScreenShake(magnitude: number, duration = 0.42, fovKick = 0): void {
    const clamped = THREE.MathUtils.clamp(magnitude, 0.08, 2.2);
    this.shakeTrauma = Math.min(2.2, Math.max(this.shakeTrauma, clamped));
    this.shakeDuration = Math.max(0.18, duration);
    this.shakeFreq = 36 + clamped * 14;
    if (fovKick !== 0) {
      this.currentFov = THREE.MathUtils.clamp(this.currentFov + fovKick, 45, 64);
    }
  }

  public setAimFromPointer(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.aimNdc.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
  }

  public setAimNdc(x: number, y: number): void {
    this.aimNdc.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
  }

  private advanceSuperCombo(action: 'smash_right' | 'smash_left' | 'clap'): boolean {
    if (action === 'smash_right') {
      this.superComboStep = 1;
      this.superComboDecayTimer = 4.5;
      return false;
    }
    if (action === 'smash_left') {
      if (this.superComboStep === 1) {
        this.superComboStep = 2;
        this.superComboDecayTimer = 4.5;
      } else {
        this.superComboStep = 0;
      }
      return false;
    }
    // Clap Both Hands completes Right -> Left -> Clap!
    if (this.superComboStep === 2) {
      this.superComboStep = 0;
      this.superComboDecayTimer = 0;
      return true;
    }
    this.superComboStep = 0;
    return false;
  }

  public triggerClap(): void {
    if (this.actionCooldown > 0) return;
    this.audio.unlock();
    if (this.phase !== 'playing') return;

    this.actionCooldown = 0.2;
    this.handsRig.triggerClap(this.smoothAimNdc.x, this.smoothAimNdc.y);

    const triggeredSuper = this.advanceSuperCombo('clap');
    const hits = triggeredSuper ? [] : this.evaluateStrike('clap');
    this.audio.playClap(triggeredSuper ? 1 : hits.length);

    this.raycaster.setFromCamera(this.smoothAimNdc, this.camera);
    _shockPos.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 0.85);
    const eq = getEquipmentById(this.equippedId);
    const ringColor = eq
      ? new THREE.Color(eq.accentColor).getHex()
      : hits.length > 0 || triggeredSuper
        ? 0xfacc15
        : 0xe2e8f0;
    this.splashVfx.spawnShockwave(_shockPos, this.camera.quaternion, ringColor);
    this.triggerScreenShake(hits.length > 0 ? 0.36 : 0.16, 0.22);

    if (triggeredSuper) {
      this.startMultiSuperCombo();
    }

    this.emitSnapshot(true);
  }

  private startMultiSuperCombo(): void {
    this.superSmashes += 1;
    this.superStandFlash = 1.0;

    // Pick random mix (or selected) vocal cry
    const cry = this.pickNextStandCry();
    this.activeStandCry = cry;

    // Lock on all active bugs, sorted nearest to player
    const targets = this.bugs
      .filter((b) => b.alive)
      .sort(
        (a, b) =>
          a.pos.distanceToSquared(this.camera.position) -
          b.pos.distanceToSquared(this.camera.position),
      );

    this.superLockedCount = targets.length;
    this.lockedBugs = targets.map((b, idx) => ({
      id: b.id,
      kind: b.kind,
      pos: b.pos.clone(),
      lockedIndex: idx + 1,
      clapped: false,
    }));

    this.superComboPhase = 'lockon';
    this.superSequenceTimer = 0;
    this.superBarrageStartTime = 0.18;
    const clapCount = Math.min(targets.length, 14);
    this.superFloorStartTime = 0.34 + clapCount * 0.065;
    this.targetFov = 48.5; // Dramatic JoJo anime lock-on zoom-in!

    // Lock-on tremor + audio chirp + vocal cry
    this.triggerScreenShake(0.28 + Math.min(0.45, clapCount * 0.045), 0.28, -2.5);
    this.audio.playLockOnChirp(Math.max(1, clapCount));
    this.audio.playStandCry(cry);

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.onCallout({
      id: this.nextCalloutId++,
      text: cry.mangaShout,
      subText:
        clapCount > 0
          ? `${cry.subText} · LOCKED ${clapCount} BUG${clapCount > 1 ? 'S' : ''}!`
          : `${cry.subText} · MULTI-HAND BARRAGE!`,
      x: w * 0.5,
      y: h * 0.24,
      accent: 'gold',
    });

    // Schedule per-bug double-clap Stand pairs (up to 14 locked bugs)
    const clapOrders: BugClapOrder[] = targets.slice(0, 14).map((bug, idx) => ({
      bugId: bug.id,
      pos: bug.pos.clone(),
      delay: 0.18 + idx * 0.065,
    }));

    // Schedule 5 to 6 Giant Descending Stand Hands across the arena floor
    const aimX = THREE.MathUtils.clamp(this.smoothAimNdc.x * 0.85, -1.0, 1.0);
    const floorSpots: Array<{ x: number; z: number; scale: number; yaw: number }> = [
      { x: -1.12, z: -1.45, scale: 0.92, yaw: -0.22 },
      { x: 1.12, z: -1.45, scale: 0.92, yaw: 0.22 },
      { x: -0.58, z: -0.92, scale: 1.0, yaw: 0.14 },
      { x: 0.58, z: -0.92, scale: 1.0, yaw: -0.14 },
      { x: aimX * 0.65, z: -1.62, scale: 1.06, yaw: 0.08 },
      { x: aimX, z: -1.2, scale: 1.28, yaw: 0 },
    ];
    const handCount = clapCount >= 3 ? 6 : 5;
    const chosenSpots = handCount === 6 ? floorSpots : floorSpots.slice(1);
    const floorOrders: FloorHandOrder[] = chosenSpots.map((spot, j) => ({
      targetX: spot.x,
      targetZ: spot.z,
      delay: 0.34 + clapCount * 0.065 + j * 0.075,
      scale: spot.scale,
      yaw: spot.yaw,
    }));

    this.handsRig.triggerMultiSuperCombo(clapOrders, floorOrders);
  }

  public triggerSmash(side: 'left' | 'right'): void {
    if (this.actionCooldown > 0) return;
    this.audio.unlock();
    if (this.phase !== 'playing') return;

    this.actionCooldown = 0.19;
    this.handsRig.triggerSmash(side, this.smoothAimNdc.x, this.smoothAimNdc.y);

    const mode = side === 'left' ? 'smash_left' : 'smash_right';
    this.advanceSuperCombo(mode);
    const hits = this.evaluateStrike(mode);
    this.audio.playSmash(side, hits.length);

    this.raycaster.setFromCamera(this.smoothAimNdc, this.camera);
    _shockPos.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 0.88);
    this.splashVfx.spawnShockwave(
      _shockPos,
      this.camera.quaternion,
      hits.length > 0 ? 0x38bdf8 : 0x94a3b8,
    );
    this.triggerScreenShake(hits.length > 0 ? 0.3 : 0.12, 0.2);
    this.emitSnapshot(true);
  }

  private handleBugClapPulse(bugId: number, worldPos: THREE.Vector3, clapStep: 1 | 2): void {
    this.superStandFlash = Math.max(this.superStandFlash, clapStep === 2 ? 0.82 : 0.52);
    this.audio.playClap(1);
    this.splashVfx.spawnShockwave(
      worldPos,
      this.camera.quaternion,
      clapStep === 1 ? 0xfacc15 : 0xd946ef,
      clapStep === 1 ? 3.6 : 5.2,
      0.26,
    );

    const lockedEntry = this.lockedBugs.find((b) => b.id === bugId);
    const orderNum = lockedEntry?.lockedIndex ?? 1;
    this.triggerScreenShake(0.36 + orderNum * 0.06 + (clapStep === 2 ? 0.18 : 0), 0.24, 1.1);

    if (clapStep === 1) {
      const proj = this.projectToScreen(worldPos);
      this.onCallout({
        id: this.nextCalloutId++,
        text: `CLAP #${orderNum}!`,
        x: proj.x,
        y: proj.y,
        accent: 'gold',
      });
      return;
    }

    if (lockedEntry) {
      lockedEntry.clapped = true;
    }

    if (this.phase !== 'playing') return;

    const bug = this.bugs.find((b) => b.id === bugId && b.alive);
    if (!bug) return;

    bug.alive = false;
    this.scene.remove(bug.root);
    this.audio.removeBugVoice(bug.id);
    this.bugs = this.bugs.filter((b) => b.id !== bugId);

    this.kills += 1;
    this.clapKills += 1;
    if (bug.kind === 'fly') this.flyKills += 1;
    else this.mosquitoKills += 1;
    this.combo += 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const pts = 320 + Math.min(300, this.combo * 25);
    this.score += pts;
    if (this.score > this.highScore) this.highScore = this.score;

    this.splashVfx.spawnBugSplash(bug.pos, bug.kind, true);
    this.audio.playSplashKill(bug.kind, this.combo, true);

    const proj = this.projectToScreen(bug.pos);
    this.onCallout({
      id: this.nextCalloutId++,
      text: `ORA CLAPPED!! +${pts}`,
      subText: bug.kind === 'mosquito' ? 'Bloodsucker Crushed' : 'Horror Fly Crushed',
      x: proj.x,
      y: proj.y,
      accent: 'violet',
    });

    this.emitSnapshot(true);
  }

  private handleSuperStandImpact(
    floorPos: THREE.Vector3,
    handIndex: number,
    totalHands: number,
  ): void {
    const isFinal = handIndex === totalHands - 1;
    const bugMagnitude = 1 + Math.min(5, this.superLockedCount) * 0.2;
    const smashMagnitude = bugMagnitude * (isFinal ? 1.42 : 0.8);

    this.splashVfx.spawnSuperFloorSmash(floorPos);
    this.triggerScreenShake(smashMagnitude, isFinal ? 0.65 : 0.3, isFinal ? 5.2 : 1.8);
    this.audio.playSuperHandSlam(smashMagnitude);
    this.hitStopTimer = isFinal ? 0.062 : 0.022;
    this.superStandFlash = Math.max(this.superStandFlash, isFinal ? 1.0 : 0.72);
    this.superComboPhase = 'floorslam';

    if (this.phase !== 'playing') {
      if (isFinal) {
        this.superComboPhase = 'none';
        this.lockedBugs = [];
        this.targetFov = 54;
      }
      return;
    }

    if (!isFinal) {
      this.emitSnapshot(false);
      return;
    }

    // Final giant anchor hand sweeps any remaining active bugs on screen!
    let extraCrushed = 0;
    for (const bug of this.bugs) {
      if (!bug.alive) continue;
      bug.alive = false;
      this.scene.remove(bug.root);
      this.audio.removeBugVoice(bug.id);

      extraCrushed++;
      this.kills += 1;
      this.clapKills += 1;
      if (bug.kind === 'fly') this.flyKills += 1;
      else this.mosquitoKills += 1;
      this.combo += 1;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      const pts = 350 + Math.min(300, this.combo * 25);
      this.score += pts;
      if (this.score > this.highScore) this.highScore = this.score;

      this.splashVfx.spawnBugSplash(bug.pos, bug.kind, true);
    }

    if (extraCrushed > 0) {
      this.bugs = [];
      this.audio.playSplashKill('mosquito', this.combo, true);
    } else if (this.superLockedCount === 0) {
      this.score += 200;
      if (this.score > this.highScore) this.highScore = this.score;
    }

    const totalWiped = this.superLockedCount + extraCrushed;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.onCallout({
      id: this.nextCalloutId++,
      text: 'DO-GOOOON!!',
      subText:
        totalWiped > 0
          ? `${totalHands}x STAND FLOOR CRUSH! ${totalWiped} BUGS WIPED!`
          : `${totalHands}x MEGA STAND FLOOR SLAM!`,
      x: w * 0.5,
      y: h * 0.42,
      accent: 'violet',
    });

    this.superComboPhase = 'none';
    this.lockedBugs = [];
    this.targetFov = 54;
    this.saveProgress();
    this.emitSnapshot(true);
  }

  private evaluateStrike(mode: 'clap' | 'smash_left' | 'smash_right'): BugEntity[] {
    if (this.phase !== 'playing') return [];

    const eq = getEquipmentById(this.equippedId);
    const smashBonus = eq?.smashRadiusBonus ?? 0;
    const clapBonus = eq?.clapRadiusBonus ?? 0;

    this.raycaster.setFromCamera(this.smoothAimNdc, this.camera);
    const ray = this.raycaster.ray;
    const hitBugs: BugEntity[] = [];

    for (const bug of this.bugs) {
      if (!bug.alive) continue;

      _toBug.copy(bug.pos).sub(ray.origin);
      const alongDist = _toBug.dot(ray.direction);
      if (alongDist < 0.14 || alongDist > 3.25) continue;

      _closestOnRay.copy(ray.origin).addScaledVector(ray.direction, alongDist);
      const perpDist = bug.pos.distanceTo(_closestOnRay);
      _localBug.copy(bug.pos).applyMatrix4(this.camera.matrixWorldInverse);

      let hit = false;
      if (mode === 'clap') {
        const radius = (alongDist < 1.2 ? 0.58 : 0.47) + clapBonus;
        hit = perpDist <= radius + bug.hitRadius * 0.48;
      } else if (mode === 'smash_left') {
        const radius = (alongDist < 1.2 ? 0.48 : 0.39) + smashBonus;
        const nearLeftEar = _localBug.x < 0.12 && bug.pos.distanceTo(this.camera.position) < 1.1;
        hit = perpDist <= radius + bug.hitRadius * 0.42 || (nearLeftEar && this.smoothAimNdc.x < 0.38);
      } else {
        const radius = (alongDist < 1.2 ? 0.48 : 0.39) + smashBonus;
        const nearRightEar = _localBug.x > -0.12 && bug.pos.distanceTo(this.camera.position) < 1.1;
        hit = perpDist <= radius + bug.hitRadius * 0.42 || (nearRightEar && this.smoothAimNdc.x > -0.38);
      }

      if (hit) hitBugs.push(bug);
    }

    if (hitBugs.length === 0) {
      this.combo = 0;
      return [];
    }

    this.hitStopTimer = 0.036;

    hitBugs.forEach((bug, idx) => {
      bug.alive = false;
      this.scene.remove(bug.root);
      this.audio.removeBugVoice(bug.id);

      const isClap = mode === 'clap';
      this.kills += 1;
      if (bug.kind === 'fly') this.flyKills += 1;
      else this.mosquitoKills += 1;

      if (isClap) this.clapKills += 1;
      else if (mode === 'smash_left') this.leftSmashKills += 1;
      else this.rightSmashKills += 1;

      this.combo += 1;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      const basePts = bug.kind === 'mosquito' ? 150 : 100;
      const modeMult = isClap ? 1.5 : 1.0;
      const comboMult = 1 + Math.min(2.0, (this.combo - 1) * 0.15);
      const pts = Math.round(basePts * modeMult * comboMult);
      this.score += pts;

      if (this.score > this.highScore) {
        this.highScore = this.score;
      }

      this.splashVfx.spawnBugSplash(bug.pos, bug.kind, isClap);
      if (idx === 0) {
        this.audio.playSplashKill(bug.kind, this.combo, isClap);
      }

      const proj = this.projectToScreen(bug.pos);
      const jojoShout = isClap
        ? hitBugs.length > 1
          ? `ORA ORA CLAP! +${pts}`
          : `BA-SHIIIN!! +${pts}`
        : mode === 'smash_left'
          ? `LEFT SMASH!! +${pts}`
          : `RIGHT SMASH!! +${pts}`;

      this.onCallout({
        id: this.nextCalloutId++,
        text: jojoShout,
        subText:
          this.combo >= 2
            ? `${this.combo}x STAND COMBO`
            : bug.kind === 'mosquito'
              ? 'Bloodsucker Defeated'
              : 'Horror Fly Defeated',
        x: proj.x,
        y: proj.y,
        accent: isClap ? 'gold' : bug.kind === 'mosquito' ? 'violet' : 'emerald',
      });
    });

    this.bugs = this.bugs.filter((b) => b.alive);
    this.saveProgress();
    this.emitSnapshot(true);
    return hitBugs;
  }

  private handleVictory(): void {
    this.phase = 'victory';
    this.superComboPhase = 'none';
    this.lockedBugs = [];
    this.targetFov = 54;
    this.audio.setPanicState(false);
    this.clearAllBugs();
    this.totalWins += 1;
    this.dengueLosses = Math.max(0, this.dengueLosses - 1);

    let awarded: SpecialEquipment | null = null;
    if (!this.unlockedEquipment.includes('za_zapper')) {
      this.unlockedEquipment.push('za_zapper');
      awarded = getEquipmentById('za_zapper');
    } else if (
      !this.unlockedEquipment.includes('emerald_repellent') &&
      (this.panicDuration >= 30 || this.totalWins >= 2)
    ) {
      this.unlockedEquipment.push('emerald_repellent');
      awarded = getEquipmentById('emerald_repellent');
    } else if (
      !this.unlockedEquipment.includes('ora_gauntlets') &&
      (this.panicDuration >= 60 || this.totalWins >= 3)
    ) {
      this.unlockedEquipment.push('ora_gauntlets');
      awarded = getEquipmentById('ora_gauntlets');
    }

    if (awarded) {
      this.newlyAwardedEquipment = awarded;
      this.equippedId = awarded.id;
      this.handsRig.applyEquipment(awarded);
    }

    this.audio.playVictory();
    this.saveProgress();
    this.emitSnapshot(true);

    this.onMatchFinish?.(
      {
        panicDuration: this.panicDuration,
        outcome: 'victory',
        score: this.score,
        kills: this.kills,
        superSmashes: this.superSmashes,
        maxCombo: this.maxCombo,
        weatherPeak: this.weatherPeak,
      },
      this.getProgress(),
    );
  }

  private handleDefeat(): void {
    this.superComboPhase = 'none';
    this.lockedBugs = [];
    this.targetFov = 54;
    this.audio.setPanicState(false);
    this.clearAllBugs();
    this.dengueLosses += 1;

    if (this.dengueLosses >= this.dengueMaxLosses) {
      this.phase = 'hospitalized';
      this.audio.playHospitalAlarm();
    } else {
      this.phase = 'gameover';
    }

    this.saveProgress();
    this.emitSnapshot(true);

    this.onMatchFinish?.(
      {
        panicDuration: this.panicDuration,
        outcome: this.phase,
        score: this.score,
        kills: this.kills,
        superSmashes: this.superSmashes,
        maxCombo: this.maxCombo,
        weatherPeak: this.weatherPeak,
      },
      this.getProgress(),
    );
  }

  private projectToScreen(worldPos: THREE.Vector3): { x: number; y: number; inFront: boolean } {
    _tmpVec.copy(worldPos).project(this.camera);
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    return {
      x: (_tmpVec.x * 0.5 + 0.5) * w,
      y: (-_tmpVec.y * 0.5 + 0.5) * h,
      inFront: _tmpVec.z < 1,
    };
  }

  private handleResize = (): void => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.ALREADY_SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - rawDt);
      this.renderer.render(this.scene, this.camera);
    } else {
      this.elapsed += rawDt;
      this.update(rawDt);
      this.renderer.render(this.scene, this.camera);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private update(dt: number): void {
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    this.biteFlash = Math.max(0, this.biteFlash - dt * 2.0);
    this.superStandFlash = Math.max(0, this.superStandFlash - dt * 1.1);
    if (this.superStandFlash <= 0.02 && this.superComboPhase === 'none') {
      this.activeStandCry = null;
    }

    // Advance Lock-On -> Barrage -> Floor Slam phase state
    if (this.superComboPhase !== 'none') {
      this.superSequenceTimer += dt;
      if (
        this.superComboPhase === 'lockon' &&
        this.superSequenceTimer >= this.superBarrageStartTime
      ) {
        this.superComboPhase = 'barrage';
      } else if (
        this.superComboPhase === 'barrage' &&
        this.superSequenceTimer >= this.superFloorStartTime
      ) {
        this.superComboPhase = 'floorslam';
        this.targetFov = 54;
      }
      if (this.superSequenceTimer > 2.4) {
        this.superComboPhase = 'none';
        this.lockedBugs = [];
        this.targetFov = 54;
      }
    }

    // Variable-Magnitude Screen Shake (positional tremor + rotational camera roll + FOV punch)
    this.shakeTime += dt;
    const decayRate = 1.35 / Math.max(0.18, this.shakeDuration);
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * decayRate);
    const shakeCurve = this.shakeTrauma * Math.min(1.65, this.shakeTrauma);
    const ampPos = shakeCurve * 0.055;
    const ampRoll = shakeCurve * 0.042;
    this.shakeIntensity = THREE.MathUtils.clamp(shakeCurve / 2.2, 0, 1);

    const shakeX =
      ampPos *
      (Math.sin(this.shakeTime * this.shakeFreq) * 0.65 +
        Math.cos(this.shakeTime * this.shakeFreq * 1.71) * 0.35);
    const shakeY =
      ampPos *
      (Math.cos(this.shakeTime * this.shakeFreq * 1.19) * 0.68 +
        Math.sin(this.shakeTime * this.shakeFreq * 2.13) * 0.32);
    const shakeRoll = ampRoll * Math.sin(this.shakeTime * this.shakeFreq * 0.87);

    // Smooth dynamic FOV zoom/punch
    this.currentFov = THREE.MathUtils.damp(this.currentFov, this.targetFov, 11, dt);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.03) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    if (this.superComboStep > 0) {
      this.superComboDecayTimer -= dt;
      if (this.superComboDecayTimer <= 0) {
        this.superComboStep = 0;
      }
    }

    if (this.justBrokeHeart && this.biteFlash < 0.3) {
      this.justBrokeHeart = false;
    }

    const aimDamp = 1 - Math.exp(-14 * dt);
    this.smoothAimNdc.lerp(this.aimNdc, aimDamp);
    _lookTarget.set(
      this.smoothAimNdc.x * 0.65,
      0.24 + this.smoothAimNdc.y * 0.44,
      -1.5,
    );
    this.camera.position.set(
      this.baseCamPos.x + this.smoothAimNdc.x * 0.08 + shakeX,
      this.baseCamPos.y + this.smoothAimNdc.y * 0.06 + shakeY,
      this.baseCamPos.z,
    );
    this.camera.lookAt(_lookTarget);
    this.camera.rotation.z += shakeRoll;
    this.camera.updateMatrixWorld();

    const panicThreshold = this.panicDuration === 15 ? 6 : 10;
    const isPanicSurge = this.phase === 'playing' && this.timeRemaining <= panicThreshold;
    this.audio.setPanicState(isPanicSurge);

    const progressRatio =
      this.phase === 'playing' ? 1 - this.timeRemaining / Math.max(1, this.panicDuration) : 0.2;

    this.weatherSystem.update(dt, this.elapsed, progressRatio, this.phase === 'playing');
    const wState = this.weatherSystem.getWeatherState();
    const weatherTier = this.weatherSystem.getWeatherTier();
    this.environments.update(this.elapsed, wState.windStrength);

    const mosquitoSpeedMult =
      weatherTier === 'stormy' ? 1.48 : weatherTier === 'windy' ? 1.28 : 1.0;
    const mosquitoChaosMult =
      weatherTier === 'stormy' ? 1.95 : weatherTier === 'windy' ? 1.45 : 1.0;

    this.audio.setWeatherAudio(wState.rainIntensity, wState.windStrength, this.location);
    if (this.phase === 'playing') {
      const rank = (t: WeatherTier) => (t === 'stormy' ? 2 : t === 'windy' ? 1 : 0);
      if (rank(weatherTier) > rank(this.lastFrenzyTier)) {
        this.emitWeatherFrenzyCallout(weatherTier, wState.label);
      }
      this.lastFrenzyTier = weatherTier;

      if (
        weatherTier === 'stormy' ||
        (weatherTier === 'windy' && classifyWeatherLabel(this.weatherPeak) === 'calm')
      ) {
        this.weatherPeak = wState.label;
      }
    }

    if (this.phase === 'playing') {
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);
      if (this.timeRemaining <= 0) {
        this.handleVictory();
        return;
      }

      const maxConcurrent = isPanicSurge ? 15 : Math.min(13, 7 + Math.floor(progressRatio * 6));
      this.spawnCooldown -= dt;
      if (this.bugs.length < maxConcurrent && this.spawnCooldown <= 0) {
        this.spawnBug();
        if (this.bugs.length < maxConcurrent - 3) {
          this.spawnBug();
        }
        this.spawnCooldown = isPanicSurge ? 0.18 : Math.max(0.28, 0.58 - progressRatio * 0.25);
      }
    }

    const eq = getEquipmentById(this.equippedId);
    const slowFactor = eq?.bugSlowFactor ?? 1.0;

    let maxIntensity = 0;
    let nearestDist = Infinity;
    let nearestKind: BugKind | null = null;
    let nearestPan = 0;
    const markerMetrics = new Map<number, { biteCharge: number; isDiving: boolean }>();

    const bugWeatherContext = {
      windVec: wState.windVec,
      turbulence: wState.turbulence,
      weatherTier,
      mosquitoSpeedMult,
      mosquitoChaosMult,
    };

    const lockFrozen =
      this.superComboPhase === 'lockon' || this.superComboPhase === 'barrage';

    for (const bug of this.bugs) {
      const res = lockFrozen
        ? {
            bittenPlayer: false,
            distanceToCamera: bug.pos.distanceTo(this.camera.position),
            biteCharge: 0,
            isDiving: false,
          }
        : bug.update(
            dt,
            this.camera,
            this.elapsed,
            slowFactor,
            isPanicSurge,
            bugWeatherContext,
          );
      markerMetrics.set(bug.id, { biteCharge: res.biteCharge, isDiving: res.isDiving });

      const acoustic = this.audio.syncBugVoice(
        bug.id,
        bug.kind,
        bug.pos,
        bug.vel.length(),
        this.camera,
      );

      if (acoustic.intensity > maxIntensity) {
        maxIntensity = acoustic.intensity;
      }
      if (res.distanceToCamera < nearestDist) {
        nearestDist = res.distanceToCamera;
        nearestKind = bug.kind;
        nearestPan = acoustic.pan;
      }

      if (this.phase === 'playing' && res.bittenPlayer) {
        this.health = Math.max(0, this.health - 1);
        this.justBrokeHeart = true;
        this.combo = 0;
        this.biteFlash = 1.0;
        this.triggerScreenShake(0.62, 0.35);
        this.audio.playBiteSting();
        this.audio.playHeartBreak();

        const proj = this.projectToScreen(bug.pos);
        this.onCallout({
          id: this.nextCalloutId++,
          text: 'HEART BROKEN!!',
          subText: bug.kind === 'mosquito' ? 'Mosquito Sucked Blood!' : 'Fly Bit Your Body!',
          x: proj.x,
          y: proj.y,
          accent: 'crimson',
        });

        if (this.health <= 0) {
          this.handleDefeat();
          return;
        }
      }
    }

    const auraStage: 0 | 1 | 2 | 3 =
      this.superComboPhase !== 'none'
        ? 3
        : this.superComboStep === 2
          ? 2
          : this.superComboStep === 1
            ? 1
            : 0;
    this.handsRig.setStandAuraStage(auraStage);

    this.handsRig.update(dt, this.elapsed, this.smoothAimNdc.x, this.smoothAimNdc.y);
    this.splashVfx.update(dt);

    if (this.elapsed - this.lastHudEmit > 0.045) {
      this.lastHudEmit = this.elapsed;
      this.emitSnapshot(false, maxIntensity, nearestDist, nearestKind, nearestPan, markerMetrics);
    }
  }

  private emitSnapshot(
    force = false,
    buzzIntensity = 0,
    nearestDist = Infinity,
    nearestKind: BugKind | null = null,
    nearestPan = 0,
    markerMetrics?: Map<number, { biteCharge: number; isDiving: boolean }>,
  ): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const panicThreshold = this.panicDuration === 15 ? 6 : 10;
    const isPanicSurge = this.phase === 'playing' && this.timeRemaining <= panicThreshold;
    const wState = this.weatherSystem.getWeatherState();

    const bugMarkers: BugScreenMarker[] = this.bugs.map((bug) => {
      const dist = bug.pos.distanceTo(this.camera.position);
      const proximity = THREE.MathUtils.clamp(1 - (dist - 0.35) / 3.85, 0, 1);
      const intensity = Math.pow(proximity, 1.85);
      const proj = this.projectToScreen(bug.pos);
      const pad = 42;
      const inView =
        proj.inFront && proj.x >= pad && proj.x <= w - pad && proj.y >= pad && proj.y <= h - pad;

      let edgeSide: BugScreenMarker['edgeSide'] = 'center';
      if (!inView) {
        if (!proj.inFront || proj.x < pad) edgeSide = 'left';
        if (proj.x > w - pad) edgeSide = 'right';
        else if (proj.y < pad) edgeSide = 'top';
        else if (proj.y > h - pad) edgeSide = 'bottom';
      }

      const m = markerMetrics?.get(bug.id);
      return {
        id: bug.id,
        kind: bug.kind,
        x: THREE.MathUtils.clamp(proj.x, 28, w - 28),
        y: THREE.MathUtils.clamp(proj.y, 70, h - 90),
        inView,
        edgeSide,
        intensity,
        distance: dist,
        biteCharge: m?.biteCharge ?? 0,
        isDiving: m?.isDiving ?? false,
      };
    });

    const nearestEar: 'left' | 'center' | 'right' =
      nearestPan < -0.22 ? 'left' : nearestPan > 0.22 ? 'right' : 'center';

    const lockOnMarkers: LockOnMarker[] = this.lockedBugs.map((lb) => {
      const proj = this.projectToScreen(lb.pos);
      return {
        id: lb.id,
        kind: lb.kind,
        x: THREE.MathUtils.clamp(proj.x, 36, w - 36),
        y: THREE.MathUtils.clamp(proj.y, 76, h - 96),
        lockedIndex: lb.lockedIndex,
        clapped: lb.clapped,
      };
    });

    if (force || this.bugs.length >= 0) {
      this.onSnapshot({
        phase: this.phase,
        panicDuration: this.panicDuration,
        timeRemaining: this.timeRemaining,
        isPanicSurge,
        score: this.score,
        highScore: this.highScore,
        kills: this.kills,
        flyKills: this.flyKills,
        mosquitoKills: this.mosquitoKills,
        clapKills: this.clapKills,
        leftSmashKills: this.leftSmashKills,
        rightSmashKills: this.rightSmashKills,
        superSmashes: this.superSmashes,
        superComboStep: this.superComboStep,
        superComboPhase: this.superComboPhase,
        superStandFlash: this.superStandFlash,
        lockOnActive: this.superComboPhase !== 'none',
        lockOnMarkers,
        screenShakeIntensity: this.shakeIntensity,
        cryPreference: this.cryPreference,
        activeStandCry: this.activeStandCry,
        combo: this.combo,
        maxCombo: this.maxCombo,
        health: this.health,
        maxHealth: this.maxHealth,
        justBrokeHeart: this.justBrokeHeart,
        dengueLosses: this.dengueLosses,
        dengueMaxLosses: this.dengueMaxLosses,
        totalWins: this.totalWins,
        unlockedEquipment: [...this.unlockedEquipment],
        equippedId: this.equippedId,
        newlyAwardedEquipment: this.newlyAwardedEquipment,
        buzzIntensity,
        nearestBugDist: Number.isFinite(nearestDist) ? nearestDist : null,
        nearestBugKind: nearestKind,
        nearestEar,
        activeBugsCount: this.bugs.length,
        muted: this.audio.isMuted(),
        bgmEnabled: this.audio.isBgmEnabled(),
        audioUnlocked: this.audio.isUnlocked(),
        biteFlash: this.biteFlash,
        weatherLabel: wState.label,
        weatherMode: this.weatherSystem.getMode(),
        location: this.environments.getLocation(),
        mosquitoFrenzyTier: this.weatherSystem.getWeatherTier(),
        mosquitoFrenzyActive: this.weatherSystem.getWeatherTier() !== 'calm',
        windPercent: Math.round(wState.windStrength * 100),
        rainPercent: Math.round(wState.rainIntensity * 100),
        webglLost: this.webglLost,
        bugMarkers,
      });
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.clearAllBugs();
    this.weatherSystem.dispose();
    this.audio.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
