import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Bath,
  BookOpen,
  Camera,
  CameraOff,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Crosshair,
  ExternalLink,
  Hand,
  Heart,
  HeartCrack,
  History,
  Home,
  LogIn,
  LogOut,
  MapPin,
  Megaphone,
  Moon,
  Music,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import {
  ensureAndLoadUserProfile,
  fetchRecentRuns,
  logRunToCloud,
  signInWithGoogle,
  signOutUser,
  subscribeAuth,
  syncUserProgressToCloud,
  type CloudRunRecord,
} from './firebase';
import {
  SPECIAL_EQUIPMENT_LIST,
  getEquipmentById,
  type EquipmentId,
} from './game/Equipment';
import { BACKGROUND_LOCATIONS, type BackgroundLocation } from './game/SceneEnvironments';
import { STAND_CRY_LIBRARY, getStandCryById, type StandCryId } from './game/StandCries';
import {
  SwatGameEngine,
  type FloatingCallout,
  type GameHudSnapshot,
  type MatchFinishSummary,
  type PanicDuration,
  type SavedProgress,
} from './game/SwatGameEngine';
import type { WeatherMode } from './game/WeatherSystem';
import { WebcamHandTracker, type WebcamGesture } from './game/WebcamHandTracker';

const INITIAL_HUD: GameHudSnapshot = {
  phase: 'title',
  panicDuration: 30,
  timeRemaining: 30,
  isPanicSurge: false,
  score: 0,
  highScore: 0,
  kills: 0,
  flyKills: 0,
  mosquitoKills: 0,
  clapKills: 0,
  leftSmashKills: 0,
  rightSmashKills: 0,
  superSmashes: 0,
  superComboStep: 0,
  superComboPhase: 'none',
  superStandFlash: 0,
  lockOnActive: false,
  lockOnMarkers: [],
  screenShakeIntensity: 0,
  cryPreference: 'random',
  activeStandCry: null,
  combo: 0,
  maxCombo: 0,
  health: 3,
  maxHealth: 3,
  justBrokeHeart: false,
  dengueLosses: 0,
  dengueMaxLosses: 3,
  totalWins: 0,
  unlockedEquipment: [],
  equippedId: null,
  newlyAwardedEquipment: null,
  buzzIntensity: 0,
  nearestBugDist: null,
  nearestBugKind: null,
  nearestEar: 'center',
  activeBugsCount: 0,
  muted: false,
  bgmEnabled: false,
  audioUnlocked: false,
  biteFlash: 0,
  weatherLabel: 'Fan Breeze, Smoke & Dust',
  weatherMode: 'auto',
  location: 'room',
  mosquitoFrenzyTier: 'calm',
  mosquitoFrenzyActive: false,
  windPercent: 22,
  rainPercent: 25,
  webglLost: false,
  bugMarkers: [],
};

const WEATHER_OPTIONS: { mode: WeatherMode; label: string }[] = [
  { mode: 'auto', label: 'Dynamic Auto' },
  { mode: 'calm', label: 'Breeze' },
  { mode: 'windy', label: 'Windy' },
  { mode: 'stormy', label: 'Stormy' },
];

const PANIC_OPTIONS: { duration: PanicDuration; label: string; subtitle: string }[] = [
  { duration: 15, label: '15 SEC', subtitle: 'Quick Panic' },
  { duration: 30, label: '30 SEC', subtitle: 'Fever Swarm' },
  { duration: 60, label: '60 SEC', subtitle: 'Nightmare' },
];

const INTEL_PRESETS = [
  'Aedes mosquito dengue risk during rainy wind weather',
  'Early symptoms of Dengue fever and when to seek hospital care',
  'Best ways to stop mosquitoes biting at night indoors',
];

function KillTheBugLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2">
      <svg
        viewBox="0 0 40 40"
        className={compact ? 'h-7 w-7 shrink-0' : 'h-11 w-11 shrink-0'}
        aria-hidden="true"
      >
        <polygon
          points="20,2 25,14 38,14 27,22 31,36 20,27 9,36 13,22 2,14 15,14"
          fill="#facc15"
          stroke="#090612"
          strokeWidth="2.5"
        />
        <circle cx="20" cy="20" r="6" fill="#e11d48" stroke="#090612" strokeWidth="2" />
        <path d="M13 13 L27 27 M27 13 L13 27" stroke="#090612" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span
        className={`font-anime font-black italic lowercase tracking-tight text-amber-300 drop-shadow-[3px_3px_0_#090612] leading-none ${
          compact ? 'text-2xl' : 'text-5xl'
        }`}
      >
        killthebug
      </span>
    </div>
  );
}

function KillBreakdownPanel({ hud }: { hud: GameHudSnapshot }) {
  const total = hud.mosquitoKills + hud.flyKills;
  const mosquitoPct = total > 0 ? Math.round((hud.mosquitoKills / total) * 100) : 0;
  const flyPct = total > 0 ? 100 - mosquitoPct : 0;

  let badgeLabel = 'No Targets Hit';
  let badgeClass = 'bg-slate-800 text-slate-300';
  if (total > 0) {
    if (hud.mosquitoKills > hud.flyKills) {
      badgeLabel = 'Bloodsucker Precision';
      badgeClass = 'bg-rose-500 text-white';
    } else if (hud.mosquitoKills === hud.flyKills) {
      badgeLabel = 'Dual-Threat Defense';
      badgeClass = 'bg-amber-400 text-slate-950';
    } else {
      badgeLabel = 'Swarm Sweeper';
      badgeClass = 'bg-lime-400 text-slate-950';
    }
  }

  return (
    <div className="mt-4 rounded-xl border-2 border-slate-950 bg-slate-950/90 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-300">
          <Crosshair className="h-3.5 w-3.5" />
          <span>Mosquito vs. Fly Breakdown</span>
        </div>
        <span
          className={`rounded border border-slate-950 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${badgeClass}`}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Proportional Split Bar */}
      <div
        className="mt-2.5 flex h-3 w-full overflow-hidden rounded-sm border border-slate-800 bg-slate-900"
        aria-label={`Mosquitoes ${mosquitoPct}%, Flies ${flyPct}%`}
      >
        {total > 0 ? (
          <>
            {hud.mosquitoKills > 0 && (
              <div
                className="h-full bg-rose-500 transition-all"
                style={{ width: `${mosquitoPct}%` }}
              />
            )}
            {hud.flyKills > 0 && (
              <div
                className="h-full bg-lime-400 transition-all"
                style={{ width: `${flyPct}%` }}
              />
            )}
          </>
        ) : (
          <div className="h-full w-full bg-slate-800" />
        )}
      </div>

      {/* Mosquito vs Fly Cards */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-rose-500/35 bg-rose-950/50 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="font-extrabold uppercase text-rose-300">Mosquitoes</span>
            <span className="font-mono-tabular text-[11px] font-bold text-rose-200">
              {mosquitoPct}%
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between">
            <span className="font-mono-tabular text-xl font-black text-white">
              {hud.mosquitoKills}
            </span>
            <span className="text-[10px] font-semibold text-rose-200/80">150 pts base</span>
          </div>
        </div>

        <div className="rounded-lg border border-lime-400/35 bg-emerald-950/50 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="font-extrabold uppercase text-lime-300">Horror Flies</span>
            <span className="font-mono-tabular text-[11px] font-bold text-lime-200">
              {flyPct}%
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between">
            <span className="font-mono-tabular text-xl font-black text-white">
              {hud.flyKills}
            </span>
            <span className="text-[10px] font-semibold text-lime-200/80">100 pts base</span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px] font-semibold text-slate-300">
        <span>
          Claps <strong className="font-mono-tabular text-amber-300">{hud.clapKills}</strong> · Left{' '}
          <strong className="font-mono-tabular text-sky-300">{hud.leftSmashKills}</strong> · Right{' '}
          <strong className="font-mono-tabular text-fuchsia-300">{hud.rightSmashKills}</strong>
        </span>
        <span>
          Max Combo <strong className="font-mono-tabular text-amber-300">{hud.maxCombo}x</strong>
        </span>
      </div>
    </div>
  );
}

