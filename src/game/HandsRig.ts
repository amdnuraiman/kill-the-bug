import * as THREE from 'three';
import type { SpecialEquipment } from './Equipment';

export type HandActionType = 'none' | 'clap' | 'smash_left' | 'smash_right';

export interface BugClapOrder {
  bugId: number;
  pos: THREE.Vector3;
  delay: number;
}

export interface FloorHandOrder {
  targetX: number;
  targetZ: number;
  delay: number;
  scale: number;
  yaw: number;
}

export interface HandsRigCallbacks {
  onSuperFloorImpact?: (worldPos: THREE.Vector3, handIndex: number, totalHands: number) => void;
  onBugClapPulse?: (bugId: number, worldPos: THREE.Vector3, clapStep: 1 | 2) => void;
}

interface ArticulatedFinger {
  proximal: THREE.Group;
  middle: THREE.Group;
  distal: THREE.Group;
}

interface HandParts {
  group: THREE.Group;
  fingers: ArticulatedFinger[];
  thumb: ArticulatedFinger;
  equipBand: THREE.Mesh;
  equipCrests: THREE.Mesh[];
  restPos: THREE.Vector3;
  restRot: THREE.Euler;
  restCurls: [number, number, number, number];
}

interface AuraMoteState {
  handIndex: 0 | 1;
  angle: number;
  heightOffset: number;
  radius: number;
  speed: number;
  scale: number;
}

const AURA_MOTE_COUNT = 32;
const _auraDummy = new THREE.Object3D();
const _goldColorA = new THREE.Color(0xfacc15);
const _goldColorB = new THREE.Color(0xfef08a);
const _purpleColorA = new THREE.Color(0x9333ea);
const _purpleColorB = new THREE.Color(0xe879f9);
const _skinNeutralSheen = new THREE.Color(0xffd5c2);
const _skinGoldSheen = new THREE.Color(0xfde047);
const _skinPurpleSheen = new THREE.Color(0xd946ef);

const _lTargetPos = new THREE.Vector3();
const _rTargetPos = new THREE.Vector3();
const _lTargetRot = new THREE.Euler(0, 0, 0, 'YXZ');
const _rTargetRot = new THREE.Euler(0, 0, 0, 'YXZ');
const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();

function createStandAuraShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uColorPrimary: { value: _goldColorA.clone() },
      uColorSecondary: { value: _goldColorB.clone() },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;

      void main() {
        vUv = uv;
        float ripple = sin(uv.y * 22.0 - uTime * 11.5 + uv.x * 8.0) *
                       cos(uv.x * 16.0 + uTime * 6.5);
        float expand = 0.0042 + uIntensity * 0.0038 + ripple * 0.0022 * uIntensity;
        vec3 displaced = position + normal * expand;
        vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPos = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColorPrimary;
      uniform vec3 uColorSecondary;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;

      void main() {
        if (uIntensity <= 0.01) discard;
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPos);
        float fresnel = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 1.75);

        float wave1 = sin(vUv.y * 24.0 - uTime * 11.0 + sin(vUv.x * 12.0 + uTime * 4.2) * 1.35) * 0.5 + 0.5;
        float wave2 = cos(vUv.y * 36.0 - uTime * 15.0 - vUv.x * 10.0) * 0.5 + 0.5;
        float shimmer = wave1 * 0.55 + wave2 * 0.45;
        float flameBoost = pow(shimmer, 2.2);

        vec3 auraCol = mix(uColorPrimary, uColorSecondary, clamp(fresnel * 0.65 + flameBoost * 0.5, 0.0, 1.0));
        float alpha = clamp((fresnel * (0.68 + 0.55 * shimmer) + flameBoost * 0.24) * uIntensity, 0.0, 0.92);
        gl_FragColor = vec4(auraCol * (1.05 + flameBoost * 0.45), alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

function createNaturalSkinTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#f4c0a4'); // fingertips / warm blush
  grad.addColorStop(0.28, '#f5c7ad'); // knuckles
  grad.addColorStop(0.62, '#f2bfa2'); // palm / dorsum
  grad.addColorStop(1, '#e7ae8f'); // wrist / forearm
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle organic skin pores / knuckle warmth without harsh anime banding
  const blush = ctx.createRadialGradient(128, 72, 12, 128, 72, 92);
  blush.addColorStop(0, 'rgba(229, 134, 114, 0.16)');
  blush.addColorStop(1, 'rgba(229, 134, 114, 0)');
  ctx.fillStyle = blush;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds a single continuous, watertight organic forearm -> wrist -> palm lofted mesh.
 * Local space convention (before per-hand YXZ rotation):
 *   +Y = toward fingertips
 *   +Z = inner palmar side (fingers flex toward +Z)
 *   -Z = dorsal back of hand (fingernails & knuckles)
 *   Thumb edge = side * X (left hand side=-1 -> -X; right hand side=+1 -> +X)
 */
function createSeamlessArmPalmGeometry(side: -1 | 1): THREE.BufferGeometry {
  const rings = 20;
  const radialSegs = 26;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const smoothstep = (a: number, b: number, x: number) => {
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  for (let i = 0; i <= rings; i++) {
    const t = i / rings; // 0 = bottom forearm, 1 = knuckle bridge
    const y = THREE.MathUtils.lerp(-0.34, 0.068, t);

    // Forearm tapers into anatomical wrist around t = 0.56 (y ~ -0.11), then widens smoothly into palm
    const wristT = Math.exp(-Math.pow((t - 0.56) / 0.18, 2));
    const palmT = smoothstep(0.55, 0.92, t);
    const topCapT = smoothstep(0.88, 1.0, t);
    const botCapT = 1 - smoothstep(0.0, 0.04, t);

    let rx = THREE.MathUtils.lerp(0.042, 0.031, smoothstep(0, 0.56, t));
    rx = THREE.MathUtils.lerp(rx, 0.0455, palmT);
    rx *= 1 - wristT * 0.08;

    let rz = THREE.MathUtils.lerp(0.034, 0.0195, smoothstep(0, 0.56, t));
    rz = THREE.MathUtils.lerp(rz, 0.0148, palmT);

    // Taper smoothly at the very ends so caps are seamless
    const endScale = (1 - topCapT * 0.42) * (1 - botCapT * 0.25);
    rx *= endScale;
    rz *= endScale;

    // Slight natural lateral shift so forearm aligns nicely into palm center
    const centerX = -side * 0.004 * (1 - palmT);

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Squared-ellipse cross-section for flat palm + gentle dorsal curve
      const superExp = 0.86;
      const sx = Math.sign(cosT) * Math.pow(Math.abs(cosT), superExp);
      const sz = Math.sign(sinT) * Math.pow(Math.abs(sinT), superExp);

      let px = centerX + sx * rx;
      let pz = sz * rz;
      let py = y;

      // Anatomical sloped knuckle bridge (index higher, pinky lower)
      const thumbEdgeAlignment = cosT * side; // +1 on thumb/index side, -1 on pinky side
      if (t > 0.62) {
        const slopeWeight = smoothstep(0.62, 1.0, t);
        py += thumbEdgeAlignment * 0.011 * slopeWeight;
        // Slight metacarpal arch across back of hand (-Z)
        if (sinT < 0) {
          pz += sinT * 0.003 * (1 - Math.abs(cosT) * 0.5) * slopeWeight;
        }
      }

      // Thenar eminence (meaty thumb-base muscle pad on palm side +Z)
      const thenarBand = Math.exp(-Math.pow((t - 0.69) / 0.12, 2));
      if (thumbEdgeAlignment > 0 && sinT > -0.2) {
        const pad = thenarBand * thumbEdgeAlignment * (0.45 + 0.55 * Math.max(0, sinT));
        pz += pad * 0.0085;
        px += side * pad * 0.0065;
      }

      // Gentle palm hollow in upper-center +Z
      if (t > 0.72 && t < 0.94 && sinT > 0.25 && Math.abs(cosT) < 0.65) {
        pz -= 0.0032 * sinT * (1 - Math.abs(cosT));
      }

      positions.push(px, py, pz);
      uvs.push(u, t);
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = (i + 1) * stride + j;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  // Cap top & bottom vertices cleanly
  const topCenterIdx = positions.length / 3;
  positions.push(0, 0.072, 0);
  uvs.push(0.5, 1);
  const topRingStart = rings * stride;
  for (let j = 0; j < radialSegs; j++) {
    indices.push(topRingStart + j, topCenterIdx, topRingStart + j + 1);
  }

  const botCenterIdx = positions.length / 3;
  positions.push(-side * 0.004, -0.342, 0);
  uvs.push(0.5, 0);
  for (let j = 0; j < radialSegs; j++) {
    indices.push(j + 1, botCenterIdx, j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createPhalanxLatheGeometry(rBottom: number, rTop: number, length: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(rBottom * 0.96, 0),
    new THREE.Vector2(rBottom, length * 0.16),
    new THREE.Vector2(THREE.MathUtils.lerp(rBottom, rTop, 0.45) * 0.95, length * 0.52),
    new THREE.Vector2(rTop * 1.02, length * 0.85),
    new THREE.Vector2(rTop * 0.96, length),
  ];
  const geo = new THREE.LatheGeometry(pts, 14);
  geo.scale(1, 1, 0.92);
  geo.computeVertexNormals();
  return geo;
}

function createFingertipLatheGeometry(rBase: number, length: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(rBase * 0.98, 0),
    new THREE.Vector2(rBase * 0.94, length * 0.35),
    new THREE.Vector2(rBase * 0.82, length * 0.68),
    new THREE.Vector2(rBase * 0.56, length * 0.88),
    new THREE.Vector2(rBase * 0.25, length * 0.97),
    new THREE.Vector2(0, length),
  ];
  const geo = new THREE.LatheGeometry(pts, 14);
  geo.scale(1, 1, 0.88);
  geo.computeVertexNormals();
  return geo;
}

interface SuperHandSlot {
  group: THREE.Group;
  handMat: THREE.MeshPhysicalMaterial;
  goldMat: THREE.MeshPhysicalMaterial;
  auraMat: THREE.MeshBasicMaterial;
  active: boolean;
  elapsed: number;
  delay: number;
  duration: number;
  targetX: number;
  targetZ: number;
  baseScale: number;
  yaw: number;
  impactSpawned: boolean;
  handIndex: number;
  totalHands: number;
}

interface BugClapPairSlot {
  group: THREE.Group;
  leftHand: THREE.Group;
  rightHand: THREE.Group;
  mat: THREE.MeshPhysicalMaterial;
  goldMat: THREE.MeshPhysicalMaterial;
  active: boolean;
  elapsed: number;
  delay: number;
  duration: number;
  bugId: number;
  worldPos: THREE.Vector3;
  clap1Fired: boolean;
  clap2Fired: boolean;
}

export class HandsRig {
  public readonly root = new THREE.Group();
  private leftHand: HandParts;
  private rightHand: HandParts;

  private skinMat: THREE.MeshPhysicalMaterial;
  private nailMat: THREE.MeshPhysicalMaterial;
  private equipBandMat: THREE.MeshPhysicalMaterial;
  private standAuraMat: THREE.ShaderMaterial;
  private auraMotesMesh: THREE.InstancedMesh;
  private auraMotesMat: THREE.MeshBasicMaterial;
  private auraMotes: AuraMoteState[] = [];
  private auraStage: 0 | 1 | 2 | 3 = 0;
  private auraIntensity = 0;
  private auraPurpleMix = 0;

  // Pooled Giant JoJo Super Stand Hands (mounted in scene world space)
  private superHands: SuperHandSlot[] = [];
  // Pooled Per-Bug Spectral Clap Hand Pairs (for Lock-On Multi-Clap Barrage)
  private bugClapPairs: BugClapPairSlot[] = [];
  private callbacks: HandsRigCallbacks;

  private action: HandActionType = 'none';
  private actionElapsed = 0;
  private actionDuration = 0.34;
  private aimNdc = new THREE.Vector2(0, 0);
  private targetOffset = new THREE.Vector3(0, 0, 0);

  constructor(scene: THREE.Scene, callbacks: HandsRigCallbacks = {}) {
    this.callbacks = callbacks;

    const skinTex = createNaturalSkinTexture();
    this.skinMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: skinTex,
      roughness: 0.58,
      metalness: 0.02,
      sheen: 0.35,
      sheenRoughness: 0.65,
      sheenColor: new THREE.Color(0xffd5c2),
      clearcoat: 0.06,
      clearcoatRoughness: 0.6,
    });
    this.nailMat = new THREE.MeshPhysicalMaterial({
      color: 0xfce4d6,
      roughness: 0.24,
      metalness: 0.02,
      clearcoat: 0.65,
      clearcoatRoughness: 0.2,
    });
    this.equipBandMat = new THREE.MeshPhysicalMaterial({
      color: 0xfacc15,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.38,
      roughness: 0.24,
      metalness: 0.85,
    });
    this.standAuraMat = createStandAuraShaderMaterial();

    this.leftHand = this.createHandMesh(-1);
    this.rightHand = this.createHandMesh(1);
    this.root.add(this.leftHand.group, this.rightHand.group);

    // Rising shimmering Stand Aura motes orbiting both hands
    const moteGeo = new THREE.OctahedronGeometry(0.011, 0);
    moteGeo.scale(0.65, 1.8, 0.65);
    this.auraMotesMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.auraMotesMesh = new THREE.InstancedMesh(moteGeo, this.auraMotesMat, AURA_MOTE_COUNT);
    this.auraMotesMesh.frustumCulled = false;
    this.auraMotesMesh.visible = false;
    for (let i = 0; i < AURA_MOTE_COUNT; i++) {
      this.auraMotes.push({
        handIndex: i % 2 === 0 ? 0 : 1,
        angle: (i / AURA_MOTE_COUNT) * Math.PI * 2 + Math.random() * 0.5,
        heightOffset: Math.random(),
        radius: 0.065 + Math.random() * 0.095,
        speed: 1.2 + Math.random() * 1.1,
        scale: 0.6 + Math.random() * 0.85,
      });
    }
    this.root.add(this.auraMotesMesh);

    // Pooled Giant Stand Hands (up to 6 simultaneous descending floor-smash hands)
    this.buildSuperStandHandPool(scene, 6);
    // Pooled Per-Bug Spectral Clap Pairs (up to 14 locked bugs)
    this.buildBugClapPairPool(scene, 14);
  }

  public setStandAuraStage(stage: 0 | 1 | 2 | 3): void {
    this.auraStage = stage;
  }

  public applyEquipment(eq: SpecialEquipment | null): void {
    const showGear = !!eq;
    this.leftHand.equipBand.visible = showGear;
    this.rightHand.equipBand.visible = showGear;
    this.leftHand.equipCrests.forEach((m) => (m.visible = showGear));
    this.rightHand.equipCrests.forEach((m) => (m.visible = showGear));

    if (!eq) return;

    this.equipBandMat.color.set(eq.accentColor);
    this.equipBandMat.emissive.set(eq.accentColor);
    this.equipBandMat.emissiveIntensity = 0.65;
  }

  private buildNaturalFinger(
    baseRadius: number,
    totalLen: number,
    mat: THREE.Material,
    showNail = true,
    withAuraShell = false,
  ): ArticulatedFinger {
    const l1 = totalLen * 0.44;
    const l2 = totalLen * 0.31;
    const l3 = totalLen * 0.25;

    const rMid1 = baseRadius * 0.91;
    const rMid2 = baseRadius * 0.82;

    const proximal = new THREE.Group();
    const mcpJoint = new THREE.Mesh(new THREE.SphereGeometry(baseRadius * 1.02, 12, 10), mat);
    proximal.add(mcpJoint);

    const phal1Geo = createPhalanxLatheGeometry(baseRadius, rMid1, l1);
    const phal1 = new THREE.Mesh(phal1Geo, mat);
    phal1.castShadow = true;
    proximal.add(phal1);
    if (withAuraShell) {
      const aura1 = new THREE.Mesh(phal1Geo, this.standAuraMat);
      aura1.scale.set(1.18, 1.02, 1.18);
      proximal.add(aura1);
    }

    const middle = new THREE.Group();
    middle.position.y = l1;
    const pipJoint = new THREE.Mesh(new THREE.SphereGeometry(rMid1 * 0.98, 12, 10), mat);
    middle.add(pipJoint);

    const phal2Geo = createPhalanxLatheGeometry(rMid1, rMid2, l2);
    const phal2 = new THREE.Mesh(phal2Geo, mat);
    phal2.castShadow = true;
    middle.add(phal2);
    if (withAuraShell) {
      const aura2 = new THREE.Mesh(phal2Geo, this.standAuraMat);
      aura2.scale.set(1.2, 1.02, 1.2);
      middle.add(aura2);
    }
    proximal.add(middle);

    const distal = new THREE.Group();
    distal.position.y = l2;
    const dipJoint = new THREE.Mesh(new THREE.SphereGeometry(rMid2 * 0.98, 12, 10), mat);
    distal.add(dipJoint);

    const phal3Geo = createFingertipLatheGeometry(rMid2, l3);
    const phal3 = new THREE.Mesh(phal3Geo, mat);
    phal3.castShadow = true;
    distal.add(phal3);
    if (withAuraShell) {
      const aura3 = new THREE.Mesh(phal3Geo, this.standAuraMat);
      aura3.scale.set(1.22, 1.05, 1.22);
      distal.add(aura3);
    }

    if (showNail) {
      // Soft flush rounded almond fingernail on dorsal side (-Z)
      const nail = new THREE.Mesh(new THREE.SphereGeometry(rMid2 * 0.68, 10, 8), this.nailMat);
      nail.scale.set(0.92, 1.35, 0.22);
      nail.position.set(0, l3 * 0.56, -rMid2 * 0.66);
      distal.add(nail);
    }

    middle.add(distal);
    return { proximal, middle, distal };
  }

  private createHandMesh(side: -1 | 1): HandParts {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';

    // 1. Single seamless organic forearm + wrist + contoured palm + Stand Aura shell
    const armPalmGeo = createSeamlessArmPalmGeometry(side);
    const armPalm = new THREE.Mesh(armPalmGeo, this.skinMat);
    armPalm.castShadow = true;
    armPalm.receiveShadow = true;
    group.add(armPalm);

    const armPalmAura = new THREE.Mesh(armPalmGeo, this.standAuraMat);
    armPalmAura.scale.set(1.06, 1.01, 1.08);
    group.add(armPalmAura);

    // Minimalist Stand equipment wrist band + knuckle crest (only visible when SpecialEquipment is equipped)
    const equipBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.036, 0.0042, 8, 24),
      this.equipBandMat,
    );
    equipBand.scale.set(1.0, 0.66, 1.0);
    equipBand.position.set(-side * 0.002, -0.108, 0);
    equipBand.rotation.x = Math.PI / 2;
    equipBand.visible = false;
    group.add(equipBand);

    // 2. Four articulated natural fingers (thumb/index at side*X, pinky at -side*X)
    const fingers: ArticulatedFinger[] = [];
    const equipCrests: THREE.Mesh[] = [];
    const specs = [
      { x: side * 0.033, y: 0.064, len: 0.084, r: 0.0098, splay: -side * 0.075 }, // Index
      { x: side * 0.011, y: 0.068, len: 0.094, r: 0.0102, splay: -side * 0.018 }, // Middle
      { x: -side * 0.012, y: 0.063, len: 0.086, r: 0.0096, splay: side * 0.038 }, // Ring
      { x: -side * 0.034, y: 0.053, len: 0.069, r: 0.0084, splay: side * 0.11 }, // Pinky
    ];

    for (const spec of specs) {
      const finger = this.buildNaturalFinger(spec.r, spec.len, this.skinMat, true, true);
      finger.proximal.position.set(spec.x, spec.y, 0.001);
      finger.proximal.rotation.z = spec.splay;
      finger.proximal.rotation.x = 0.22;
      finger.middle.rotation.x = 0.26;
      finger.distal.rotation.x = 0.16;
      group.add(finger.proximal);
      fingers.push(finger);

      const crest = new THREE.Mesh(
        new THREE.SphereGeometry(spec.r * 0.62, 8, 8),
        this.equipBandMat,
      );
      crest.scale.set(1.1, 0.8, 0.45);
      crest.position.set(spec.x, spec.y - 0.006, -0.0115);
      crest.visible = false;
      group.add(crest);
      equipCrests.push(crest);
    }

    // 3. Natural opposable thumb on thumb-edge (side * 0.039)
    const thumb = this.buildNaturalFinger(0.0112, 0.066, this.skinMat, true, true);
    thumb.proximal.position.set(side * 0.038, -0.022, 0.009);
    thumb.proximal.rotation.set(0.32, side * 0.48, -side * 0.56);
    thumb.middle.rotation.x = 0.22;
    thumb.distal.rotation.x = 0.14;
    group.add(thumb.proximal);

    // Match the natural ready-to-clap posture from the reference image:
    // Left hand comfortably curled inward on the left, right hand gracefully poised upward-inward on the right
    const isLeft = side === -1;
    const restPos = isLeft
      ? new THREE.Vector3(-0.34, -0.26, -0.58)
      : new THREE.Vector3(0.35, -0.27, -0.58);
    const restRot = isLeft
      ? new THREE.Euler(0.34, 1.82, -0.22, 'YXZ')
      : new THREE.Euler(0.32, -1.86, 0.16, 'YXZ');
    const restCurls: [number, number, number, number] = isLeft
      ? [0.36, 0.42, 0.46, 0.48]
      : [0.14, 0.16, 0.21, 0.26];

    group.position.copy(restPos);
    group.rotation.copy(restRot);

    return { group, fingers, thumb, equipBand, equipCrests, restPos, restRot, restCurls };
  }

  private buildSpectralHandMesh(
    side: -1 | 1,
    bodyMat: THREE.Material,
    goldMat: THREE.Material,
    scaleScalar: number,
  ): THREE.Group {
    const hand = new THREE.Group();

    const armPalm = new THREE.Mesh(createSeamlessArmPalmGeometry(side), bodyMat);
    hand.add(armPalm);

    const cuffBand = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.006, 10, 26), goldMat);
    cuffBand.scale.set(1.02, 0.68, 1);
    cuffBand.position.set(-side * 0.002, -0.105, 0);
    cuffBand.rotation.x = Math.PI / 2;
    hand.add(cuffBand);

    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), goldMat);
    emblem.position.set(0, 0.006, -0.019);
    emblem.scale.set(1.05, 1.05, 0.4);
    hand.add(emblem);

    const fingerSpecs = [
      { x: side * 0.033, y: 0.064, len: 0.088, r: 0.0102, splay: -side * 0.085 },
      { x: side * 0.011, y: 0.068, len: 0.098, r: 0.0106, splay: -side * 0.02 },
      { x: -side * 0.012, y: 0.063, len: 0.09, r: 0.01, splay: side * 0.045 },
      { x: -side * 0.034, y: 0.053, len: 0.072, r: 0.0088, splay: side * 0.12 },
    ];
    for (const s of fingerSpecs) {
      const f = this.buildNaturalFinger(s.r, s.len, bodyMat, false);
      f.proximal.position.set(s.x, s.y, 0.001);
      f.proximal.rotation.z = s.splay;
      f.proximal.rotation.x = 0.08;
      f.middle.rotation.x = 0.1;
      const knucklePlate = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, 0.011), goldMat);
      knucklePlate.position.set(0, 0.004, -0.01);
      f.proximal.add(knucklePlate);
      hand.add(f.proximal);
    }

    const thumb = this.buildNaturalFinger(0.0115, 0.068, bodyMat, false);
    thumb.proximal.position.set(side * 0.038, -0.022, 0.009);
    thumb.proximal.rotation.set(0.22, side * 0.46, -side * 0.56);
    hand.add(thumb.proximal);

    hand.scale.setScalar(scaleScalar);
    return hand;
  }

  private buildSuperStandHandPool(scene: THREE.Scene, count: number): void {
    const auraGeo = new THREE.RingGeometry(0.58, 0.84, 32);
    for (let i = 0; i < count; i++) {
      const handMat = new THREE.MeshPhysicalMaterial({
        color: i % 2 === 0 ? 0xa855f7 : 0xec4899,
        emissive: i % 2 === 0 ? 0x7e22ce : 0xbe185d,
        emissiveIntensity: 0.92,
        roughness: 0.22,
        metalness: 0.28,
        clearcoat: 0.75,
        transparent: true,
        opacity: 0.92,
      });
      const goldMat = new THREE.MeshPhysicalMaterial({
        color: 0xfacc15,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.75,
        roughness: 0.18,
        metalness: 0.9,
        transparent: true,
        opacity: 0.95,
      });
      const auraMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xfacc15 : 0x38bdf8,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const group = new THREE.Group();
      const hand = this.buildSpectralHandMesh(i % 2 === 0 ? 1 : -1, handMat, goldMat, 5.4);
      // Orient palm (+Z) facing straight DOWN (-Y) toward the floor!
      hand.rotation.set(-Math.PI / 2, 0, 0);

      const auraRing = new THREE.Mesh(auraGeo, auraMat);
      auraRing.rotation.x = -Math.PI / 2;
      auraRing.position.y = -0.1;

      group.add(hand, auraRing);
      group.visible = false;
      scene.add(group);

      this.superHands.push({
        group,
        handMat,
        goldMat,
        auraMat,
        active: false,
        elapsed: 0,
        delay: 0,
        duration: 0.85,
        targetX: 0,
        targetZ: -1.2,
        baseScale: 1,
        yaw: 0,
        impactSpawned: false,
        handIndex: i,
        totalHands: count,
      });
    }
  }

  private buildBugClapPairPool(scene: THREE.Scene, count: number): void {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xd946ef,
        emissive: 0x9333ea,
        emissiveIntensity: 1.05,
        roughness: 0.2,
        metalness: 0.25,
        clearcoat: 0.7,
        transparent: true,
        opacity: 0.9,
      });
      const goldMat = new THREE.MeshPhysicalMaterial({
        color: 0xfacc15,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.85,
        roughness: 0.18,
        metalness: 0.9,
        transparent: true,
        opacity: 0.95,
      });

      const group = new THREE.Group();
      const leftHand = this.buildSpectralHandMesh(-1, mat, goldMat, 1.45);
      leftHand.rotation.order = 'YXZ';
      leftHand.rotation.set(0.18, Math.PI * 0.5, 0);

      const rightHand = this.buildSpectralHandMesh(1, mat, goldMat, 1.45);
      rightHand.rotation.order = 'YXZ';
      rightHand.rotation.set(0.18, -Math.PI * 0.5, 0);

      group.add(leftHand, rightHand);
      group.visible = false;
      scene.add(group);

      this.bugClapPairs.push({
        group,
        leftHand,
        rightHand,
        mat,
        goldMat,
        active: false,
        elapsed: 0,
        delay: 0,
        duration: 0.58,
        bugId: -1,
        worldPos: new THREE.Vector3(),
        clap1Fired: false,
        clap2Fired: false,
      });
    }
  }

  public triggerMultiSuperCombo(
    clapOrders: BugClapOrder[],
    floorOrders: FloorHandOrder[],
  ): void {
    // Schedule per-bug double-clap Stand pairs
    this.bugClapPairs.forEach((slot) => {
      slot.active = false;
      slot.group.visible = false;
    });
    const maxClaps = Math.min(clapOrders.length, this.bugClapPairs.length);
    for (let i = 0; i < maxClaps; i++) {
      const order = clapOrders[i];
      const slot = this.bugClapPairs[i];
      slot.active = true;
      slot.elapsed = 0;
      slot.delay = order.delay;
      slot.duration = 0.56;
      slot.bugId = order.bugId;
      slot.worldPos.copy(order.pos);
      slot.clap1Fired = false;
      slot.clap2Fired = false;
      slot.group.position.copy(order.pos);
      slot.group.visible = false;
      slot.mat.opacity = 0.92;
      slot.goldMat.opacity = 0.96;
    }

    // Schedule multiple descending Giant Stand Hands to smash the floor
    this.superHands.forEach((slot) => {
      slot.active = false;
      slot.group.visible = false;
    });
    const totalHands = Math.min(floorOrders.length, this.superHands.length);
    for (let j = 0; j < totalHands; j++) {
      const order = floorOrders[j];
      const slot = this.superHands[j];
      slot.active = true;
      slot.elapsed = 0;
      slot.delay = order.delay;
      slot.duration = 0.82;
      slot.targetX = THREE.MathUtils.clamp(order.targetX, -1.65, 1.65);
      slot.targetZ = THREE.MathUtils.clamp(order.targetZ, -2.05, -0.45);
      slot.baseScale = order.scale;
      slot.yaw = order.yaw;
      slot.impactSpawned = false;
      slot.handIndex = j;
      slot.totalHands = totalHands;
      slot.group.position.set(slot.targetX, 3.6, slot.targetZ);
      slot.group.rotation.set(0, slot.yaw, 0);
      slot.group.scale.setScalar(slot.baseScale);
      slot.group.visible = false;
      slot.handMat.opacity = 0.94;
      slot.goldMat.opacity = 0.95;
      slot.auraMat.opacity = 0.85;
    }
  }

  public triggerSuperFloorSmash(targetX: number, targetZ: number): void {
    this.triggerMultiSuperCombo([], [
      { targetX, targetZ, delay: 0, scale: 1.15, yaw: 0 },
    ]);
  }

  public triggerClap(aimNdcX: number, aimNdcY: number): void {
    this.action = 'clap';
    this.actionElapsed = 0;
    this.actionDuration = 0.34;
    this.aimNdc.set(aimNdcX, aimNdcY);
    this.targetOffset.set(
      THREE.MathUtils.clamp(aimNdcX * 0.34, -0.34, 0.34),
      THREE.MathUtils.clamp(aimNdcY * 0.24, -0.22, 0.26),
      0,
    );
  }

  public triggerSmash(side: 'left' | 'right', aimNdcX: number, aimNdcY: number): void {
    this.action = side === 'left' ? 'smash_left' : 'smash_right';
    this.actionElapsed = 0;
    this.actionDuration = 0.3;
    this.aimNdc.set(aimNdcX, aimNdcY);
    this.targetOffset.set(
      THREE.MathUtils.clamp(aimNdcX * 0.36, -0.38, 0.38),
      THREE.MathUtils.clamp(aimNdcY * 0.26, -0.22, 0.28),
      0,
    );
  }

  public update(dt: number, elapsed: number, aimNdcX: number, aimNdcY: number): void {
    const breathY = Math.sin(elapsed * 2.4) * 0.009;
    const idleTiltX = aimNdcY * 0.14;
    const idleShiftX = aimNdcX * 0.075;

    _lTargetPos.copy(this.leftHand.restPos);
    _lTargetPos.x += idleShiftX;
    _lTargetPos.y += breathY;

    _rTargetPos.copy(this.rightHand.restPos);
    _rTargetPos.x += idleShiftX;
    _rTargetPos.y += breathY;

    _lTargetRot.copy(this.leftHand.restRot);
    _lTargetRot.x += idleTiltX;
    _rTargetRot.copy(this.rightHand.restRot);
    _rTargetRot.x += idleTiltX;

    let overrideCurls: [number, number, number, number] | null = null;

    if (this.action !== 'none') {
      this.actionElapsed += dt;
      const p = Math.min(1, this.actionElapsed / this.actionDuration);

      if (this.action === 'clap') {
        const meetX = this.targetOffset.x;
        const meetY = this.targetOffset.y - 0.03;
        const meetZ = -0.66;

        if (p < 0.2) {
          const k = p / 0.2;
          _tmpVecA.set(meetX - 0.42, meetY, meetZ + 0.08);
          _tmpVecB.set(meetX + 0.42, meetY, meetZ + 0.08);
          _lTargetPos.lerp(_tmpVecA, k);
          _rTargetPos.lerp(_tmpVecB, k);
          _lTargetRot.set(0.22, 1.48, -0.06, 'YXZ');
          _rTargetRot.set(0.22, -1.48, 0.06, 'YXZ');
          overrideCurls = [0.06, 0.06, 0.08, 0.1];
        } else if (p < 0.45) {
          const k = Math.min(1, (p - 0.2) / 0.18);
          const ease = 1 - Math.pow(1 - k, 3);
          _tmpVecA.set(meetX - 0.42, meetY, meetZ + 0.08);
          _tmpVecB.set(meetX - 0.02, meetY, meetZ);
          _lTargetPos.lerpVectors(_tmpVecA, _tmpVecB, ease);

          _tmpVecA.set(meetX + 0.42, meetY, meetZ + 0.08);
          _tmpVecB.set(meetX + 0.02, meetY, meetZ);
          _rTargetPos.lerpVectors(_tmpVecA, _tmpVecB, ease);

          _lTargetRot.set(0.16, Math.PI * 0.5, 0, 'YXZ');
          _rTargetRot.set(0.16, -Math.PI * 0.5, 0, 'YXZ');
          overrideCurls = [0.04, 0.04, 0.05, 0.06];
        } else {
          const k = (p - 0.45) / 0.55;
          const ease = k * k * (3 - 2 * k);
          _tmpVecA.set(meetX - 0.02, meetY, meetZ);
          _lTargetPos.lerpVectors(_tmpVecA, _lTargetPos.clone(), ease);
          _tmpVecB.set(meetX + 0.02, meetY, meetZ);
          _rTargetPos.lerpVectors(_tmpVecB, _rTargetPos.clone(), ease);
          _lTargetRot.x = THREE.MathUtils.lerp(0.16, this.leftHand.restRot.x, ease);
          _lTargetRot.y = THREE.MathUtils.lerp(Math.PI * 0.5, this.leftHand.restRot.y, ease);
          _lTargetRot.z = THREE.MathUtils.lerp(0, this.leftHand.restRot.z, ease);
          _rTargetRot.x = THREE.MathUtils.lerp(0.16, this.rightHand.restRot.x, ease);
          _rTargetRot.y = THREE.MathUtils.lerp(-Math.PI * 0.5, this.rightHand.restRot.y, ease);
          _rTargetRot.z = THREE.MathUtils.lerp(0, this.rightHand.restRot.z, ease);
        }
      } else {
        const isLeft = this.action === 'smash_left';
        const smashPos = isLeft ? _lTargetPos : _rTargetPos;
        const smashRot = isLeft ? _lTargetRot : _rTargetRot;
        const sideSign = isLeft ? -1 : 1;
        const restR = isLeft ? this.leftHand.restRot : this.rightHand.restRot;

        const strikeX = this.targetOffset.x + sideSign * 0.035;
        const strikeY = this.targetOffset.y - 0.02;
        const strikeZ = -0.76;

        // With 'YXZ' order and Ry = -sideSign * 3.05 (~PI), palm (+Z) faces -Z forward toward bugs!
        const slamYaw = -sideSign * 3.04;

        if (p < 0.22) {
          const k = p / 0.22;
          _tmpVecA.set(sideSign * 0.44, 0.03, -0.46);
          smashPos.lerp(_tmpVecA, k);
          smashRot.set(-0.28, -sideSign * 2.5, sideSign * 0.14, 'YXZ');
          overrideCurls = [0.06, 0.06, 0.08, 0.1];
        } else if (p < 0.48) {
          const k = Math.min(1, (p - 0.22) / 0.16);
          const ease = 1 - Math.pow(1 - k, 3);
          _tmpVecA.set(sideSign * 0.44, 0.03, -0.46);
          _tmpVecB.set(strikeX, strikeY, strikeZ);
          smashPos.lerpVectors(_tmpVecA, _tmpVecB, ease);
          smashRot.set(
            THREE.MathUtils.lerp(-0.28, 0.92, ease),
            slamYaw,
            sideSign * 0.06,
            'YXZ',
          );
          overrideCurls = [0.03, 0.03, 0.04, 0.05];
        } else {
          const k = (p - 0.48) / 0.52;
          const ease = k * k * (3 - 2 * k);
          _tmpVecA.set(strikeX, strikeY, strikeZ);
          smashPos.lerpVectors(_tmpVecA, smashPos.clone(), ease);
          smashRot.set(
            THREE.MathUtils.lerp(0.92, restR.x, ease),
            THREE.MathUtils.lerp(slamYaw, restR.y, ease),
            THREE.MathUtils.lerp(sideSign * 0.06, restR.z, ease),
            'YXZ',
          );
        }
      }

      if (p >= 1) {
        this.action = 'none';
      }
    }

    const lerpRate = Math.min(1, dt * 28);
    this.leftHand.group.position.lerp(_lTargetPos, lerpRate);
    this.rightHand.group.position.lerp(_rTargetPos, lerpRate);

    this.leftHand.group.rotation.x = THREE.MathUtils.lerp(
      this.leftHand.group.rotation.x,
      _lTargetRot.x,
      lerpRate,
    );
    this.leftHand.group.rotation.y = THREE.MathUtils.lerp(
      this.leftHand.group.rotation.y,
      _lTargetRot.y,
      lerpRate,
    );
    this.leftHand.group.rotation.z = THREE.MathUtils.lerp(
      this.leftHand.group.rotation.z,
      _lTargetRot.z,
      lerpRate,
    );

    this.rightHand.group.rotation.x = THREE.MathUtils.lerp(
      this.rightHand.group.rotation.x,
      _rTargetRot.x,
      lerpRate,
    );
    this.rightHand.group.rotation.y = THREE.MathUtils.lerp(
      this.rightHand.group.rotation.y,
      _rTargetRot.y,
      lerpRate,
    );
    this.rightHand.group.rotation.z = THREE.MathUtils.lerp(
      this.rightHand.group.rotation.z,
      _rTargetRot.z,
      lerpRate,
    );

    for (let i = 0; i < 4; i++) {
      const lf = this.leftHand.fingers[i];
      const rf = this.rightHand.fingers[i];
      const lCurl = overrideCurls ? overrideCurls[i] : this.leftHand.restCurls[i];
      const rCurl = overrideCurls ? overrideCurls[i] : this.rightHand.restCurls[i];

      lf.proximal.rotation.x = THREE.MathUtils.lerp(lf.proximal.rotation.x, lCurl * 0.9, lerpRate);
      lf.middle.rotation.x = THREE.MathUtils.lerp(lf.middle.rotation.x, lCurl * 1.18, lerpRate);
      lf.distal.rotation.x = THREE.MathUtils.lerp(lf.distal.rotation.x, lCurl * 0.82, lerpRate);

      rf.proximal.rotation.x = THREE.MathUtils.lerp(rf.proximal.rotation.x, rCurl * 0.9, lerpRate);
      rf.middle.rotation.x = THREE.MathUtils.lerp(rf.middle.rotation.x, rCurl * 1.18, lerpRate);
      rf.distal.rotation.x = THREE.MathUtils.lerp(rf.distal.rotation.x, rCurl * 0.82, lerpRate);
    }

    // Update shimmering Stand Aura shader & rising Stand Aura Motes (Gold -> Purple at Step 3)
    const targetIntensity =
      this.auraStage === 3
        ? 1.35
        : this.auraStage === 2
          ? 1.05
          : this.auraStage === 1
            ? 0.68
            : 0;
    const targetPurpleMix = this.auraStage >= 2 ? 1.0 : 0.0;
    this.auraIntensity = THREE.MathUtils.damp(this.auraIntensity, targetIntensity, 8.5, dt);
    this.auraPurpleMix = THREE.MathUtils.damp(this.auraPurpleMix, targetPurpleMix, 9.5, dt);

    this.standAuraMat.uniforms.uTime.value = elapsed;
    this.standAuraMat.uniforms.uIntensity.value = this.auraIntensity;
    this.standAuraMat.uniforms.uColorPrimary.value
      .copy(_goldColorA)
      .lerp(_purpleColorA, this.auraPurpleMix);
    this.standAuraMat.uniforms.uColorSecondary.value
      .copy(_goldColorB)
      .lerp(_purpleColorB, this.auraPurpleMix);

    // Subtle Stand rim-sheen reflection on natural skin
    if (this.auraIntensity > 0.04) {
      const tintColor =
        this.auraPurpleMix > 0.5 ? _skinPurpleSheen : _skinGoldSheen;
      this.skinMat.sheenColor
        .copy(_skinNeutralSheen)
        .lerp(tintColor, Math.min(1, this.auraIntensity * 0.65));
      this.skinMat.sheen = 0.35 + this.auraIntensity * 0.45;
    } else {
      this.skinMat.sheenColor.copy(_skinNeutralSheen);
      this.skinMat.sheen = 0.35;
    }

    if (this.auraIntensity > 0.03) {
      this.auraMotesMesh.visible = true;
      this.auraMotesMat.opacity = Math.min(0.85, this.auraIntensity * 0.68);
      this.auraMotesMat.color
        .copy(_goldColorB)
        .lerp(_purpleColorB, this.auraPurpleMix);

      const speedBoost = 1 + this.auraPurpleMix * 0.95;
      for (let i = 0; i < AURA_MOTE_COUNT; i++) {
        const m = this.auraMotes[i];
        m.heightOffset = (m.heightOffset + dt * m.speed * speedBoost * 0.72) % 1;
        m.angle += dt * (2.4 + this.auraPurpleMix * 2.2);
        const handPos =
          m.handIndex === 0 ? this.leftHand.group.position : this.rightHand.group.position;
        const r = m.radius * (1 - m.heightOffset * 0.35);
        _auraDummy.position.set(
          handPos.x + Math.cos(m.angle) * r,
          handPos.y - 0.14 + m.heightOffset * 0.32,
          handPos.z + Math.sin(m.angle) * r,
        );
        _auraDummy.rotation.set(0, m.angle, 0);
        const lifeScale = Math.sin(m.heightOffset * Math.PI) * m.scale * (0.7 + this.auraIntensity * 0.45);
        _auraDummy.scale.setScalar(Math.max(0.01, lifeScale));
        _auraDummy.updateMatrix();
        this.auraMotesMesh.setMatrixAt(i, _auraDummy.matrix);
      }
      this.auraMotesMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.auraMotesMesh.visible = false;
    }

    // Update Per-Bug Spectral Stand Clap Pairs (Double-Clap Barrage on EACH locked bug)
    for (const pair of this.bugClapPairs) {
      if (!pair.active) continue;
      pair.elapsed += dt;
      if (pair.elapsed < pair.delay) continue;

      if (!pair.group.visible) {
        pair.group.visible = true;
      }

      const localTime = pair.elapsed - pair.delay;
      const t = Math.min(1, localTime / pair.duration);

      // Motion curve: open wide -> SNAP Clap 1 (t=0.32) -> rebound open -> SNAP Clap 2 (t=0.68) -> fade
      let sep = 0.28;
      if (t < 0.18) {
        const k = t / 0.18;
        sep = THREE.MathUtils.lerp(0.42, 0.3, k);
      } else if (t < 0.34) {
        const k = (t - 0.18) / 0.16;
        sep = THREE.MathUtils.lerp(0.3, 0.02, k * k * k);
      } else if (t < 0.52) {
        if (!pair.clap1Fired) {
          pair.clap1Fired = true;
          this.callbacks.onBugClapPulse?.(pair.bugId, pair.worldPos, 1);
        }
        const k = (t - 0.34) / 0.18;
        sep = THREE.MathUtils.lerp(0.02, 0.25, Math.sin(k * Math.PI * 0.5));
      } else if (t < 0.68) {
        const k = (t - 0.52) / 0.16;
        sep = THREE.MathUtils.lerp(0.25, 0.015, k * k * k);
      } else {
        if (!pair.clap2Fired) {
          pair.clap2Fired = true;
          this.callbacks.onBugClapPulse?.(pair.bugId, pair.worldPos, 2);
        }
        sep = 0.018;
        const fade = (t - 0.68) / 0.32;
        const alpha = Math.max(0, 1 - fade * 1.15);
        pair.mat.opacity = 0.92 * alpha;
        pair.goldMat.opacity = 0.96 * alpha;
      }

      pair.leftHand.position.set(-sep, -0.02, 0);
      pair.rightHand.position.set(sep, -0.02, 0);

      if (t >= 1) {
        pair.active = false;
        pair.group.visible = false;
      }
    }

    // Update Multiple Descending JoJo Super Stand Hands Floor Smash sequence
    for (const slot of this.superHands) {
      if (!slot.active) continue;
      slot.elapsed += dt;
      if (slot.elapsed < slot.delay) continue;

      if (!slot.group.visible) {
        slot.group.visible = true;
      }

      const localTime = slot.elapsed - slot.delay;
      const t = Math.min(1, localTime / slot.duration);

      if (t < 0.14) {
        const k = t / 0.14;
        slot.group.position.set(
          slot.targetX,
          THREE.MathUtils.lerp(3.6, 2.55, k),
          slot.targetZ,
        );
        slot.group.scale.setScalar(slot.baseScale * (0.85 + k * 0.22));
      } else if (t < 0.28) {
        const k = (t - 0.14) / 0.14;
        const slamY = THREE.MathUtils.lerp(2.55, -0.58, k * k * k);
        slot.group.position.set(slot.targetX, slamY, slot.targetZ);
        slot.group.scale.setScalar(slot.baseScale * 1.08);
      } else {
        if (!slot.impactSpawned) {
          slot.impactSpawned = true;
          slot.group.position.set(slot.targetX, -0.58, slot.targetZ);
          _tmpVecA.set(slot.targetX, -0.68, slot.targetZ);
          this.callbacks.onSuperFloorImpact?.(_tmpVecA, slot.handIndex, slot.totalHands);
        }
        const fade = (t - 0.28) / 0.72;
        const bounce = fade < 0.18 ? Math.sin((fade / 0.18) * Math.PI) * 0.08 : 0;
        slot.group.position.set(slot.targetX, -0.58 + bounce, slot.targetZ);
        const alpha = Math.max(0, 1 - fade * 1.12);
        slot.handMat.opacity = 0.92 * alpha;
        slot.goldMat.opacity = 0.95 * alpha;
        slot.auraMat.opacity = 0.8 * alpha;
      }

      if (t >= 1) {
        slot.active = false;
        slot.group.visible = false;
      }
    }
  }
}
