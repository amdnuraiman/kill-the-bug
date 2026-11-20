import * as THREE from 'three';
import type { BugKind } from '../audio/ProceduralAudioEngine';
import { attachInkOutline } from './AnimeStyle';
import type { WeatherTier } from './WeatherSystem';

export interface BugUpdateResult {
  distanceToCamera: number;
  bittenPlayer: boolean;
  biteCharge: number;
  isDiving: boolean;
}

export interface WeatherFlightContext {
  windVec: THREE.Vector3;
  turbulence: number;
  weatherTier?: WeatherTier;
  mosquitoSpeedMult?: number;
  mosquitoChaosMult?: number;
}

const _desired = new THREE.Vector3();
const _desiredVel = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

function createCompoundEyeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#450a0a';
  ctx.fillRect(0, 0, 128, 128);

  for (let y = 4; y < 128; y += 10) {
    for (let x = 4; x < 128; x += 10) {
      const ox = (Math.floor(y / 10) % 2) * 5;
      ctx.fillStyle = (x + y) % 20 === 0 ? '#fb7185' : '#e11d48';
      ctx.beginPath();
      ctx.arc(x + ox, y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createVeinedWingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  ctx.fillStyle = 'rgba(203, 213, 225, 0.42)';
  ctx.beginPath();
  ctx.ellipse(64, 64, 48, 58, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(64, 64, 48, 58, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(64, 120);
    ctx.quadraticCurveTo(30 + i * 14, 64, 24 + i * 16, 12);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFlyAbdomenGeo(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.002, -0.055),
    new THREE.Vector2(0.032, -0.04),
    new THREE.Vector2(0.048, -0.012),
    new THREE.Vector2(0.044, 0.025),
    new THREE.Vector2(0.022, 0.05),
    new THREE.Vector2(0.002, 0.055),
  ];
  const g = new THREE.LatheGeometry(pts, 12);
  g.rotateX(Math.PI / 2);
  return g;
}

function createMosquitoSacGeo(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.002, -0.072),
    new THREE.Vector2(0.013, -0.052),
    new THREE.Vector2(0.024, -0.022),
    new THREE.Vector2(0.02, 0.018),
    new THREE.Vector2(0.01, 0.048),
    new THREE.Vector2(0.002, 0.054),
  ];
  const g = new THREE.LatheGeometry(pts, 10);
  g.rotateX(Math.PI / 2);
  return g;
}

const sharedGeo = {
  flyThorax: new THREE.SphereGeometry(0.038, 12, 10),
  flyAbdomen: createFlyAbdomenGeo(),
  flyHead: new THREE.SphereGeometry(0.03, 12, 10),
  flyEye: new THREE.SphereGeometry(0.022, 12, 10),
  mandible: new THREE.ConeGeometry(0.006, 0.028, 5),
  spike: new THREE.ConeGeometry(0.0045, 0.026, 5),
  wingPlane: new THREE.PlaneGeometry(0.095, 0.145),
  mosqThorax: new THREE.SphereGeometry(0.023, 10, 8),
  mosqAbdomen: createMosquitoSacGeo(),
  mosqHead: new THREE.SphereGeometry(0.019, 10, 8),
  mosqProboscis: new THREE.ConeGeometry(0.0042, 0.088, 6),
  bloodTip: new THREE.SphereGeometry(0.0055, 8, 8),
  legUpper: new THREE.CylinderGeometry(0.0032, 0.0025, 0.038, 5),
  legLower: new THREE.CylinderGeometry(0.0022, 0.001, 0.052, 5),
  dangerRing: new THREE.RingGeometry(0.054, 0.074, 24),
};

let sharedMat: {
  flyChitin: THREE.MeshPhysicalMaterial;
  flyAbdomen: THREE.MeshPhysicalMaterial;
  horrorEye: THREE.MeshStandardMaterial;
  bloodSac: THREE.MeshPhysicalMaterial;
  bloodCrimson: THREE.MeshStandardMaterial;
  mosqArmor: THREE.MeshPhysicalMaterial;
  mosqStripe: THREE.MeshStandardMaterial;
  wing: THREE.MeshBasicMaterial;
  darkClaw: THREE.MeshStandardMaterial;
} | null = null;

function getSharedMat() {
  if (sharedMat) return sharedMat;
  const eyeTex = createCompoundEyeTexture();
  const wingTex = createVeinedWingTexture();
  sharedMat = {
    flyChitin: new THREE.MeshPhysicalMaterial({
      color: 0x064e3b,
      roughness: 0.28,
      metalness: 0.55,
      clearcoat: 0.65,
    }),
    flyAbdomen: new THREE.MeshPhysicalMaterial({
      color: 0x1e1b4b,
      roughness: 0.35,
      metalness: 0.4,
      clearcoat: 0.45,
    }),
    horrorEye: new THREE.MeshStandardMaterial({
      map: eyeTex,
      emissive: 0xe11d48,
      emissiveIntensity: 0.95,
      roughness: 0.2,
    }),
    bloodSac: new THREE.MeshPhysicalMaterial({
      color: 0x991b1b,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.7,
      roughness: 0.18,
      clearcoat: 0.9,
      transparent: true,
      opacity: 0.9,
    }),
    bloodCrimson: new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 0.85,
      roughness: 0.15,
    }),
    mosqArmor: new THREE.MeshPhysicalMaterial({
      color: 0x1f1218,
      roughness: 0.42,
      metalness: 0.35,
    }),
    mosqStripe: new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      roughness: 0.68,
    }),
    wing: new THREE.MeshBasicMaterial({
      map: wingTex,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    darkClaw: new THREE.MeshStandardMaterial({
      color: 0x090612,
      roughness: 0.35,
      metalness: 0.4,
    }),
  };
  return sharedMat;
}