export function App() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SwatGameEngine | null>(null);
  const webcamRef = useRef<WebcamHandTracker | null>(null);
  const webcamPreviewRef = useRef<HTMLCanvasElement | null>(null);

  const [hud, setHud] = useState<GameHudSnapshot>(INITIAL_HUD);
  const [selectedDuration, setSelectedDuration] = useState<PanicDuration>(30);
  const [callouts, setCallouts] = useState<FloatingCallout[]>([]);
  const [reticlePos, setReticlePos] = useState<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 640,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 360,
  });
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [activeActionFlash, setActiveActionFlash] = useState<'clap' | 'left' | 'right' | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  // Firebase Auth & Cloud Runs
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showRunsModal, setShowRunsModal] = useState(false);
  const [recentRuns, setRecentRuns] = useState<CloudRunRecord[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  // Dengue Intel Grounding Drawer (Gemini Search)
  const [showIntelModal, setShowIntelModal] = useState(false);
  const [intelQuery, setIntelQuery] = useState(INTEL_PRESETS[0]);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelAnswer, setIntelAnswer] = useState<string | null>(null);
  const [intelSources, setIntelSources] = useState<{ title: string; uri: string }[]>([]);
  const [intelError, setIntelError] = useState<string | null>(null);

  const flashAction = useCallback((kind: 'clap' | 'left' | 'right') => {
    setActiveActionFlash(kind);
    window.setTimeout(() => {
      setActiveActionFlash((prev) => (prev === kind ? null : prev));
    }, 180);
  }, []);

  const handleCallout = useCallback((callout: FloatingCallout) => {
    setCallouts((prev) => [...prev.slice(-8), callout]);
    window.setTimeout(() => {
      setCallouts((prev) => prev.filter((c) => c.id !== callout.id));
    }, 900);
  }, []);

  const handleMatchFinish = useCallback(
    async (summary: MatchFinishSummary, progress: SavedProgress) => {
      const activeUser = userRef.current;
      if (!activeUser) return;
      try {
        await syncUserProgressToCloud(activeUser, progress);
        await logRunToCloud(activeUser, summary);
      } catch (err) {
        console.error('Failed to sync match to Firestore:', err);
      }
    },
    [],
  );

  useEffect(() => {
    const unsub = subscribeAuth(async (nextUser) => {
      userRef.current = nextUser;
      setUser(nextUser);
      if (nextUser && engineRef.current) {
        try {
          const cloudProfile = await ensureAndLoadUserProfile(
            nextUser,
            engineRef.current.getProgress(),
          );
          engineRef.current.applyCloudProfile({
            highScore: cloudProfile.highScore,
            dengueLosses: cloudProfile.dengueLosses,
            totalWins: cloudProfile.totalWins,
            unlockedEquipment: cloudProfile.unlockedEquipment,
            equippedId: cloudProfile.equippedId === 'none' ? null : cloudProfile.equippedId,
          });
        } catch (err) {
          console.error('Failed loading cloud profile:', err);
        }
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    const engine = new SwatGameEngine(container, setHud, handleCallout, handleMatchFinish);
    engineRef.current = engine;

    if (userRef.current) {
      ensureAndLoadUserProfile(userRef.current, engine.getProgress())
        .then((cloudProfile) => {
          engine.applyCloudProfile({
            highScore: cloudProfile.highScore,
            dengueLosses: cloudProfile.dengueLosses,
            totalWins: cloudProfile.totalWins,
            unlockedEquipment: cloudProfile.unlockedEquipment,
            equippedId: cloudProfile.equippedId === 'none' ? null : cloudProfile.equippedId,
          });
        })
        .catch((err) => console.error('Initial profile sync failed:', err));
    }

    const tracker = new WebcamHandTracker((gesture: WebcamGesture, aimX: number, aimY: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.setAimNdc(aimX, aimY);
      if (gesture === 'clap') {
        eng.triggerClap();
        flashAction('clap');
      } else if (gesture === 'smash_left') {
        eng.triggerSmash('left');
        flashAction('left');
      } else {
        eng.triggerSmash('right');
        flashAction('right');
      }
    });
    webcamRef.current = tracker;

    return () => {
      tracker.dispose();
      engine.dispose();
      engineRef.current = null;
      webcamRef.current = null;
    };
  }, [flashAction, handleCallout, handleMatchFinish]);

  useEffect(() => {
    if (webcamRef.current) {
      webcamRef.current.attachPreviewCanvas(webcamActive ? webcamPreviewRef.current : null);
    }
  }, [webcamActive]);

  const handleSelectDuration = useCallback((dur: PanicDuration) => {
    setSelectedDuration(dur);
    engineRef.current?.setPanicDuration(dur);
  }, []);

  const handleStartGame = useCallback(async () => {
    if (!engineRef.current) return;
    setShowIntelModal(false);
    setShowRunsModal(false);
    await engineRef.current.startGame(selectedDuration);
  }, [selectedDuration]);

  const handleEquip = useCallback(
    (id: EquipmentId) => {
      if (!engineRef.current) return;
      const next = hud.equippedId === id ? null : id;
      engineRef.current.equipItem(next);
      if (userRef.current) {
        syncUserProgressToCloud(userRef.current, engineRef.current.getProgress()).catch((err) =>
          console.error('Failed syncing equipped gear:', err),
        );
      }
    },
    [hud.equippedId],
  );

  const handleDischarge = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.dischargeFromHospital();
    if (userRef.current) {
      syncUserProgressToCloud(userRef.current, engineRef.current.getProgress()).catch((err) =>
        console.error('Failed syncing discharge:', err),
      );
    }
  }, []);

  const handleClap = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.triggerClap();
    flashAction('clap');
  }, [flashAction]);

  const handleLeftSmash = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.triggerSmash('left');
    flashAction('left');
  }, [flashAction]);

  const handleRightSmash = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.triggerSmash('right');
    flashAction('right');
  }, [flashAction]);

  const handleToggleMute = useCallback(async () => {
    if (!engineRef.current) return;
    await engineRef.current.audio.unlock();
    engineRef.current.audio.toggleMute();
  }, []);

  const handleToggleBgm = useCallback(async () => {
    if (!engineRef.current) return;
    await engineRef.current.audio.toggleBgm();
  }, []);

  const handleSelectCry = useCallback(async (pref: 'random' | StandCryId) => {
    if (!engineRef.current) return;
    engineRef.current.setCryPreference(pref);
    await engineRef.current.previewStandCry(pref === 'random' ? undefined : pref);
  }, []);

  const handleCycleCry = useCallback(async () => {
    if (!engineRef.current) return;
    const next = engineRef.current.cycleCryPreference();
    await engineRef.current.previewStandCry(next === 'random' ? undefined : next);
  }, []);

  const handleSelectWeatherMode = useCallback((mode: WeatherMode) => {
    engineRef.current?.setWeatherMode(mode);
  }, []);

  const handleCycleWeatherMode = useCallback(() => {
    engineRef.current?.cycleWeatherMode();
  }, []);

  const handleSelectLocation = useCallback((loc: BackgroundLocation) => {
    engineRef.current?.setLocation(loc);
  }, []);

  const handleCycleLocation = useCallback(() => {
    engineRef.current?.cycleLocation();
  }, []);

  const handleToggleWebcam = useCallback(async () => {
    const tracker = webcamRef.current;
    if (!tracker) return;
    if (tracker.isActive()) {
      tracker.disable();
      setWebcamActive(false);
      setWebcamError(null);
    } else {
      const res = await tracker.enable();
      setWebcamActive(res.ok);
      setWebcamError(res.ok ? null : res.error || 'Camera unavailable');
    }
  }, []);

  const handleSignIn = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In cancelled');
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setAuthBusy(true);
    try {
      await signOutUser();
      setRecentRuns([]);
      setShowRunsModal(false);
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleOpenRunsModal = useCallback(async () => {
    if (!userRef.current) return;
    setShowRunsModal(true);
    setRunsLoading(true);
    try {
      const runs = await fetchRecentRuns(userRef.current);
      setRecentRuns(runs);
    } catch (err) {
      console.error('Failed loading match history:', err);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const fetchDengueIntel = useCallback(async (queryText: string) => {
    setIntelLoading(true);
    setIntelError(null);
    try {
      const res = await fetch('/api/search/dengue-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText }),
      });
      const data = (await res.json()) as {
        text?: string;
        sources?: { title: string; uri: string }[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch Dengue intelligence');
      }
      setIntelAnswer(data.text || 'No response returned.');
      setIntelSources(Array.isArray(data.sources) ? data.sources : []);
    } catch (err) {
      setIntelError(err instanceof Error ? err.message : 'Failed fetching intel');
    } finally {
      setIntelLoading(false);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (showIntelModal || showRunsModal) return;
      const code = e.code;

      if (code === 'Space' || code === 'KeyW' || code === 'KeyC') {
        e.preventDefault();
        if (hud.phase === 'playing') {
          handleClap();
        } else if (hud.phase === 'hospitalized') {
          handleDischarge();
        } else {
          handleStartGame();
        }
      } else if (code === 'KeyQ' || code === 'KeyA' || code === 'KeyF') {
        e.preventDefault();
        handleLeftSmash();
      } else if (code === 'KeyE' || code === 'KeyD' || code === 'KeyJ') {
        e.preventDefault();
        handleRightSmash();
      } else if (code === 'KeyM') {
        handleToggleMute();
      } else if (code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleClap,
    handleDischarge,
    handleLeftSmash,
    handleRightSmash,
    handleStartGame,
    handleToggleMute,
    hud.phase,
    showIntelModal,
    showRunsModal,
  ]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setReticlePos({ x: e.clientX, y: e.clientY });
    engineRef.current?.setAimFromPointer(e.clientX, e.clientY);
  }, []);

  const handleViewportPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (hud.phase !== 'playing') return;
      if (showIntelModal || showRunsModal) return;
      if ((e.target as HTMLElement).closest('button, a, input')) return;

      engineRef.current?.setAimFromPointer(e.clientX, e.clientY);
      setReticlePos({ x: e.clientX, y: e.clientY });

      if (e.button === 1 || e.buttons === 3) {
        e.preventDefault();
        handleClap();
      } else if (e.button === 2) {
        e.preventDefault();
        handleRightSmash();
      } else if (e.button === 0) {
        handleLeftSmash();
      }
    },
    [handleClap, handleLeftSmash, handleRightSmash, hud.phase, showIntelModal, showRunsModal],
  );

  const buzzPercent = Math.round(hud.buzzIntensity * 100);
  const earLabel =
    hud.nearestBugDist === null
      ? 'Air clear'
      : hud.nearestEar === 'left'
        ? 'Left ear buzz'
        : hud.nearestEar === 'right'
          ? 'Right ear buzz'
          : 'Front buzz';
  const equippedGear = getEquipmentById(hud.equippedId);
  const hasDivingThreat = hud.bugMarkers.some((m) => m.isDiving && m.biteCharge > 0.2);
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hudShakeX =
    !prefersReducedMotion && hud.screenShakeIntensity > 0.08
      ? Math.sin(hud.screenShakeIntensity * 79) * Math.min(8, hud.screenShakeIntensity * 7.5)
      : 0;
  const hudShakeY =
    !prefersReducedMotion && hud.screenShakeIntensity > 0.08
      ? Math.cos(hud.screenShakeIntensity * 97) * Math.min(7, hud.screenShakeIntensity * 6.5)
      : 0;

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-[#160d26] select-none"
      onPointerMove={handlePointerMove}
      onPointerDown={handleViewportPointerDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Dedicated WebGL Mount Container */}
      <div
        ref={viewportRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        aria-label="killthebug 3D Defense Viewport"
      />

      {/* JoJo Manga Speedlines during Panic Surge, Lock-On Scene, or Super Stand Slam */}
      {hud.phase === 'playing' &&
        (hud.isPanicSurge || hud.lockOnActive || hud.superStandFlash > 0.1) && (
          <div className="speedlines-overlay pointer-events-none absolute inset-0 z-10" />
        )}

      {/* Lock-On Scene & Per-Bug Multi-Clap Cut-In Overlay */}
      {hud.phase === 'playing' && hud.lockOnActive && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            transform:
              hudShakeX !== 0 || hudShakeY !== 0
                ? `translate3d(${hudShakeX.toFixed(1)}px, ${hudShakeY.toFixed(1)}px, 0)`
                : undefined,
          }}
        >
          {/* Anime Cut-In Letterbox Bars during Lock-On & Clap Barrage */}
          {(hud.superComboPhase === 'lockon' || hud.superComboPhase === 'barrage') && (
            <>
              <div className="absolute inset-x-0 top-0 h-5 border-b-2 border-amber-400/80 bg-[#090612]" />
              <div className="absolute inset-x-0 bottom-0 h-5 border-t-2 border-amber-400/80 bg-[#090612]" />
            </>
          )}

          {/* Lock-On Phase Banner */}
          <div className="flex justify-center pt-24">
            <div className="manga-panel-gold border-2 border-slate-950 bg-[#090612]/95 px-4 py-1 text-center">
              <div className="font-anime text-xs font-black uppercase tracking-[0.22em] text-amber-300">
                {hud.superComboPhase === 'lockon'
                  ? `LOCK-ON ACQUIRED // ${hud.lockOnMarkers.length} TARGET${hud.lockOnMarkers.length === 1 ? '' : 'S'}`
                  : hud.superComboPhase === 'barrage'
                    ? 'STAND MULTI-CLAP BARRAGE!!'
                    : 'MULTI-HAND FLOOR CRUSH!!'}
              </div>
            </div>
          </div>

          {/* Per-Bug Lock-On Corner Brackets */}
          {hud.lockOnMarkers.map((m) => (
            <div
              key={m.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: m.x, top: m.y }}
            >
              <div
                className={`relative h-16 w-16 transition-transform duration-100 ${
                  m.clapped ? 'scale-110' : 'scale-100'
                }`}
              >
                <span
                  className={`absolute left-0 top-0 h-4 w-4 border-l-4 border-t-4 ${
                    m.clapped ? 'border-fuchsia-400' : 'border-amber-300'
                  }`}
                />
                <span
                  className={`absolute right-0 top-0 h-4 w-4 border-r-4 border-t-4 ${
                    m.clapped ? 'border-fuchsia-400' : 'border-amber-300'
                  }`}
                />
                <span
                  className={`absolute bottom-0 left-0 h-4 w-4 border-b-4 border-l-4 ${
                    m.clapped ? 'border-fuchsia-400' : 'border-amber-300'
                  }`}
                />
                <span
                  className={`absolute bottom-0 right-0 h-4 w-4 border-b-4 border-r-4 ${
                    m.clapped ? 'border-fuchsia-400' : 'border-amber-300'
                  }`}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className={`h-2.5 w-2.5 rotate-45 border border-slate-950 ${
                      m.clapped ? 'bg-fuchsia-400' : 'bg-rose-500'
                    }`}
                  />
                </div>
              </div>
              <div className="mt-1 flex flex-col items-center">
                <span
                  className={`border border-slate-950 px-1.5 py-0.5 font-mono-tabular text-[10px] font-black uppercase leading-none ${
                    m.clapped
                      ? 'bg-fuchsia-500 text-white'
                      : 'bg-amber-400 text-slate-950'
                  }`}
                >
                  {m.clapped
                    ? 'CLAPPED!!'
                    : `LOCK ${String(m.lockedIndex).padStart(2, '0')} · ${
                        m.kind === 'mosquito' ? 'MOSQUITO' : 'FLY'
                      }`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Golden-Violet Flash & JoJo Katakana Stand Cry Burst on Super Hand Floor Smash */}
      {hud.superStandFlash > 0.02 && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-32"
          style={{
            opacity: Math.min(1, hud.superStandFlash * 1.15),
            boxShadow: 'inset 0 0 130px 44px rgba(250, 204, 21, 0.72)',
            transform:
              hudShakeX !== 0 || hudShakeY !== 0
                ? `translate3d(${hudShakeX.toFixed(1)}px, ${hudShakeY.toFixed(1)}px, 0)`
                : undefined,
          }}
        >
          {hud.activeStandCry && (
            <div className="text-center">
              <div className="font-anime text-4xl sm:text-5xl font-black italic tracking-widest text-amber-300 drop-shadow-[4px_4px_0_#090612]">
                {hud.activeStandCry.katakana}
              </div>
              <div className="font-anime mt-1 text-lg sm:text-xl font-black uppercase tracking-wider text-fuchsia-300 drop-shadow-[2px_2px_0_#090612]">
                {hud.activeStandCry.mangaShout}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Menacing Katakana Aura when bugs close in */}
      {hud.phase === 'playing' && (hud.buzzIntensity > 0.52 || hud.isPanicSurge) && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          <div className="animate-menacing font-anime absolute left-6 top-28 text-4xl font-black tracking-widest text-fuchsia-400 drop-shadow-[3px_3px_0_#090612]">
            ゴゴゴゴ
          </div>
          <div className="animate-menacing font-anime absolute right-8 bottom-32 text-4xl font-black tracking-widest text-amber-300 drop-shadow-[3px_3px_0_#090612]">
            ゴゴゴ
          </div>
        </div>
      )}

      {/* Blood-Suck Heart Break Red Flash */}
      {hud.biteFlash > 0.02 && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            opacity: Math.min(0.75, hud.biteFlash * 0.75),
            boxShadow: 'inset 0 0 110px 36px rgba(244, 63, 94, 0.85)',
          }}
        />
      )}

      {/* Ear-Proximity Warning Glow */}
      {hud.phase === 'playing' && hud.buzzIntensity > 0.45 && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            boxShadow:
              hud.nearestEar === 'left'
                ? `inset 54px 0 68px -24px rgba(250, 204, 21, ${hud.buzzIntensity * 0.5})`
                : hud.nearestEar === 'right'
                  ? `inset -54px 0 68px -24px rgba(250, 204, 21, ${hud.buzzIntensity * 0.5})`
                  : `inset 0 0 64px -18px rgba(217, 70, 239, ${hud.buzzIntensity * 0.35})`,
          }}
        />
      )}

      {/* WebGL Context Lost Fallback */}
      {hud.webglLost && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#130b20] p-6">
          <div className="manga-panel-gold max-w-md rounded-xl border-2 border-slate-950 bg-slate-900 p-6 text-center">
            <h2 className="font-anime text-2xl font-black uppercase text-amber-300">
              Graphics Context Paused
            </h2>
            <p className="mt-2 text-sm text-slate-200">
              WebGL rendering paused temporarily. Reload or wait a moment for restoration.
            </p>
          </div>
        </div>
      )}

      {/* Bug Edge Markers & Dive-Bite Warning Rings */}
      {hud.phase === 'playing' &&
        hud.bugMarkers.map((m) => (
          <div
            key={m.id}
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: m.x, top: m.y }}
          >
            {!m.inView ? (
              <div
                className={`manga-panel border-2 border-slate-950 px-2 py-0.5 text-xs font-extrabold uppercase ${
                  m.kind === 'mosquito'
                    ? 'bg-rose-600 text-white'
                    : 'bg-amber-400 text-slate-950'
                }`}
              >
                {m.edgeSide === 'left' ? '← ' : m.edgeSide === 'right' ? '→ ' : ''}
                {m.kind === 'mosquito' ? 'Mosquito!' : 'Fly!'}
              </div>
            ) : m.biteCharge > 0.15 ? (
              <div className="flex flex-col items-center">
                <div
                  className="h-11 w-11 rounded-full border-4 border-rose-500 bg-rose-500/20"
                  style={{ transform: `scale(${0.95 + m.biteCharge * 0.5})` }}
                />
                {m.biteCharge > 0.45 && (
                  <span className="font-anime mt-0.5 bg-rose-600 px-1.5 text-xs font-black uppercase tracking-wider text-white">
                    BITING!
                  </span>
                )}
              </div>
            ) : null}
          </div>
        ))}

      {/* Custom Anime Target Reticle */}
      {hud.phase === 'playing' && !showIntelModal && !showRunsModal && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
          style={{ left: reticlePos.x, top: reticlePos.y }}
        >
          <div
            className={`relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-transform duration-100 ${
              activeActionFlash === 'clap'
                ? 'scale-75 border-amber-300 bg-amber-400/25'
                : activeActionFlash
                  ? 'scale-90 border-fuchsia-400 bg-fuchsia-400/20'
                  : hasDivingThreat
                    ? 'border-rose-400 bg-rose-500/15'
                    : 'border-amber-200/80 bg-white/5'
            }`}
          >
            <div className="h-2 w-2 rotate-45 bg-amber-300 shadow-[0_0_6px_#facc15]" />
          </div>
        </div>
      )}

      {/* JoJo Manga Onomatopoeia Callouts */}
      {callouts.map((c) => (
        <div
          key={c.id}
          className="animate-jojo-pop pointer-events-none absolute z-30 text-center"
          style={{ left: c.x, top: c.y }}
        >
          <div
            className={`font-anime text-2xl font-black italic tracking-wide drop-shadow-[3px_3px_0_#090612] ${
              c.accent === 'gold'
                ? 'text-amber-300'
                : c.accent === 'crimson'
                  ? 'text-rose-500'
                  : c.accent === 'violet'
                    ? 'text-fuchsia-400'
                    : 'text-lime-300'
            }`}
          >
            {c.text}
          </div>
          {c.subText && (
            <div className="text-xs font-extrabold uppercase tracking-wider text-white drop-shadow-[2px_2px_0_#090612]">
              {c.subText}
            </div>
          )}
        </div>
      ))}

      {/* Top Manga HUD (No backdrop-blur over WebGL) */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-2.5 p-3 sm:p-4">
        {/* Left Zone: Brand + Hearts + Score */}
        <div className="pointer-events-auto manga-panel flex items-center gap-3.5 rounded-xl border-2 border-slate-950 bg-[#1a102b]/95 px-3.5 py-2">
          <div>
            <KillTheBugLogo compact />
            <div className="mt-0.5 text-[11px] font-semibold text-fuchsia-200 whitespace-nowrap">
              {equippedGear ? equippedGear.name : 'Bare Hands'} · {hud.kills} splashed
            </div>
          </div>

          <div className="h-8 w-0.5 bg-white/15" aria-hidden="true" />

          {/* 3-Heart Body Defense Meter */}
          <div
            className={`flex items-center gap-1 ${hud.justBrokeHeart ? 'animate-heart-break' : ''}`}
            aria-label={`${hud.health} of ${hud.maxHealth} hearts intact`}
          >
            {Array.from({ length: hud.maxHealth }).map((_, idx) =>
              idx < hud.health ? (
                <Heart
                  key={idx}
                  className="h-5 w-5 fill-rose-500 text-slate-950 drop-shadow-[2px_2px_0_#090612]"
                />
              ) : (
                <HeartCrack key={idx} className="h-5 w-5 text-slate-500 opacity-65" />
              ),
            )}
          </div>

          <div className="h-8 w-0.5 bg-white/15" aria-hidden="true" />

          <div className="flex items-center gap-3 text-sm">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Score</span>
              <div className="font-mono-tabular text-base font-bold leading-tight text-amber-300">
                {hud.score.toLocaleString()}
              </div>
            </div>
            <div className="hidden sm:block">
              <span className="text-[10px] font-bold uppercase text-slate-400">Combo</span>
              <div className="font-mono-tabular text-base font-bold leading-tight text-fuchsia-300">
                {hud.combo}x
              </div>
            </div>
          </div>
        </div>

        {/* Center Zone: Panic Attack Countdown + Storm Frenzy Badge */}
        {hud.phase === 'playing' && (
          <div className="pointer-events-auto flex flex-col items-center gap-1.5">
            <div
              className={`manga-panel flex flex-col items-center rounded-xl border-2 border-slate-950 px-4 py-1.5 ${
                hud.isPanicSurge ? 'bg-rose-600 text-white' : 'bg-amber-400 text-slate-950'
              }`}
            >
              <span className="text-[10px] font-extrabold uppercase tracking-widest">
                {hud.isPanicSurge ? 'PANIC ATTACK SURGE!' : `DEFEND ${hud.panicDuration}S`}
              </span>
              <span className="font-mono-tabular text-2xl font-extrabold leading-none">
                {hud.timeRemaining.toFixed(1)}s
              </span>
            </div>

            {hud.mosquitoFrenzyActive && (
              <div
                className={`manga-panel flex items-center gap-1.5 rounded-lg border-2 border-slate-950 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${
                  hud.mosquitoFrenzyTier === 'stormy'
                    ? 'bg-rose-600 text-white'
                    : 'bg-amber-300 text-slate-950'
                }`}
              >
                {hud.mosquitoFrenzyTier === 'stormy' ? (
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Wind className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>
                  {hud.mosquitoFrenzyTier === 'stormy'
                    ? 'Storm Frenzy · Mosquito Dash!'
                    : 'Windy Surge · Erratic Zigzag'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Right Zone: Buzz Meter + Audio/BGM + Webcam + Dengue Intel + Auth */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="hidden lg:flex manga-panel flex-col gap-1 rounded-xl border-2 border-slate-950 bg-[#1a102b]/95 px-3 py-1.5 min-w-[156px]">
            <div className="flex items-center justify-between gap-2 text-xs font-bold">
              <span className="text-slate-200 truncate">{earLabel}</span>
              <span className="font-mono-tabular text-amber-300">{buzzPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-sm border border-slate-950 bg-slate-900">
              <div
                className={`h-full transition-all duration-75 ${
                  buzzPercent > 70
                    ? 'bg-rose-500'
                    : buzzPercent > 35
                      ? 'bg-amber-400'
                      : 'bg-fuchsia-400'
                }`}
                style={{ width: `${Math.max(4, buzzPercent)}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleMute}
            className="manga-panel flex h-9 items-center gap-1.5 rounded-xl border-2 border-slate-950 bg-[#1a102b]/95 px-2.5 text-xs font-bold text-white hover:bg-purple-900"
            title={hud.muted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
          >
            {hud.muted ? (
              <VolumeX className="h-4 w-4 text-rose-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-amber-300" />
            )}
            <span className="hidden sm:inline">{hud.muted ? 'Muted' : 'SFX'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleBgm}
            className={`manga-panel flex h-9 items-center gap-1.5 rounded-xl border-2 border-slate-950 px-2.5 text-xs font-bold ${
              hud.bgmEnabled
                ? 'bg-fuchsia-600 text-white'
                : 'bg-[#1a102b]/95 text-slate-200 hover:bg-purple-900'
            }`}
            title="Toggle Procedural JoJo Battle Synth BGM"
          >
            <Music className="h-4 w-4" />
            <span className="hidden md:inline">BGM</span>
          </button>

          <button
            type="button"
            onClick={handleToggleWebcam}
            className={`manga-panel flex h-9 items-center gap-1.5 rounded-xl border-2 border-slate-950 px-2.5 text-xs font-bold ${
              webcamActive
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-[#1a102b]/95 text-white hover:bg-purple-900'
            }`}
            title="Enable Webcam Hand Tracking"
          >
            {webcamActive ? (
              <Camera className="h-4 w-4" />
            ) : (
              <CameraOff className="h-4 w-4 text-slate-300" />
            )}
            <span className="hidden md:inline">Cam</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowIntelModal(true);
              if (!intelAnswer) {
                void fetchDengueIntel(intelQuery);
              }
            }}
            className="manga-panel flex h-9 items-center gap-1.5 rounded-xl border-2 border-slate-950 bg-[#1a102b]/95 px-2.5 text-xs font-bold text-amber-300 hover:bg-purple-900"
            title="Live Dengue & Mosquito Intelligence (Google Search)"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden xl:inline">Dengue Intel</span>
          </button>

          {user ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleOpenRunsModal}
                className="manga-panel flex h-9 items-center gap-1.5 rounded-xl border-2 border-slate-950 bg-emerald-500 px-2.5 text-xs font-extrabold text-slate-950 hover:bg-emerald-400"
                title="View Cloud Match History"
              >
                <History className="h-3.5 w-3.5" />
                <span className="max-w-[90px] truncate">{user.displayName || 'Saved'}</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={authBusy}
                className="manga-panel flex h-9 w-9 items-center justify-center rounded-xl border-2 border-slate-950 bg-[#1a102b]/95 text-slate-300 hover:bg-rose-900 hover:text-white"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              disabled={authBusy}
              className="manga-panel flex h-9 items-center gap-1.5 rounded-xl border-2 border-slate-950 bg-amber-400 px-2.5 text-xs font-extrabold text-slate-950 hover:bg-amber-300"
              title="Sign in with Google to save scores & equipment"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{authBusy ? '...' : 'Save Sync'}</span>
            </button>
          )}

          {hud.phase === 'playing' && (
            <button
              type="button"
              onClick={handleStartGame}
              className="manga-panel flex h-9 w-9 items-center justify-center rounded-xl border-2 border-slate-950 bg-[#1a102b]/95 text-white hover:bg-purple-900"
              title="Restart Defense"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {authError && (
        <div className="manga-panel absolute right-4 top-16 z-30 rounded-lg border-2 border-slate-950 bg-rose-950 px-3 py-1.5 text-xs font-bold text-rose-200">
          {authError}
        </div>
      )}

      {/* Webcam Preview */}
      {(webcamActive || webcamError) && (
        <div className="manga-panel absolute right-4 top-20 z-20 rounded-xl border-2 border-slate-950 bg-[#1a102b]/95 p-2">
          {webcamActive ? (
            <div className="flex flex-col gap-1">
              <canvas
                ref={webcamPreviewRef}
                width={144}
                height={108}
                className="rounded-lg bg-slate-900"
              />
              <div className="text-[11px] font-bold text-amber-300 text-center">
                Right → Left → Clap!
              </div>
            </div>
          ) : (
            <div className="max-w-[180px] px-2 py-1 text-xs font-semibold text-rose-300">
              {webcamError}
            </div>
          )}
        </div>
      )}

      {/* Collapsible Unified Bottom Control Dock */}
      {hud.phase === 'playing' && (
        <footer className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex flex-col items-center px-3">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="pointer-events-auto manga-panel mb-1.5 flex items-center gap-1 rounded-t-lg border-2 border-b-0 border-slate-950 bg-[#1a102b]/95 px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-300 hover:bg-purple-900"
            title="Toggle Controls Dock (H)"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Show Controls (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Hide Controls (H)</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="pointer-events-auto manga-panel flex flex-col gap-1.5 rounded-2xl border-2 border-slate-950 bg-[#1a102b]/95 p-2 max-w-[94vw]">
              {/* Top Strip inside dock: Dynamic Weather + Right -> Left -> Clap Super Hand Combo Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 text-[11px] font-extrabold">
                <div className="flex flex-wrap items-center gap-2 text-sky-300">
                  <span className="inline-flex items-center gap-1">
                    <CloudRain className="h-3.5 w-3.5" />
                    {hud.weatherLabel}
                  </span>
                  <span className="inline-flex items-center gap-1 text-fuchsia-300">
                    <Wind className="h-3.5 w-3.5" />
                    Wind {hud.windPercent}%
                  </span>
                  <button
                    type="button"
                    onClick={handleCycleWeatherMode}
                    className="rounded border border-slate-950 bg-[#2a1945] px-2 py-0.5 text-[10px] font-black uppercase text-amber-300 hover:bg-[#38215c] whitespace-nowrap"
                    title="Override weather intensity (Dynamic Auto / Breeze / Windy / Stormy)"
                  >
                    Mode: {WEATHER_OPTIONS.find((w) => w.mode === hud.weatherMode)?.label ?? 'Auto'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCycleLocation}
                    className="inline-flex items-center gap-1 rounded border border-slate-950 bg-[#2a1945] px-2 py-0.5 text-[10px] font-black uppercase text-emerald-300 hover:bg-[#38215c] whitespace-nowrap"
                    title="Switch 3D battle background (Study Room / Midnight Balcony / Toilet Break)"
                  >
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span>
                      {BACKGROUND_LOCATIONS.find((l) => l.id === hud.location)?.label ??
                        'Study Room'}
                    </span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-amber-300 uppercase">Stand Aura:</span>
                  <span
                    className={`rounded px-1.5 py-0.5 border border-slate-950 ${
                      hud.superComboStep >= 1 || hud.lockOnActive
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    1. RIGHT
                  </span>
                  <span className="text-slate-400">→</span>
                  <span
                    className={`rounded px-1.5 py-0.5 border border-slate-950 ${
                      hud.superComboStep >= 2 || hud.lockOnActive
                        ? 'bg-purple-500 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    2. LEFT
                  </span>
                  <span className="text-slate-400">→</span>
                  <span
                    className={`rounded px-1.5 py-0.5 border border-slate-950 ${
                      hud.superComboStep === 2 || hud.lockOnActive
                        ? 'bg-purple-600 text-amber-200 ring-1 ring-fuchsia-300'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    3. CLAP!
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCycleCry()}
                    className="ml-1 inline-flex items-center gap-1 rounded border border-slate-950 bg-fuchsia-700 px-2 py-0.5 text-[10px] font-black uppercase text-amber-200 hover:bg-fuchsia-600"
                    title="Cycle & preview JoJo Stand vocal cry on Super Floor Smash"
                  >
                    <Megaphone className="h-3 w-3" />
                    <span>
                      Cry:{' '}
                      {hud.cryPreference === 'random'
                        ? 'Random'
                        : getStandCryById(hud.cryPreference).label}
                    </span>
                  </button>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleLeftSmash}
                  className={`flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-slate-950 px-3.5 py-1.5 text-xs sm:text-sm font-extrabold uppercase transition-transform active:scale-95 whitespace-nowrap ${
                    activeActionFlash === 'left'
                      ? 'bg-sky-400 text-slate-950'
                      : hud.superComboStep === 1
                        ? 'bg-fuchsia-600 text-white ring-2 ring-amber-300'
                        : 'bg-purple-900 text-white hover:bg-purple-800'
                  }`}
                >
                  <Hand className="h-4 w-4 -scale-x-100 text-sky-300" />
                  <span>Smash Left</span>
                  <span className="font-mono-tabular text-[11px] opacity-80">Q / L-Click</span>
                </button>

                <button
                  type="button"
                  onClick={handleClap}
                  className={`flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-slate-950 px-4 py-1.5 text-xs sm:text-sm font-black uppercase transition-transform active:scale-95 whitespace-nowrap ${
                    activeActionFlash === 'clap'
                      ? 'bg-white text-slate-950'
                      : hud.superComboStep === 2
                        ? 'bg-purple-600 text-amber-200 ring-2 ring-fuchsia-300'
                        : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                  }`}
                >
                  <Hand className="h-4 w-4 -scale-x-100" />
                  <span>{hud.superComboStep === 2 ? 'CLAP SUPER SLAM!' : 'Clap Both Hands'}</span>
                  <Hand className="h-4 w-4" />
                  <span className="font-mono-tabular text-[11px] opacity-80">Space</span>
                </button>

                <button
                  type="button"
                  onClick={handleRightSmash}
                  className={`flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-slate-950 px-3.5 py-1.5 text-xs sm:text-sm font-extrabold uppercase transition-transform active:scale-95 whitespace-nowrap ${
                    activeActionFlash === 'right'
                      ? 'bg-sky-400 text-slate-950'
                      : hud.superComboStep === 0
                        ? 'bg-purple-800 text-white ring-1 ring-amber-300/70'
                        : 'bg-purple-900 text-white hover:bg-purple-800'
                  }`}
                >
                  <span>Smash Right</span>
                  <span className="font-mono-tabular text-[11px] opacity-80">E / R-Click</span>
                  <Hand className="h-4 w-4 text-sky-300" />
                </button>
              </div>
            </div>
          )}
        </footer>
      )}

      {/* Title & Panic Mode + Special Equipment Loadout Overlay (Opaque manga panel, zero backdrop-blur) */}
      {hud.phase === 'title' && !showIntelModal && !showRunsModal && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="pointer-events-auto manga-panel-gold halftone-bg w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border-2 border-slate-950 bg-[#1a102b]/95 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-anime text-xs font-extrabold uppercase tracking-widest text-fuchsia-300">
                  JoJo Anime Bug Defense · Rain &amp; Wind Storm
                </div>
                <div className="mt-1">
                  <KillTheBugLogo />
                </div>
              </div>
              <div className="font-anime text-2xl font-black text-fuchsia-400 drop-shadow-[2px_2px_0_#090612]">
                ゴゴゴゴ
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              Survive stormy swarms of blood-sucking mosquitoes &amp; horror flies! Combo{' '}
              <span className="font-bold text-amber-300">Right → Left → Clap Both Hands</span> to
              lock onto every bug for multi-clap barrages and unleash colossal Stand Hands slamming
              the floor!
            </p>

            {/* Battle Background / Location Selector */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider">
                <span className="inline-flex items-center gap-1.5 text-emerald-300">
                  <MapPin className="h-3.5 w-3.5" />
                  Select Battle Background
                </span>
                <span className="text-[11px] font-semibold text-fuchsia-200">
                  Room · Midnight Balcony · Toilet Break
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {BACKGROUND_LOCATIONS.map((loc) => {
                  const active = hud.location === loc.id;
                  const Icon = loc.id === 'room' ? Home : loc.id === 'balcony' ? Moon : Bath;
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => handleSelectLocation(loc.id)}
                      className={`manga-panel rounded-xl border-2 border-slate-950 px-2.5 py-2 text-left transition-transform active:scale-95 ${
                        active
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-[#2a1945] text-white hover:bg-[#38215c]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs font-black uppercase leading-tight whitespace-nowrap">
                          {loc.label}
                        </span>
                      </div>
                      <div
                        className={`mt-0.5 text-[10px] font-bold ${
                          active ? 'text-slate-900' : 'text-fuchsia-200'
                        }`}
                      >
                        {loc.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 15s / 30s / 60s Panic Attack Selector */}
            <div className="mt-4">
              <div className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                Select Panic Attack Timer
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2.5">
                {PANIC_OPTIONS.map((opt) => {
                  const active = selectedDuration === opt.duration;
                  return (
                    <button
                      key={opt.duration}
                      type="button"
                      onClick={() => handleSelectDuration(opt.duration)}
                      className={`manga-panel rounded-xl border-2 border-slate-950 px-3 py-2 text-left transition-transform active:scale-95 ${
                        active
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-[#2a1945] text-white hover:bg-[#38215c]'
                      }`}
                    >
                      <div className="font-anime text-2xl font-black leading-none">{opt.label}</div>
                      <div
                        className={`mt-1 text-xs font-bold ${
                          active ? 'text-slate-900' : 'text-fuchsia-200'
                        }`}
                      >
                        {opt.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Weather Progression / Override Selector */}
            <div className="mt-3.5">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider">
                <span className="inline-flex items-center gap-1.5 text-sky-300">
                  <CloudRain className="h-3.5 w-3.5" />
                  Weather Intensity
                </span>
                <span className="text-[11px] font-semibold text-fuchsia-200">
                  Windy &amp; Stormy trigger mosquito gust dashes
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                {WEATHER_OPTIONS.map((opt) => {
                  const active = hud.weatherMode === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      onClick={() => handleSelectWeatherMode(opt.mode)}
                      className={`rounded-lg border-2 border-slate-950 px-2 py-1.5 text-xs font-black uppercase transition-transform active:scale-95 ${
                        active
                          ? opt.mode === 'stormy'
                            ? 'bg-rose-500 text-white'
                            : opt.mode === 'windy'
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-sky-400 text-slate-950'
                          : 'bg-[#2a1945] text-slate-200 hover:bg-[#38215c]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Special Equipment Loadout */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider">
                <span className="text-amber-300">Special Equipment Arsenal</span>
                <span className="text-slate-300">
                  Dengue Risk ·{' '}
                  <span className={hud.dengueLosses >= 2 ? 'text-rose-400' : 'text-amber-300'}>
                    {hud.dengueLosses}/{hud.dengueMaxLosses}
                  </span>
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2.5">
                {SPECIAL_EQUIPMENT_LIST.map((eq) => {
                  const unlocked = hud.unlockedEquipment.includes(eq.id);
                  const equipped = hud.equippedId === eq.id;
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => handleEquip(eq.id)}
                      className={`rounded-xl border-2 border-slate-950 p-2.5 text-left transition-all ${
                        equipped
                          ? 'bg-fuchsia-600 text-white shadow-[3px_3px_0_#facc15]'
                          : unlocked
                            ? 'bg-[#2a1945] text-white hover:bg-[#38215c]'
                            : 'cursor-not-allowed bg-slate-900/90 text-slate-400 opacity-80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <Zap
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: unlocked ? eq.accentColor : '#64748b' }}
                        />
                        <span className="text-[10px] font-extrabold uppercase">
                          {equipped ? 'Equipped' : unlocked ? 'Ready' : 'Locked'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-extrabold leading-tight">{eq.name}</div>
                      <div className="mt-1 text-[10px] leading-snug opacity-85">
                        {unlocked ? eq.effectSummary : eq.unlockHint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* JoJo Stand Battle Cry Library */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider">
                <span className="inline-flex items-center gap-1.5 text-amber-300">
                  <Megaphone className="h-3.5 w-3.5" />
                  Super Smash Vocal Cry Library
                </span>
                <span className="text-[11px] font-semibold text-fuchsia-200">
                  Click to audition &amp; set
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleSelectCry('random')}
                  className={`rounded-lg border-2 border-slate-950 px-2.5 py-1 text-[11px] font-black uppercase transition-transform active:scale-95 ${
                    hud.cryPreference === 'random'
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-[#2a1945] text-white hover:bg-[#38215c]'
                  }`}
                >
                  Random Mix
                </button>
                {STAND_CRY_LIBRARY.map((clip) => {
                  const selected = hud.cryPreference === clip.id;
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      onClick={() => void handleSelectCry(clip.id)}
                      className={`rounded-lg border-2 border-slate-950 px-2.5 py-1 text-[11px] font-black uppercase transition-transform active:scale-95 ${
                        selected
                          ? 'bg-fuchsia-500 text-white shadow-[2px_2px_0_#facc15]'
                          : 'bg-[#2a1945] text-fuchsia-100 hover:bg-[#38215c]'
                      }`}
                    >
                      {clip.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-300">
                Best ·{' '}
                <span className="font-mono-tabular text-amber-300">
                  {hud.highScore.toLocaleString()}
                </span>{' '}
                · Wins <span className="font-mono-tabular text-emerald-300">{hud.totalWins}</span>
              </div>
              <button
                type="button"
                onClick={handleStartGame}
                className="manga-panel min-h-[46px] rounded-xl border-2 border-slate-950 bg-amber-400 px-7 py-2 font-anime text-2xl font-black italic uppercase tracking-wide text-slate-950 transition-transform hover:bg-amber-300 active:scale-95"
              >
                Defend {selectedDuration}s!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Victory Modal */}
      {hud.phase === 'victory' && !showIntelModal && !showRunsModal && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#130b20]/85 p-5">
          <div className="manga-panel-gold halftone-bg w-full max-w-md rounded-2xl border-2 border-slate-950 bg-[#1e1233] p-7">
            <div className="flex items-center gap-2 text-amber-300">
              <Trophy className="h-6 w-6" />
              <span className="font-anime text-sm font-black uppercase tracking-widest">
                {hud.panicDuration}s Storm Survived!
              </span>
            </div>
            <h2 className="font-anime mt-1 text-4xl font-black italic uppercase text-white drop-shadow-[3px_3px_0_#090612]">
              BODY DEFENDED!!
            </h2>
            <p className="mt-1 text-sm text-fuchsia-200">
              Survived {hud.weatherLabel} with {hud.health}/{hud.maxHealth} hearts intact and{' '}
              {hud.superSmashes} Super Floor Slams!
            </p>

            {hud.newlyAwardedEquipment ? (
              <div className="manga-panel mt-4 rounded-xl border-2 border-slate-950 bg-fuchsia-950 p-4">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  <Sparkles className="h-4 w-4" />
                  Special Equipment Awarded &amp; Equipped!
                </div>
                <div className="font-anime mt-1 text-2xl font-black uppercase text-white">
                  {hud.newlyAwardedEquipment.name}
                </div>
                <div className="mt-1 text-xs font-semibold text-fuchsia-200">
                  {hud.newlyAwardedEquipment.effectSummary}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border-2 border-slate-950 bg-[#2a1945] p-3 text-xs font-bold text-emerald-300">
                All Stand Equipment Unlocked! Dengue risk reduced to {hud.dengueLosses}/
                {hud.dengueMaxLosses}.
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-white/10 bg-slate-950 p-2">
                <div className="text-slate-400">Score</div>
                <div className="font-mono-tabular text-base font-bold text-amber-300">
                  {hud.score.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950 p-2">
                <div className="text-slate-400">Super Slams</div>
                <div className="font-mono-tabular text-base font-bold text-fuchsia-300">
                  {hud.superSmashes}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950 p-2">
                <div className="text-slate-400">Kills</div>
                <div className="font-mono-tabular text-base font-bold text-sky-300">
                  {hud.kills}
                </div>
              </div>
            </div>

            <KillBreakdownPanel hud={hud} />

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleDischarge}
                className="min-h-[42px] rounded-xl border-2 border-slate-950 bg-[#2a1945] px-4 py-2 text-sm font-bold text-white hover:bg-[#38215c]"
              >
                Loadout
              </button>
              <button
                type="button"
                onClick={handleStartGame}
                className="manga-panel min-h-[42px] rounded-xl border-2 border-slate-950 bg-amber-400 px-6 py-2 font-anime text-xl font-black italic uppercase text-slate-950 hover:bg-amber-300"
              >
                Fight Again!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Defeat Modal */}
      {hud.phase === 'gameover' && !showIntelModal && !showRunsModal && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#130b20]/85 p-5">
          <div className="manga-panel halftone-bg w-full max-w-md rounded-2xl border-2 border-slate-950 bg-[#231029] p-7">
            <div className="flex items-center gap-2 text-rose-400">
              <HeartCrack className="h-6 w-6" />
              <span className="font-anime text-sm font-black uppercase tracking-widest">
                3 Hearts Shattered · Bugs Win!
              </span>
            </div>
            <h2 className="font-anime mt-1 text-4xl font-black italic uppercase text-rose-400 drop-shadow-[3px_3px_0_#090612]">
              BLOOD SUCKED!!
            </h2>
            <p className="mt-2 text-sm text-slate-200">
              The mosquitoes and flies broke through your defense with{' '}
              {hud.timeRemaining.toFixed(1)}s remaining!
            </p>

            <div className="mt-4 rounded-xl border-2 border-slate-950 bg-rose-950 p-3.5">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase">
                <span className="text-rose-200">Dengue (Denggi) Infection Risk</span>
                <span className="font-mono-tabular text-amber-300">
                  {hud.dengueLosses} / {hud.dengueMaxLosses} Losses
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-sm border border-slate-950 bg-slate-900">
                <div
                  className="h-full bg-rose-500 transition-all"
                  style={{ width: `${(hud.dengueLosses / hud.dengueMaxLosses) * 100}%` }}
                />
              </div>
              <div className="mt-1.5 text-xs text-rose-200">
                {hud.dengueMaxLosses - hud.dengueLosses === 1
                  ? 'Warning: 1 more defeat will send you to the hospital with Dengue!'
                  : 'Protect your body or repeated bites will cause Dengue fever.'}
              </div>
            </div>

            <KillBreakdownPanel hud={hud} />

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleDischarge}
                className="min-h-[42px] rounded-xl border-2 border-slate-950 bg-[#2a1945] px-4 py-2 text-sm font-bold text-white hover:bg-[#38215c]"
              >
                Loadout
              </button>
              <button
                type="button"
                onClick={handleStartGame}
                className="manga-panel min-h-[42px] rounded-xl border-2 border-slate-950 bg-amber-400 px-6 py-2 font-anime text-xl font-black italic uppercase text-slate-950 hover:bg-amber-300"
              >
                Rematch!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hospitalized / Dengue Lose Screen */}
      {hud.phase === 'hospitalized' && !showIntelModal && !showRunsModal && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-rose-950/92 p-5">
          <div className="manga-panel halftone-bg w-full max-w-lg rounded-2xl border-2 border-slate-950 bg-slate-950 p-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-400">
                <ShieldAlert className="h-6 w-6" />
                <span className="font-anime text-sm font-black uppercase tracking-widest">
                  RETIRED // ADMITTED TO HOSPITAL
                </span>
              </div>
              <span className="font-anime text-xl font-black text-rose-500">ドドドド</span>
            </div>

            <h2 className="font-anime mt-2 text-5xl font-black italic uppercase text-rose-500 drop-shadow-[3px_3px_0_#fff]">
              KENA DENGGI!!
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              After losing {hud.dengueMaxLosses} times to blood-sucking mosquitoes and flies, you
              caught severe Dengue fever and were rushed to the hospital ward!
            </p>

            <div className="mt-4 rounded-xl border-2 border-rose-500/40 bg-slate-900 p-4">
              <div className="flex items-center justify-between text-xs font-bold uppercase text-emerald-400">
                <span>Ward Monitor · IV Drip Connected</span>
                <span className="font-mono-tabular text-rose-400">Platelets Low</span>
              </div>
              <svg viewBox="0 0 360 64" className="mt-2 h-14 w-full" aria-hidden="true">
                <polyline
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="3"
                  points="0,40 45,40 58,20 70,54 82,12 94,44 108,40 165,40 178,24 190,50 202,16 214,42 228,40 360,40"
                />
              </svg>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-300">
                <span>Diagnosis: Dengue Fever</span>
                <span>Status: Bed Rest Required</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
              <div className="text-xs text-slate-400">
                Discharge resets Dengue risk and returns you to defense.
              </div>
              <button
                type="button"
                onClick={handleDischarge}
                className="manga-panel min-h-[46px] rounded-xl border-2 border-slate-950 bg-emerald-400 px-6 py-2.5 font-anime text-2xl font-black italic uppercase text-slate-950 hover:bg-emerald-300"
              >
                Discharge &amp; Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dengue & Mosquito Intelligence Modal (Gemini Search Grounding) */}
      {showIntelModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#130b20]/90 p-4">
          <div className="manga-panel-gold w-full max-w-lg rounded-2xl border-2 border-slate-950 bg-[#1a102b] p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-anime text-3xl font-black italic uppercase text-amber-300">
                Dengue &amp; Bug Intel
              </h2>
              <button
                type="button"
                onClick={() => setShowIntelModal(false)}
                className="rounded-lg border border-white/20 px-3 py-1 text-xs font-bold text-slate-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-xs text-fuchsia-200">
              Live Aedes mosquito &amp; Dengue defense facts powered by Google Search Grounding.
            </p>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={intelQuery}
                onChange={(e) => setIntelQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void fetchDengueIntel(intelQuery);
                }}
                placeholder="Ask about Dengue symptoms or mosquito defense..."
                className="flex-1 rounded-xl border-2 border-slate-950 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                disabled={intelLoading}
                onClick={() => void fetchDengueIntel(intelQuery)}
                className="manga-panel flex items-center gap-1.5 rounded-xl border-2 border-slate-950 bg-amber-400 px-4 py-2 text-xs font-black uppercase text-slate-950 hover:bg-amber-300 disabled:opacity-60"
              >
                <Search className="h-3.5 w-3.5" />
                <span>{intelLoading ? '...' : 'Search'}</span>
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {INTEL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setIntelQuery(preset);
                    void fetchDengueIntel(preset);
                  }}
                  className="rounded-lg border border-white/15 bg-[#2a1945] px-2.5 py-1 text-[11px] font-semibold text-fuchsia-200 hover:bg-[#38215c]"
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-white/15 bg-slate-950 p-4 text-xs leading-relaxed text-slate-200">
              {intelLoading ? (
                <div className="font-bold text-amber-300">Searching live sources...</div>
              ) : intelError ? (
                <div className="font-bold text-rose-400">{intelError}</div>
              ) : (
                <>
                  <div className="whitespace-pre-wrap">{intelAnswer}</div>
                  {intelSources.length > 0 && (
                    <div className="mt-3 border-t border-white/10 pt-2.5">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                        Grounded Sources
                      </div>
                      <ul className="mt-1 space-y-1">
                        {intelSources.map((src) => (
                          <li key={src.uri}>
                            <a
                              href={src.uri}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-sky-300 underline hover:text-sky-200"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[380px]">{src.title}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Firebase Cloud Match History Modal */}
      {showRunsModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#130b20]/90 p-4">
          <div className="manga-panel-gold w-full max-w-md rounded-2xl border-2 border-slate-950 bg-[#1a102b] p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-anime text-3xl font-black italic uppercase text-amber-300">
                Cloud Match Log
              </h2>
              <button
                type="button"
                onClick={() => setShowRunsModal(false)}
                className="rounded-lg border border-white/20 px-3 py-1 text-xs font-bold text-slate-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <div className="mt-1 text-xs text-slate-300">
              Synced to Firestore for{' '}
              <span className="font-bold text-emerald-300">{user?.displayName || 'Player'}</span>
            </div>

            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {runsLoading ? (
                <div className="py-6 text-center text-xs font-bold text-amber-300">
                  Loading cloud runs...
                </div>
              ) : recentRuns.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-slate-950 p-4 text-center text-xs text-slate-400">
                  Complete a Panic Attack round while signed in to record runs!
                </div>
              ) : (
                recentRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-extrabold uppercase">
                        <span
                          className={
                            run.outcome === 'victory'
                              ? 'text-emerald-400'
                              : run.outcome === 'hospitalized'
                                ? 'text-rose-500'
                                : 'text-amber-300'
                          }
                        >
                          {run.outcome}
                        </span>{' '}
                        · {run.panicDuration}s
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {run.kills} kills · {run.superSmashes} Super Slams · {run.weatherPeak}
                      </div>
                    </div>
                    <div className="font-mono-tabular text-sm font-bold text-amber-300">
                      {run.score.toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
