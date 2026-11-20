import * as THREE from 'three';
import type { BackgroundLocation } from './SceneEnvironments';

export type WeatherMode = 'auto' | 'calm' | 'windy' | 'stormy';
export type WeatherTier = 'calm' | 'windy' | 'stormy';

export interface WeatherState {
  label: string;
  rainIntensity: number; // 0..1
  windStrength: number; // 0..1
  windVec: THREE.Vector3;
  turbulence: number; // erratic multiplier for bug paths
}

export function classifyWeatherLabel(weatherLabel: string): WeatherTier {
  const lower = weatherLabel.toLowerCase();
  if (/storm|squall|monsoon|thunder|gale|overdrive|ruptured/.test(lower)) {
    return 'stormy';
  }
  if (/wind|crosswind|gust|turbo|burst/.test(lower)) {
    return 'windy';
  }
  return 'calm';
}

const RAIN_COUNT = 220;
const SPLASH_COUNT = 64;
const WIND_MOTE_COUNT = 115;
const SMOKE_COUNT = 44;
const PIPE_WATER_COUNT = 140;

const _dummy = new THREE.Object3D();
const _windDir = new THREE.Vector3();
const _velVec = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

interface RainDropState {
  x: number;
  y: number;
  z: number;
  speed: number;
  len: number;
}

interface SplashDropState {
  x: number;
  z: number;
  age: number;
  maxAge: number;
  active: boolean;
}

interface WindMoteState {
  x: number;
  y: number;
  z: number;
  speedMul: number;
  phase: number;
  scale: number;
}

interface SmokePuffState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  source: 0 | 1;
  rot: number;
}

interface PipeDropState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  bounced: boolean;
  scale: number;
}

function createSoftSmokeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(226, 232, 240, 0.72)');
  grad.addColorStop(0.5, 'rgba(203, 213, 225, 0.32)');
  grad.addColorStop(1, 'rgba(203, 213, 225, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class WeatherSystem {
  public readonly root = new THREE.Group();
  private rainMesh: THREE.InstancedMesh;
  private splashMesh: THREE.InstancedMesh;
  private moteMesh: THREE.InstancedMesh;
  private smokeMesh: THREE.InstancedMesh;
  private pipeWaterMesh: THREE.InstancedMesh;

  private rainDrops: RainDropState[] = [];
  private splashes: SplashDropState[] = [];
  private motes: WindMoteState[] = [];
  private smokePuffs: SmokePuffState[] = [];
  private pipeDrops: PipeDropState[] = [];

  private rainMat: THREE.MeshBasicMaterial;
  private splashMat: THREE.MeshBasicMaterial;
  private moteMat: THREE.MeshBasicMaterial;
  private smokeMat: THREE.MeshBasicMaterial;
  private smokeTex: THREE.CanvasTexture;
  private pipeWaterMat: THREE.MeshBasicMaterial;

  private state: WeatherState = {
    label: 'Fan Breeze, Smoke & Dust',
    rainIntensity: 0.25,
    windStrength: 0.22,
    windVec: new THREE.Vector3(-0.4, 0.04, 0.1),
    turbulence: 0.25,
  };

  private mode: WeatherMode = 'auto';
  private location: BackgroundLocation = 'room';
  private windAngle = 0.2;
  private gustTimer = 0;
  private gustPulse = 0;

  constructor() {
    // 1. Rain Streaks (Balcony) / Fan Wind Streaks (Study Room)
    const rainGeo = new THREE.CylinderGeometry(0.0022, 0.0014, 0.26, 4);
    this.rainMat = new THREE.MeshBasicMaterial({
      color: 0xa5f3fc,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    this.rainMesh = new THREE.InstancedMesh(rainGeo, this.rainMat, RAIN_COUNT);
    this.rainMesh.frustumCulled = false;

    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainDrops.push({
        x: (Math.random() - 0.5) * 5.8,
        y: -1.4 + Math.random() * 4.2,
        z: -2.9 + Math.random() * 4.2,
        speed: 4.8 + Math.random() * 2.4,
        len: 0.65 + Math.random() * 0.7,
      });
    }
    this.root.add(this.rainMesh);

    // 2. Floor Splash Ripples (Balcony Rain & Toilet Broken Pipe Splash)
    const splashGeo = new THREE.RingGeometry(0.012, 0.032, 12);
    splashGeo.rotateX(-Math.PI / 2);
    this.splashMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.splashMesh = new THREE.InstancedMesh(splashGeo, this.splashMat, SPLASH_COUNT);
    this.splashMesh.frustumCulled = false;

    for (let i = 0; i < SPLASH_COUNT; i++) {
      this.splashes.push({
        x: (Math.random() - 0.5) * 4.6,
        z: -2.6 + Math.random() * 2.3,
        age: Math.random() * 0.4,
        maxAge: 0.28 + Math.random() * 0.18,
        active: true,
      });
    }
    this.root.add(this.splashMesh);

    // 3. Airborne Particles & Dust Motes (All 3 locations, tinted per location)
    const moteGeo = new THREE.OctahedronGeometry(0.011, 0);
    this.moteMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.moteMesh = new THREE.InstancedMesh(moteGeo, this.moteMat, WIND_MOTE_COUNT);
    this.moteMesh.frustumCulled = false;

    for (let i = 0; i < WIND_MOTE_COUNT; i++) {
      this.motes.push({
        x: (Math.random() - 0.5) * 5.2,
        y: -0.65 + Math.random() * 2.4,
        z: -2.7 + Math.random() * 3.8,
        speedMul: 0.7 + Math.random() * 0.85,
        phase: Math.random() * Math.PI * 2,
        scale: 0.55 + Math.random() * 0.8,
      });
    }
    this.root.add(this.moteMesh);

    // 4. Study Room Drifting Smoke Puffs (from Mosquito Coil & Coffee Mug)
    this.smokeTex = createSoftSmokeTexture();
    const smokeGeo = new THREE.PlaneGeometry(0.24, 0.24);
    this.smokeMat = new THREE.MeshBasicMaterial({
      map: this.smokeTex,
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.smokeMesh = new THREE.InstancedMesh(smokeGeo, this.smokeMat, SMOKE_COUNT);
    this.smokeMesh.frustumCulled = false;

    for (let i = 0; i < SMOKE_COUNT; i++) {
      const source: 0 | 1 = i % 3 === 0 ? 1 : 0;
      const puff: SmokePuffState = {
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: Math.random() * 2.4,
        maxAge: 2.1 + Math.random() * 1.1,
        source,
        rot: Math.random() * Math.PI * 2,
      };
      this.resetSmokePuff(puff);
      puff.x -= Math.random() * 0.6;
      puff.y += Math.random() * 0.45;
      this.smokePuffs.push(puff);
    }
    this.root.add(this.smokeMesh);

    // 5. Toilet Break Broken Pipe Water Spray & Splash Droplets
    const pipeDropGeo = new THREE.CylinderGeometry(0.004, 0.0025, 0.085, 5);
    this.pipeWaterMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.pipeWaterMesh = new THREE.InstancedMesh(pipeDropGeo, this.pipeWaterMat, PIPE_WATER_COUNT);
    this.pipeWaterMesh.frustumCulled = false;
    for (let i = 0; i < PIPE_WATER_COUNT; i++) {
      const drop: PipeDropState = {
        x: -1.58,
        y: 0.36,
        z: -1.82,
        vx: 1.5,
        vy: 0.6,
        vz: 0.4,
        bounced: false,
        scale: 0.8,
      };
      this.resetPipeDrop(drop, 0.4);
      // Pre-advance slightly so spray is immediately visible
      const preT = Math.random() * 0.55;
      drop.x += drop.vx * preT;
      drop.y += drop.vy * preT - 4.4 * preT * preT;
      drop.z += drop.vz * preT;
      drop.vy -= 8.8 * preT;
      this.pipeDrops.push(drop);
    }
    this.root.add(this.pipeWaterMesh);

    this.setLocation('room');
  }

  private resetSmokePuff(p: SmokePuffState): void {
    if (p.source === 0) {
      // Mosquito coil tray at (0.28, -0.66, -1.06)
      p.x = 0.33 + (Math.random() - 0.5) * 0.05;
      p.y = -0.65;
      p.z = -1.05 + (Math.random() - 0.5) * 0.05;
    } else {
      // Coffee mug at (0.68, -0.49, -1.18)
      p.x = 0.68 + (Math.random() - 0.5) * 0.06;
      p.y = -0.48;
      p.z = -1.18 + (Math.random() - 0.5) * 0.06;
    }
    p.vx = -0.15 - Math.random() * 0.12;
    p.vy = 0.24 + Math.random() * 0.16;
    p.vz = (Math.random() - 0.5) * 0.08;
    p.age = 0;
    p.maxAge = 2.0 + Math.random() * 1.1;
    p.rot = Math.random() * Math.PI * 2;
  }

  private resetPipeDrop(d: PipeDropState, pressure: number): void {
    // Burst point at (-1.59, 0.36, -1.81)
    d.x = -1.59 + (Math.random() - 0.5) * 0.04;
    d.y = 0.36 + (Math.random() - 0.5) * 0.04;
    d.z = -1.81 + (Math.random() - 0.5) * 0.04;
    const speedBoost = 0.85 + pressure * 1.15;
    d.vx = (1.1 + Math.random() * 1.1) * speedBoost;
    d.vy = (0.35 + Math.random() * 0.85) * speedBoost;
    d.vz = (0.35 + Math.random() * 0.75) * speedBoost;
    d.bounced = false;
    d.scale = 0.7 + Math.random() * 0.75;
  }

  public getWeatherState(): WeatherState {
    return this.state;
  }

  public getWeatherTier(): WeatherTier {
    if (this.mode === 'stormy') return 'stormy';
    if (this.mode === 'windy') return 'windy';
    if (this.mode === 'calm') return 'calm';
    if (this.state.windStrength > 0.78 || this.state.rainIntensity > 0.76) return 'stormy';
    if (this.state.windStrength > 0.48 || this.state.rainIntensity > 0.48) return 'windy';
    return 'calm';
  }

  public setLocation(loc: BackgroundLocation): void {
    this.location = loc;
    this.smokeMesh.visible = loc === 'room';
    this.pipeWaterMesh.visible = loc === 'toilet';
    this.splashMesh.visible = loc === 'balcony' || loc === 'toilet';
    this.rainMesh.visible = loc === 'balcony' || loc === 'room';

    if (loc === 'room') {
      this.rainMat.color.setHex(0xe0f2fe);
      this.moteMat.color.setHex(0xfde68a); // Warm desk lamp dust motes
    } else if (loc === 'balcony') {
      this.rainMat.color.setHex(0xa5f3fc);
      this.splashMat.color.setHex(0xbae6fd);
      this.moteMat.color.setHex(0xe9d5ff);
    } else {
      this.splashMat.color.setHex(0x7dd3fc);
      this.moteMat.color.setHex(0xdbeafe); // Cool fluorescent bathroom dust particles
    }

    this.refreshLabel();
  }

  public getLocation(): BackgroundLocation {
    return this.location;
  }

  public setMode(mode: WeatherMode): void {
    this.mode = mode;
    if (mode === 'stormy') {
      this.gustPulse = 0.85;
    } else if (mode === 'windy') {
      this.gustPulse = 0.55;
    } else if (mode === 'calm') {
      this.gustPulse = 0;
    }
    this.refreshLabel();
  }

  public getMode(): WeatherMode {
    return this.mode;
  }

  private refreshLabel(): void {
    const tier = this.getWeatherTier();
    if (this.location === 'room') {
      if (tier === 'stormy') {
        this.state.label = 'Overdrive Fan Gale, Smoke & Dust';
      } else if (tier === 'windy') {
        this.state.label = 'Turbo Fan Wind, Smoke & Dust';
      } else {
        this.state.label = 'Fan Breeze, Smoke & Dust';
      }
      return;
    }

    if (this.location === 'toilet') {
      if (tier === 'stormy') {
        this.state.label = 'Ruptured Pipe Flood & Dust';
      } else if (tier === 'windy') {
        this.state.label = 'Pipe Burst Spray & Dust';
      } else {
        this.state.label = 'Broken Pipe Splash & Dust';
      }
      return;
    }

    // Balcony maintains classic outdoor rain/storm weather labels
    if (this.mode === 'stormy') {
      this.state.label = 'Stormy Squall';
    } else if (this.mode === 'windy') {
      this.state.label = 'Windy Crosswind';
    } else if (this.mode === 'calm') {
      this.state.label = 'Breeze & Drizzle';
    } else if (tier === 'stormy') {
      this.state.label = 'Monsoon Squall';
    } else if (tier === 'windy') {
      this.state.label = 'Crosswind Rain';
    } else {
      this.state.label = 'Breeze & Drizzle';
    }
  }

  public update(dt: number, elapsed: number, matchProgress: number, isPlaying: boolean): void {
    const progress = isPlaying ? THREE.MathUtils.clamp(matchProgress, 0, 1) : 0.22;

    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      const freqBoost = this.mode === 'stormy' ? 0.85 : this.mode === 'windy' ? 0.5 : progress * 0.9;
      this.gustTimer = Math.max(0.65, 2.0 - freqBoost) + Math.random() * 1.1;
      this.gustPulse =
        this.mode === 'calm' ? 0.12 : 0.55 + Math.random() * (this.mode === 'stormy' ? 0.8 : 0.65);
      this.windAngle += (Math.random() - 0.5) * (1.2 + (this.mode === 'stormy' ? 1.8 : progress * 1.5));
    }
    this.gustPulse = THREE.MathUtils.damp(this.gustPulse, 0, 1.8, dt);

    let targetRain: number;
    let targetWind: number;
    let targetTurbulence: number;

    if (this.mode === 'calm') {
      targetRain = 0.2;
      targetWind = 0.2;
      targetTurbulence = 0.2;
    } else if (this.mode === 'windy') {
      targetRain = 0.55;
      targetWind = 0.64 + this.gustPulse * 0.2;
      targetTurbulence = 0.95 + this.gustPulse * 0.35;
    } else if (this.mode === 'stormy') {
      targetRain = 0.95;
      targetWind = 0.9 + this.gustPulse * 0.24;
      targetTurbulence = 1.45 + this.gustPulse * 0.4;
    } else {
      targetRain = isPlaying ? 0.25 + progress * 0.75 : 0.25;
      targetWind = isPlaying ? 0.24 + progress * 0.62 + this.gustPulse * 0.32 : 0.24;
      targetTurbulence = THREE.MathUtils.clamp(
        0.22 + progress * 0.85 + this.gustPulse * 0.45,
        0.15,
        1.6,
      );
    }

    this.state.rainIntensity = THREE.MathUtils.damp(this.state.rainIntensity, targetRain, 2.6, dt);
    this.state.windStrength = THREE.MathUtils.damp(this.state.windStrength, targetWind, 3.2, dt);
    this.state.turbulence = THREE.MathUtils.clamp(targetTurbulence, 0.15, 1.85);

    if (this.location === 'room') {
      // Fan oscillation sweep blowing leftward across the study room from right desk corner
      const fanSweep = -0.58 + Math.sin(elapsed * 0.95) * 0.34;
      const windSpeed = 0.9 + this.state.windStrength * 3.1;
      this.state.windVec.set(
        -Math.cos(fanSweep * 0.5) * windSpeed,
        Math.sin(elapsed * 2.1) * 0.22,
        Math.sin(fanSweep) * windSpeed * 0.5,
      );
    } else {
      const sweep = this.windAngle + Math.sin(elapsed * 0.9) * 0.45;
      const windSpeed = 0.8 + this.state.windStrength * 3.4;
      this.state.windVec.set(
        Math.cos(sweep) * windSpeed,
        Math.sin(elapsed * 2.3) * (0.25 + this.state.windStrength * 0.65) - 0.08,
        Math.sin(sweep) * windSpeed * 0.65,
      );
    }

    this.refreshLabel();

    if (this.location === 'balcony') {
      this.updateBalconyRainAndSplashes(dt);
    } else if (this.location === 'room') {
      this.updateStudyFanWindAndSmoke(dt, elapsed);
    } else {
      this.updateToiletBrokenPipeSplash(dt);
    }

    this.updateAirParticlesAndDust(dt, elapsed);
  }

  private updateBalconyRainAndSplashes(dt: number): void {
    const activeRainCount = Math.floor(RAIN_COUNT * (0.32 + this.state.rainIntensity * 0.68));
    this.rainMat.opacity = 0.18 + this.state.rainIntensity * 0.34;
    const tiltZ = -this.state.windVec.x * 0.11;
    const tiltX = this.state.windVec.z * 0.08;

    for (let i = 0; i < RAIN_COUNT; i++) {
      const drop = this.rainDrops[i];
      if (i >= activeRainCount) {
        _dummy.position.set(0, -99, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.rainMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      const fallSpeed = drop.speed * (0.85 + this.state.rainIntensity * 0.65);
      drop.y -= fallSpeed * dt;
      drop.x += this.state.windVec.x * 0.85 * dt;
      drop.z += this.state.windVec.z * 0.85 * dt;

      if (drop.y < -1.55) {
        drop.y = 2.4 + Math.random() * 0.6;
        drop.x = (Math.random() - 0.5) * 5.8 - this.state.windVec.x * 0.3;
        drop.z = -2.9 + Math.random() * 4.2;
      }
      if (drop.x > 3.1) drop.x -= 6.2;
      else if (drop.x < -3.1) drop.x += 6.2;
      if (drop.z > 1.4) drop.z -= 4.3;
      else if (drop.z < -2.9) drop.z += 4.3;

      _dummy.position.set(drop.x, drop.y, drop.z);
      _dummy.rotation.set(tiltX, 0, tiltZ);
      _dummy.scale.set(1, drop.len * (0.75 + this.state.rainIntensity * 0.55), 1);
      _dummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;

    const activeSplashes = Math.floor(SPLASH_COUNT * (0.25 + this.state.rainIntensity * 0.75));
    this.splashMat.opacity = 0.22 + this.state.rainIntensity * 0.38;
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const s = this.splashes[i];
      if (i >= activeSplashes) {
        _dummy.position.set(0, -99, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.splashMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      s.age += dt;
      if (s.age >= s.maxAge) {
        s.age = 0;
        s.maxAge = 0.22 + Math.random() * 0.2;
        s.x = (Math.random() - 0.5) * 4.6;
        s.z = -2.6 + Math.random() * 2.3;
      }
      const p = s.age / s.maxAge;
      const scale = (0.35 + p * 1.4) * (1 - p * 0.35);
      _dummy.position.set(s.x, -0.695, s.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(scale, 1, scale);
      _dummy.updateMatrix();
      this.splashMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.splashMesh.instanceMatrix.needsUpdate = true;
  }

  private updateStudyFanWindAndSmoke(dt: number, elapsed: number): void {
    // 1. Fan wind current streaks blowing from desk fan across the room
    const activeWindStreaks = Math.floor(RAIN_COUNT * (0.28 + this.state.windStrength * 0.65));
    this.rainMat.opacity = 0.12 + this.state.windStrength * 0.22;
    const streamDirX = this.state.windVec.x;
    const streamDirZ = this.state.windVec.z;

    for (let i = 0; i < RAIN_COUNT; i++) {
      const drop = this.rainDrops[i];
      if (i >= activeWindStreaks) {
        _dummy.position.set(0, -99, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.rainMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      const speed = (1.6 + this.state.windStrength * 2.8) * (0.65 + (i % 5) * 0.14);
      drop.x += streamDirX * speed * 0.48 * dt;
      drop.z += streamDirZ * speed * 0.45 * dt;
      drop.y += Math.sin(elapsed * 3.8 + i) * 0.24 * dt;

      if (drop.x < -2.4 || drop.x > 2.4 || drop.y < -0.65 || drop.y > 1.6) {
        // Respawn near fan cone or drifting across study desk
        drop.x = 1.15 + Math.random() * 0.45;
        drop.y = -0.5 + Math.random() * 1.45;
        drop.z = -1.65 + Math.random() * 1.5;
      }

      _velVec.set(streamDirX, Math.sin(elapsed * 3.8 + i) * 0.2, streamDirZ).normalize();
      _quat.setFromUnitVectors(_upAxis, _velVec);

      _dummy.position.set(drop.x, drop.y, drop.z);
      _dummy.quaternion.copy(_quat);
      _dummy.scale.set(0.75, drop.len * (0.9 + this.state.windStrength * 1.25), 0.75);
      _dummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;

    // 2. Drifting Smoke Wisps from Mosquito Coil & Coffee Mug pushed by fan breeze
    this.smokeMat.opacity = 0.28 + this.state.windStrength * 0.22;
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const p = this.smokePuffs[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.resetSmokePuff(p);
      }
      const t = p.age / p.maxAge;
      const fanPush = 0.28 + this.state.windStrength * 0.75;
      p.x += (p.vx + this.state.windVec.x * fanPush * 0.35 + Math.sin(elapsed * 2.4 + i) * 0.14) * dt;
      p.y += (p.vy + Math.cos(elapsed * 1.9 + i) * 0.06) * dt;
      p.z += (p.vz + this.state.windVec.z * fanPush * 0.28) * dt;

      const puffScale = (0.35 + t * 1.95) * (1 - Math.pow(t, 3) * 0.6);
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(0, 0, p.rot + elapsed * 0.6);
      _dummy.scale.setScalar(Math.max(0.01, puffScale));
      _dummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
  }

  private updateToiletBrokenPipeSplash(dt: number): void {
    const pressure = Math.max(this.state.rainIntensity, this.state.windStrength);
    const activeDrops = Math.floor(PIPE_WATER_COUNT * (0.42 + pressure * 0.58));
    this.pipeWaterMat.opacity = 0.52 + pressure * 0.36;

    for (let i = 0; i < PIPE_WATER_COUNT; i++) {
      const d = this.pipeDrops[i];
      if (i >= activeDrops) {
        _dummy.position.set(0, -99, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.pipeWaterMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      d.vy -= 8.4 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;

      if (d.y <= -0.7) {
        if (!d.bounced) {
          d.bounced = true;
          d.y = -0.695;
          d.vy = 0.85 + Math.random() * (0.95 + pressure * 0.8);
          d.vx = d.vx * 0.45 + (Math.random() - 0.5) * 1.1;
          d.vz = d.vz * 0.45 + (Math.random() - 0.5) * 1.1;
        } else {
          this.resetPipeDrop(d, pressure);
        }
      } else if (d.x > 1.85 || d.z > 0.6) {
        this.resetPipeDrop(d, pressure);
      }

      _velVec.set(d.vx, d.vy, d.vz);
      if (_velVec.lengthSq() > 0.001) {
        _velVec.normalize();
        _quat.setFromUnitVectors(_upAxis, _velVec);
      }
      _dummy.position.set(d.x, d.y, d.z);
      _dummy.quaternion.copy(_quat);
      const speedStretch = 0.7 + Math.min(1.6, Math.hypot(d.vx, d.vy, d.vz) * 0.38);
      _dummy.scale.set(d.scale, d.scale * speedStretch, d.scale);
      _dummy.updateMatrix();
      this.pipeWaterMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.pipeWaterMesh.instanceMatrix.needsUpdate = true;

    // Expanding water puddle splash rings in the pipe landing zone
    const activeSplashes = Math.floor(SPLASH_COUNT * (0.38 + pressure * 0.62));
    this.splashMat.opacity = 0.34 + pressure * 0.42;
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const s = this.splashes[i];
      if (i >= activeSplashes) {
        _dummy.position.set(0, -99, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.splashMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      s.age += dt;
      if (s.age >= s.maxAge) {
        s.age = 0;
        s.maxAge = 0.2 + Math.random() * 0.22;
        s.x = -1.45 + Math.random() * 1.85;
        s.z = -1.95 + Math.random() * 1.25;
      }
      const p = s.age / s.maxAge;
      const scale = (0.45 + p * 1.85) * (1 - p * 0.3);
      _dummy.position.set(s.x, -0.698, s.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(scale, 1, scale);
      _dummy.updateMatrix();
      this.splashMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.splashMesh.instanceMatrix.needsUpdate = true;
  }

  private updateAirParticlesAndDust(dt: number, elapsed: number): void {
    _windDir.copy(this.state.windVec);
    const dustBaseOpacity = this.location === 'balcony' ? 0.2 : 0.36;
    this.moteMat.opacity = dustBaseOpacity + this.state.windStrength * 0.38;

    for (let i = 0; i < WIND_MOTE_COUNT; i++) {
      const m = this.motes[i];
      const swirl = Math.sin(elapsed * 4.2 + m.phase) * (0.35 + this.state.windStrength * 0.7);
      m.x += (_windDir.x * 0.95 + swirl * 0.28) * m.speedMul * dt;
      m.y += (_windDir.y * 0.45 + Math.cos(elapsed * 2.9 + m.phase) * 0.24) * dt;
      m.z += (_windDir.z * 0.95) * m.speedMul * dt;

      if (m.x > 2.7) m.x -= 5.4;
      else if (m.x < -2.7) m.x += 5.4;
      if (m.y > 1.75) m.y = -0.6;
      else if (m.y < -0.65) m.y = 1.7;
      if (m.z > 1.2) m.z -= 3.9;
      else if (m.z < -2.7) m.z += 3.9;

      _dummy.position.set(m.x, m.y, m.z);
      _dummy.rotation.set(elapsed + m.phase, elapsed * 1.3, 0);
      const streak = this.location === 'room' ? 1 + this.state.windStrength * 0.9 : 1 + this.state.windStrength * 1.1;
      _dummy.scale.set(m.scale * streak, m.scale * 0.75, m.scale * 0.75);
      _dummy.updateMatrix();
      this.moteMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.moteMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.rainMesh.geometry.dispose();
    this.rainMat.dispose();
    this.splashMesh.geometry.dispose();
    this.splashMat.dispose();
    this.moteMesh.geometry.dispose();
    this.moteMat.dispose();
    this.smokeMesh.geometry.dispose();
    this.smokeMat.dispose();
    this.smokeTex.dispose();
    this.pipeWaterMesh.geometry.dispose();
    this.pipeWaterMat.dispose();
  }
}