export class BugEntity {
  public readonly id: number;
  public readonly kind: BugKind;
  public readonly root: THREE.Group;
  public readonly pos = new THREE.Vector3();
  public readonly vel = new THREE.Vector3();
  public alive = true;
  public readonly hitRadius: number;

  private wingL: THREE.Object3D;
  private wingR: THREE.Object3D;
  private mandibleL: THREE.Object3D | null = null;
  private mandibleR: THREE.Object3D | null = null;
  private abdomenMesh: THREE.Mesh | null = null;
  private dangerRing: THREE.Mesh;
  private wingPhase = Math.random() * Math.PI * 2;
  private targetPos = new THREE.Vector3();
  private state: 'roam' | 'approach_head' | 'dive_bite' = 'roam';
  private stateTimer = 0;
  private earSide: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
  private earOrbitAngle = Math.random() * Math.PI * 2;
  private biteCharge = 0;
  private speedScale: number;
  private gustSeed = Math.random() * 100;
  private gustDashTimer = 0.75 + Math.random() * 0.9;
  private gustDashActive = 0;
  private gustDashVec = new THREE.Vector3();

  constructor(id: number, kind: BugKind, intensityScale = 1) {
    this.id = id;
    this.kind = kind;
    this.root = new THREE.Group();
    this.hitRadius = kind === 'fly' ? 0.21 : 0.19;
    this.speedScale = intensityScale;

    if (kind === 'fly') {
      const built = this.buildScaryFlyMesh();
      this.wingL = built.wingL;
      this.wingR = built.wingR;
      this.mandibleL = built.mandibleL;
      this.mandibleR = built.mandibleR;
    } else {
      const built = this.buildScaryMosquitoMesh();
      this.wingL = built.wingL;
      this.wingR = built.wingR;
      this.abdomenMesh = built.abdomenMesh;
    }

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.dangerRing = new THREE.Mesh(sharedGeo.dangerRing, ringMat);
    this.root.add(this.dangerRing);

    const angle = (Math.random() - 0.5) * 2.1;
    const dist = 2.3 + Math.random() * 1.25;
    this.pos.set(
      Math.sin(angle) * dist,
      0.22 + Math.random() * 1.0,
      -Math.cos(angle) * dist + 0.25,
    );
    this.root.position.copy(this.pos);

    this.state = Math.random() < 0.62 ? 'approach_head' : 'roam';
    this.stateTimer = 0.9 + Math.random() * 1.2;
    this.pickRoamTarget();
  }

  private buildScaryFlyMesh() {
    const mats = getSharedMat();
    const bodyGroup = new THREE.Group();

    // 1. Armored thorax + dorsal spikes
    const thorax = new THREE.Mesh(sharedGeo.flyThorax, mats.flyChitin);
    thorax.scale.set(1.05, 0.95, 1.15);
    thorax.castShadow = true;
    attachInkOutline(thorax, 1.1);
    bodyGroup.add(thorax);

    for (let i = 0; i < 3; i++) {
      const spine = new THREE.Mesh(sharedGeo.spike, mats.darkClaw);
      spine.position.set(0, 0.036, 0.015 - i * 0.018);
      spine.rotation.x = -0.45 - i * 0.15;
      bodyGroup.add(spine);
    }

    // 2. Segmented sculpted abdomen
    const abdomen = new THREE.Mesh(sharedGeo.flyAbdomen, mats.flyAbdomen);
    abdomen.position.set(0, -0.008, -0.064);
    abdomen.castShadow = true;
    attachInkOutline(abdomen, 1.09);
    bodyGroup.add(abdomen);

    // 3. Fierce head + oversized glowing crimson compound eyes
    const head = new THREE.Mesh(sharedGeo.flyHead, mats.flyChitin);
    head.position.set(0, 0.005, 0.044);
    attachInkOutline(head, 1.1);
    bodyGroup.add(head);

    const eyeL = new THREE.Mesh(sharedGeo.flyEye, mats.horrorEye);
    eyeL.position.set(-0.02, 0.014, 0.056);
    eyeL.scale.set(1, 1.18, 1.05);
    attachInkOutline(eyeL, 1.12);
    const eyeR = new THREE.Mesh(sharedGeo.flyEye, mats.horrorEye);
    eyeR.position.set(0.02, 0.014, 0.056);
    eyeR.scale.set(1, 1.18, 1.05);
    attachInkOutline(eyeR, 1.12);
    bodyGroup.add(eyeL, eyeR);

    // 4. Snapping serrated mandibles
    const mandibleL = new THREE.Mesh(sharedGeo.mandible, mats.darkClaw);
    mandibleL.position.set(-0.012, -0.01, 0.068);
    mandibleL.rotation.set(Math.PI * 0.55, 0, -0.35);
    const mandibleR = new THREE.Mesh(sharedGeo.mandible, mats.darkClaw);
    mandibleR.position.set(0.012, -0.01, 0.068);
    mandibleR.rotation.set(Math.PI * 0.55, 0, 0.35);
    bodyGroup.add(mandibleL, mandibleR);

    // 5. 6 jointed spiked horror legs
    for (const side of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        const legPivot = new THREE.Group();
        legPivot.position.set(side * 0.026, -0.022, i * 0.02);
        const upper = new THREE.Mesh(sharedGeo.legUpper, mats.darkClaw);
        upper.position.set(side * 0.014, -0.012, 0);
        upper.rotation.z = side * 0.85;
        const lower = new THREE.Mesh(sharedGeo.legLower, mats.darkClaw);
        lower.position.set(side * 0.032, -0.036, i * 0.008);
        lower.rotation.z = -side * 0.25;
        legPivot.add(upper, lower);
        bodyGroup.add(legPivot);
      }
    }

    // 6. Ragged veined wings
    const wingL = new THREE.Group();
    wingL.position.set(-0.016, 0.034, 0.01);
    const wingMeshL = new THREE.Mesh(sharedGeo.wingPlane, mats.wing);
    wingMeshL.rotation.x = Math.PI / 2;
    wingMeshL.rotation.z = 0.25;
    wingMeshL.position.set(-0.038, 0, -0.048);
    wingL.add(wingMeshL);

    const wingR = new THREE.Group();
    wingR.position.set(0.016, 0.034, 0.01);
    const wingMeshR = new THREE.Mesh(sharedGeo.wingPlane, mats.wing);
    wingMeshR.rotation.x = Math.PI / 2;
    wingMeshR.rotation.z = -0.25;
    wingMeshR.position.set(0.038, 0, -0.048);
    wingR.add(wingMeshR);

    bodyGroup.add(wingL, wingR);
    bodyGroup.scale.setScalar(0.84);
    this.root.add(bodyGroup);
    return { wingL, wingR, mandibleL, mandibleR };
  }

  private buildScaryMosquitoMesh() {
    const mats = getSharedMat();
    const bodyGroup = new THREE.Group();

    // 1. Hunched armored thorax + spine crest
    const thorax = new THREE.Mesh(sharedGeo.mosqThorax, mats.mosqArmor);
    thorax.scale.set(0.95, 1.15, 1.25);
    thorax.castShadow = true;
    attachInkOutline(thorax, 1.12);
    bodyGroup.add(thorax);

    const crest = new THREE.Mesh(sharedGeo.spike, mats.darkClaw);
    crest.position.set(0, 0.028, 0.005);
    crest.rotation.x = -0.35;
    bodyGroup.add(crest);

    // 2. Swollen pulsing blood-filled abdomen
    const abdomenMesh = new THREE.Mesh(sharedGeo.mosqAbdomen, mats.bloodSac);
    abdomenMesh.position.set(0, -0.014, -0.068);
    abdomenMesh.rotation.x = -0.18;
    abdomenMesh.castShadow = true;
    attachInkOutline(abdomenMesh, 1.1);
    bodyGroup.add(abdomenMesh);

    const stripe = new THREE.Mesh(sharedGeo.mosqThorax, mats.mosqStripe);
    stripe.scale.set(0.9, 0.45, 0.85);
    stripe.position.set(0, -0.012, -0.048);
    bodyGroup.add(stripe);

    // 3. Head + glowing predator eyes
    const head = new THREE.Mesh(sharedGeo.mosqHead, mats.mosqArmor);
    head.position.set(0, 0.012, 0.042);
    attachInkOutline(head, 1.12);
    bodyGroup.add(head);

    const eyeL = new THREE.Mesh(sharedGeo.flyEye, mats.horrorEye);
    eyeL.scale.setScalar(0.55);
    eyeL.position.set(-0.012, 0.016, 0.048);
    const eyeR = new THREE.Mesh(sharedGeo.flyEye, mats.horrorEye);
    eyeR.scale.setScalar(0.55);
    eyeR.position.set(0.012, 0.016, 0.048);
    bodyGroup.add(eyeL, eyeR);

    // 4. Long needle proboscis + crimson blood tip
    const proboscis = new THREE.Mesh(sharedGeo.mosqProboscis, mats.darkClaw);
    proboscis.rotation.x = Math.PI / 2 + 0.24;
    proboscis.position.set(0, -0.004, 0.088);
    bodyGroup.add(proboscis);

    const bloodTip = new THREE.Mesh(sharedGeo.bloodTip, mats.bloodCrimson);
    bloodTip.position.set(0, -0.015, 0.128);
    bodyGroup.add(bloodTip);

    // 5. 6 long spindly spiked trailing legs
    for (const side of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        const legPivot = new THREE.Group();
        legPivot.position.set(side * 0.02, -0.022, i * 0.022);
        const upper = new THREE.Mesh(sharedGeo.legUpper, mats.darkClaw);
        upper.scale.set(0.8, 1.35, 0.8);
        upper.position.set(side * 0.02, -0.015, -0.006);
        upper.rotation.z = side * 0.95;
        const lower = new THREE.Mesh(sharedGeo.legLower, mats.darkClaw);
        lower.scale.set(0.8, 1.55, 0.8);
        lower.position.set(side * 0.045, -0.052, -0.022 + i * 0.012);
        lower.rotation.z = -side * 0.35;
        lower.rotation.x = 0.35;
        legPivot.add(upper, lower);
        bodyGroup.add(legPivot);
      }
    }

    // 6. Sharp fast-buzzing veined wings
    const wingL = new THREE.Group();
    wingL.position.set(-0.012, 0.026, 0.014);
    const wingMeshL = new THREE.Mesh(sharedGeo.wingPlane, mats.wing);
    wingMeshL.scale.set(0.75, 1.05, 1);
    wingMeshL.rotation.x = Math.PI / 2;
    wingMeshL.rotation.z = 0.2;
    wingMeshL.position.set(-0.032, 0, -0.045);
    wingL.add(wingMeshL);

    const wingR = new THREE.Group();
    wingR.position.set(0.012, 0.026, 0.014);
    const wingMeshR = new THREE.Mesh(sharedGeo.wingPlane, mats.wing);
    wingMeshR.scale.set(0.75, 1.05, 1);
    wingMeshR.rotation.x = Math.PI / 2;
    wingMeshR.rotation.z = -0.2;
    wingMeshR.position.set(0.032, 0, -0.045);
    wingR.add(wingMeshR);

    bodyGroup.add(wingL, wingR);
    bodyGroup.scale.setScalar(0.86);
    this.root.add(bodyGroup);
    return { wingL, wingR, abdomenMesh };
  }

  private pickRoamTarget(): void {
    this.targetPos.set(
      (Math.random() - 0.5) * 2.8,
      -0.1 + Math.random() * 1.05,
      -0.85 - Math.random() * 1.6,
    );
  }

  public update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    elapsed: number,
    slowFactor = 1,
    panicMode = false,
    weather?: WeatherFlightContext,
  ): BugUpdateResult {
    if (!this.alive) {
      return { distanceToCamera: 99, bittenPlayer: false, biteCharge: 0, isDiving: false };
    }

    this.stateTimer -= dt;
    const camPos = camera.position;
    const effectiveSpeed = this.speedScale * slowFactor * (panicMode ? 1.24 : 1);

    if (this.state === 'roam') {
      if (this.pos.distanceTo(this.targetPos) < 0.35 || this.stateTimer <= 0) {
        this.state = 'approach_head';
        this.stateTimer = 1.6 + Math.random() * 1.1;
        this.earSide = Math.random() < 0.5 ? -1 : 1;
      }
    } else if (this.state === 'approach_head') {
      this.earOrbitAngle += dt * 2.6 * this.earSide;
      this.targetPos.set(
        camPos.x + this.earSide * (0.34 + Math.sin(this.earOrbitAngle) * 0.22),
        camPos.y + Math.sin(elapsed * 3.4 + this.id) * 0.18,
        camPos.z - 0.72,
      );

      if (this.pos.distanceTo(camPos) < 0.96 || this.stateTimer <= 0) {
        this.state = 'dive_bite';
        this.stateTimer = 2.8;
      }
    } else if (this.state === 'dive_bite') {
      this.targetPos.set(
        camPos.x + Math.sin(elapsed * 5.2 + this.id) * 0.18,
        camPos.y - 0.08 + Math.cos(elapsed * 4.5 + this.id) * 0.14,
        camPos.z - 0.36,
      );
      if (this.stateTimer <= 0) {
        this.state = 'roam';
        this.stateTimer = 1.2;
        this.pickRoamTarget();
      }
    }

    _desired.copy(this.targetPos).sub(this.pos);
    const distToTarget = _desired.length();
    if (distToTarget > 0.001) _desired.divideScalar(distToTarget);

    const isMosquito = this.kind === 'mosquito';
    const weatherTier = weather?.weatherTier ?? 'calm';
    const isFrenzy = isMosquito && (weatherTier === 'windy' || weatherTier === 'stormy');
    const mosquitoSpeedMult = isFrenzy ? (weather?.mosquitoSpeedMult ?? 1.3) : 1.0;
    const mosquitoChaosMult = isFrenzy ? (weather?.mosquitoChaosMult ?? 1.5) : 1.0;

    const baseSpeed = isMosquito ? 2.15 : 2.6;
    const chargeBoost = this.state === 'dive_bite' ? 1.18 : 1.0;
    _desiredVel
      .copy(_desired)
      .multiplyScalar(baseSpeed * effectiveSpeed * chargeBoost * mosquitoSpeedMult);

    // Dynamic storm weather turbulence makes flight paths increasingly erratic!
    const turb = weather ? 1 + weather.turbulence * 0.85 : 1;
    const jitterFreq =
      (isMosquito ? 11.0 : 14.0) * (1 + (turb - 1) * 0.35) * (isFrenzy ? 1.28 : 1.0);
    const jitterAmp =
      (this.state === 'dive_bite' ? 0.48 : isMosquito ? 0.82 : 1.08) *
      turb *
      mosquitoChaosMult;

    _desiredVel.x += Math.sin(elapsed * jitterFreq + this.id * 3.1) * jitterAmp;
    _desiredVel.y += Math.cos(elapsed * (jitterFreq * 1.17) + this.id * 2.3) * (jitterAmp * 0.75);
    _desiredVel.z += Math.sin(elapsed * (jitterFreq * 0.83) + this.id * 1.7) * (jitterAmp * 0.6);

    // Unpredictable dual-harmonic zigzags + sudden wind-gust dashes for mosquitoes in windy/stormy weather
    if (isFrenzy) {
      const zigFreq = weatherTier === 'stormy' ? 23.5 : 17.5;
      const zigAmp = weatherTier === 'stormy' ? 1.25 : 0.82;
      _desiredVel.x += Math.cos(elapsed * zigFreq + this.gustSeed) * zigAmp;
      _desiredVel.y += Math.sin(elapsed * (zigFreq * 1.31) + this.gustSeed * 1.7) * (zigAmp * 0.7);
      _desiredVel.z += Math.cos(elapsed * (zigFreq * 0.91) + this.id * 4.1) * (zigAmp * 0.5);

      if (this.gustDashActive > 0) {
        this.gustDashActive = Math.max(0, this.gustDashActive - dt);
        const dashStrength = weatherTier === 'stormy' ? 2.45 : 1.75;
        _desiredVel.addScaledVector(this.gustDashVec, dashStrength);
      } else {
        this.gustDashTimer -= dt;
        if (this.gustDashTimer <= 0) {
          this.gustDashActive = weatherTier === 'stormy' ? 0.28 : 0.22;
          this.gustDashTimer =
            weatherTier === 'stormy'
              ? 0.62 + Math.random() * 0.65
              : 0.95 + Math.random() * 0.85;
          const lateralSign = Math.random() < 0.5 ? -1 : 1;
          const vertSign = Math.random() < 0.5 ? -1 : 1;
          this.gustDashVec
            .set(
              lateralSign * (0.75 + Math.random() * 0.45) + (weather?.windVec.x ?? 0) * 0.25,
              vertSign * (0.35 + Math.random() * 0.4),
              (Math.random() - 0.35) * 0.65,
            )
            .normalize();
        }
      }
    } else {
      this.gustDashActive = 0;
    }

    if (weather) {
      const gustWave = Math.sin(elapsed * 5.4 + this.gustSeed) * 0.5 + 0.5;
      _desiredVel.addScaledVector(weather.windVec, (0.32 + gustWave * 0.42) * (isFrenzy ? 1.35 : 1.0));
    }

    const baseSteer = isMosquito ? 5.0 : 6.2;
    const steerBoost = isFrenzy
      ? this.gustDashActive > 0
        ? 1.75
        : weatherTier === 'stormy'
          ? 1.38
          : 1.2
      : 1.0;
    const steerRate = baseSteer * steerBoost;
    this.vel.lerp(_desiredVel, Math.min(1, dt * steerRate));
    this.pos.addScaledVector(this.vel, dt);

    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -2.0, 2.0);
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, -0.55, 1.32);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -2.5, camPos.z - 0.33);

    this.root.position.copy(this.pos);
    if (this.vel.lengthSq() > 0.01) {
      _lookTarget.copy(this.pos).add(this.vel);
      this.root.lookAt(_lookTarget);
    }

    const flapSpeed = this.kind === 'mosquito' ? 105 : 80;
    this.wingPhase += dt * flapSpeed;
    const flapAngle = Math.sin(this.wingPhase) * 0.72;
    this.wingL.rotation.z = flapAngle;
    this.wingR.rotation.z = -flapAngle;

    if (this.mandibleL && this.mandibleR) {
      const snap = Math.sin(elapsed * 22 + this.id) * 0.25;
      this.mandibleL.rotation.z = -0.35 + snap;
      this.mandibleR.rotation.z = 0.35 - snap;
    }

    if (this.abdomenMesh) {
      const pulse = 1 + Math.sin(elapsed * 12 + this.id) * (0.04 + this.biteCharge * 0.14);
      this.abdomenMesh.scale.set(pulse, pulse, 1);
    }

    const distanceToCamera = this.pos.distanceTo(camPos);
    let bittenPlayer = false;

    if (distanceToCamera < 0.62) {
      const chargeSpeed = (this.kind === 'mosquito' ? 0.56 : 0.44) * (panicMode ? 1.18 : 1.0);
      this.biteCharge = Math.min(1, this.biteCharge + dt * chargeSpeed);
      if (this.biteCharge >= 1) {
        this.biteCharge = 0;
        bittenPlayer = true;
        this.state = 'roam';
        this.stateTimer = 1.6;
        this.pickRoamTarget();
      }
    } else {
      this.biteCharge = Math.max(0, this.biteCharge - dt * 0.45);
    }

    const ringMat = this.dangerRing.material as THREE.MeshBasicMaterial;
    const isDiving = this.state === 'dive_bite' || distanceToCamera < 0.9;
    if (isDiving) {
      this.dangerRing.lookAt(camPos);
      const pulse = 1 + Math.sin(elapsed * 18) * 0.16 + this.biteCharge * 0.35;
      this.dangerRing.scale.setScalar(pulse);
      ringMat.opacity = 0.35 + this.biteCharge * 0.62;
      ringMat.color.setHex(this.biteCharge > 0.5 ? 0xef4444 : 0xfacc15);
    } else {
      ringMat.opacity = 0;
    }

    return { distanceToCamera, bittenPlayer, biteCharge: this.biteCharge, isDiving };
  }
}
