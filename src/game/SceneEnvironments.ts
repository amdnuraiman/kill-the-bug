import * as THREE from 'three';
import { attachInkOutline, getAnimeToonGradientMap } from './AnimeStyle';

export type BackgroundLocation = 'room' | 'balcony' | 'toilet';

export interface LocationOption {
  id: BackgroundLocation;
  label: string;
  subtitle: string;
}

export const BACKGROUND_LOCATIONS: LocationOption[] = [
  { id: 'room', label: 'Study Room', subtitle: 'Cozy JoJo desk' },
  { id: 'balcony', label: 'Midnight Balcony', subtitle: 'Moonlit skyline' },
  { id: 'toilet', label: 'Toilet Break', subtitle: 'Seated ceramic stall' },
];

function createAnimeWoodTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#7c4a2d';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 70; i++) {
    const y = Math.random() * 512;
    const h = 2 + Math.random() * 5;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(28, 14, 18, 0.22)' : 'rgba(217, 140, 82, 0.16)';
    ctx.fillRect(0, y, 512, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createStoneTileTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 512, 512);

  const size = 128;
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const shade = 26 + ((gx + gy * 3) % 4) * 5;
      ctx.fillStyle = `rgb(${shade}, ${shade + 9}, ${shade + 22})`;
      ctx.fillRect(gx * size + 3, gy * size + 3, size - 6, size - 6);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSkyscraperWindowTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#070b1a';
  ctx.fillRect(0, 0, 256, 512);

  const cols = 8;
  const rows = 20;
  const cw = 256 / cols;
  const rh = 512 / rows;
  const palette = ['#38bdf8', '#facc15', '#f472b6', '#bae6fd'];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.42) {
        ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
        ctx.fillRect(c * cw + 6, r * rh + 6, cw - 12, rh - 11);
      } else {
        ctx.fillStyle = 'rgba(30, 41, 59, 0.45)';
        ctx.fillRect(c * cw + 6, r * rh + 6, cw - 12, rh - 11);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createBathroomTileTexture(
  maxAnisotropy: number,
  baseHex: string,
  groutHex: string,
  cells: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = groutHex;
  ctx.fillRect(0, 0, 512, 512);

  const step = 512 / cells;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const tint = (r * 7 + c * 11) % 3;
      ctx.fillStyle = baseHex;
      ctx.fillRect(c * step + 3, r * step + 3, step - 6, step - 6);
      if (tint === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(c * step + 3, r * step + 3, step - 6, step - 6);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(9, 6, 18, 0.65)');
  grad.addColorStop(0.65, 'rgba(9, 6, 18, 0.25)');
  grad.addColorStop(1, 'rgba(9, 6, 18, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createToiletSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#090612';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 240, 112);
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OCCUPIED', 128, 60);
  ctx.fillStyle = '#f43f5e';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('ゴゴゴゴ', 128, 98);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SceneEnvironments {
  public readonly root = new THREE.Group();
  private scene: THREE.Scene;
  private isSoftwareGl: boolean;
  private shadowTex: THREE.CanvasTexture;
  private maxAniso: number;

  private roomGroup = new THREE.Group();
  private balconyGroup = new THREE.Group();
  private toiletGroup = new THREE.Group();

  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private accentPointLight: THREE.PointLight;

  private starField: THREE.Points | null = null;
  private stinkWisps: THREE.Mesh[] = [];
  private fanHead: THREE.Group | null = null;
  private fanRotor: THREE.Group | null = null;
  private pipeBurstGlow: THREE.Mesh | null = null;
  private activeLocation: BackgroundLocation = 'room';

  constructor(scene: THREE.Scene, maxAniso: number, isSoftwareGl: boolean) {
    this.scene = scene;
    this.maxAniso = maxAniso;
    this.isSoftwareGl = isSoftwareGl;
    this.shadowTex = createContactShadowTexture();

    // Shared 3-point + accent studio lighting rig (re-tuned per location)
    this.hemiLight = new THREE.HemisphereLight(0xd8b4fe, 0x2e1740, 1.05);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfef08a, 1.75);
    this.keyLight.position.set(3.2, 2.8, 1.4);
    this.keyLight.castShadow = !isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 14;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0xd946ef, 0.9);
    this.rimLight.position.set(-3.2, 2.4, -2.5);
    this.scene.add(this.rimLight);

    this.accentPointLight = new THREE.PointLight(0xfbbf24, 2.8, 6.8, 1.5);
    this.accentPointLight.position.set(-1.32, 0.28, -1.65);
    this.accentPointLight.castShadow = !isSoftwareGl;
    this.scene.add(this.accentPointLight);

    this.buildStudyRoom();
    this.buildMidnightBalcony();
    this.buildToiletStall();

    this.root.add(this.roomGroup, this.balconyGroup, this.toiletGroup);
    this.scene.add(this.root);

    this.setLocation('room');
  }

  private addContactShadow(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    radius: number,
  ): void {
    const mat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.52,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, y, z);
    parent.add(plane);
  }

  private buildStudyRoom(): void {
    const gradientMap = getAnimeToonGradientMap();
    const woodTex = createAnimeWoodTexture(this.maxAniso);
    const deskMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.62,
      metalness: 0.08,
    });
    const wallMat = new THREE.MeshToonMaterial({ color: 0x362052, gradientMap });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x1e1330,
      roughness: 0.45,
      metalness: 0.25,
    });

    // Desk top at y = -0.71
    const desk = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.14, 2.8), deskMat);
    desk.position.set(0, -0.78, -1.4);
    desk.receiveShadow = true;
    attachInkOutline(desk, 1.012);
    this.roomGroup.add(desk);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshToonMaterial({ color: 0x1c102e, gradientMap }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.6;
    floor.receiveShadow = true;
    this.roomGroup.add(floor);

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(11, 6.5), wallMat);
    backWall.position.set(0, 1.1, -2.92);
    backWall.receiveShadow = true;
    this.roomGroup.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 6.5), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-2.78, 1.1, 0);
    leftWall.receiveShadow = true;
    this.roomGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 6.5), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(2.78, 1.1, 0);
    rightWall.receiveShadow = true;
    this.roomGroup.add(rightWall);

    // Rainy twilight window frame + pane
    const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.55, 1.8), trimMat);
    windowFrame.position.set(2.72, 0.65, -1.05);
    this.roomGroup.add(windowFrame);

    const windowPane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.64, 1.38),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6 }),
    );
    windowPane.rotation.y = -Math.PI / 2;
    windowPane.position.set(2.67, 0.65, -1.05);
    this.roomGroup.add(windowPane);

    // Framed JoJo poster
    const frameOuter = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.92, 0.05), trimMat);
    frameOuter.position.set(0.15, 0.72, -2.88);
    frameOuter.castShadow = true;
    attachInkOutline(frameOuter, 1.03);
    this.roomGroup.add(frameOuter);

    const artCanvas = new THREE.Mesh(
      new THREE.PlaneGeometry(1.08, 0.76),
      new THREE.MeshToonMaterial({ color: 0xfde047, gradientMap }),
    );
    artCanvas.position.set(0.15, 0.72, -2.845);
    this.roomGroup.add(artCanvas);

    // Composite grounded Desk Lamp (-1.32, -0.71, -1.65)
    const lampGroup = new THREE.Group();
    lampGroup.position.set(-1.32, -0.71, -1.65);
    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 0.06, 18),
      new THREE.MeshStandardMaterial({ color: 0x4338ca, roughness: 0.3, metalness: 0.65 }),
    );
    lampBase.position.y = 0.03;
    lampBase.castShadow = true;
    attachInkOutline(lampBase, 1.05);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 10), trimMat);
    lampStem.position.y = 0.455;
    const lampShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.28, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, side: THREE.DoubleSide }),
    );
    lampShade.position.y = 0.95;
    attachInkOutline(lampShade, 1.05);
    const lampBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    lampBulb.position.y = 0.88;
    lampGroup.add(lampBase, lampStem, lampShade, lampBulb);
    this.roomGroup.add(lampGroup);
    this.addContactShadow(this.roomGroup, -1.32, -0.708, -1.65, 0.24);

    // Composite Ceramic Mug (0.68, -0.71, -1.18)
    const mugGroup = new THREE.Group();
    mugGroup.position.set(0.68, -0.71, -1.18);
    const mugBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.09, 0.22, 18),
      new THREE.MeshPhysicalMaterial({ color: 0xec4899, roughness: 0.22, clearcoat: 0.8 }),
    );
    mugBody.position.y = 0.11;
    mugBody.castShadow = true;
    attachInkOutline(mugBody, 1.05);
    const mugHandle = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.015, 8, 16, Math.PI),
      new THREE.MeshPhysicalMaterial({ color: 0xec4899, roughness: 0.22, clearcoat: 0.8 }),
    );
    mugHandle.rotation.z = -Math.PI / 2;
    mugHandle.position.set(0.095, 0.11, 0);
    const coffee = new THREE.Mesh(
      new THREE.CircleGeometry(0.085, 16),
      new THREE.MeshStandardMaterial({ color: 0x29150b, roughness: 0.15 }),
    );
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = 0.205;
    mugGroup.add(mugBody, mugHandle, coffee);
    this.roomGroup.add(mugGroup);
    this.addContactShadow(this.roomGroup, 0.68, -0.708, -1.18, 0.15);

    // Composite Manga Volumes (1.22, -0.71, -1.55)
    const mangaGroup = new THREE.Group();
    mangaGroup.position.set(1.22, -0.71, -1.55);
    const book1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.08, 0.34),
      new THREE.MeshToonMaterial({ color: 0x38bdf8, gradientMap }),
    );
    book1.position.y = 0.04;
    book1.rotation.y = -0.18;
    book1.castShadow = true;
    attachInkOutline(book1, 1.05);
    const book2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.07, 0.3),
      new THREE.MeshToonMaterial({ color: 0xa3e635, gradientMap }),
    );
    book2.position.set(-0.02, 0.115, 0.01);
    book2.rotation.y = 0.12;
    book2.castShadow = true;
    attachInkOutline(book2, 1.05);
    mangaGroup.add(book1, book2);
    this.roomGroup.add(mangaGroup);
    this.addContactShadow(this.roomGroup, 1.22, -0.708, -1.55, 0.32);

    // Composite Potted Plant (-0.62, -0.71, -1.78)
    const plantGroup = new THREE.Group();
    plantGroup.position.set(-0.62, -0.71, -1.78);
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.08, 0.18, 16),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.72 }),
    );
    pot.position.y = 0.09;
    pot.castShadow = true;
    attachInkOutline(pot, 1.05);
    const soil = new THREE.Mesh(
      new THREE.CircleGeometry(0.095, 14),
      new THREE.MeshStandardMaterial({ color: 0x3f2718, roughness: 0.95 }),
    );
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.178;
    plantGroup.add(pot, soil);
    const plantMat = new THREE.MeshPhysicalMaterial({
      color: 0x22c55e,
      roughness: 0.42,
      clearcoat: 0.25,
    });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 7), plantMat);
      const ang = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(ang) * 0.05, 0.24, Math.sin(ang) * 0.05);
      leaf.rotation.z = -Math.cos(ang) * 0.55;
      leaf.rotation.x = Math.sin(ang) * 0.55;
      attachInkOutline(leaf, 1.06);
      plantGroup.add(leaf);
    }
    this.roomGroup.add(plantGroup);
    this.addContactShadow(this.roomGroup, -0.62, -0.708, -1.78, 0.16);

    // Composite Oscillating Desk Fan on right corner of desk (1.46, -0.71, -0.94)
    const fanGroup = new THREE.Group();
    fanGroup.position.set(1.46, -0.71, -0.94);
    const fanMetalMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.28,
      metalness: 0.72,
    });
    const fanCageMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.22,
      metalness: 0.85,
    });
    const fanBase = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.04, 18), fanMetalMat);
    fanBase.position.y = 0.02;
    fanBase.castShadow = true;
    attachInkOutline(fanBase, 1.04);
    const fanNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, 0.24, 12), fanCageMat);
    fanNeck.position.y = 0.15;

    const fanHead = new THREE.Group();
    fanHead.position.set(0, 0.3, 0);
    fanHead.rotation.y = -0.58; // Aimed across the study desk toward player/center
    const motorPod = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 14), fanMetalMat);
    motorPod.rotation.x = Math.PI / 2;
    motorPod.position.z = -0.04;
    const cageRim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.012, 8, 28), fanCageMat);
    cageRim.position.z = 0.05;
    attachInkOutline(cageRim, 1.04);
    const cageInner = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.007, 6, 20), fanCageMat);
    cageInner.position.z = 0.055;

    const fanRotor = new THREE.Group();
    fanRotor.position.z = 0.045;
    const rotorHub = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 12), fanMetalMat);
    rotorHub.rotation.x = Math.PI / 2;
    fanRotor.add(rotorHub);
    const bladeMat = new THREE.MeshPhysicalMaterial({
      color: 0x0ea5e9,
      roughness: 0.25,
      clearcoat: 0.7,
      side: THREE.DoubleSide,
    });
    for (let b = 0; b < 4; b++) {
      const bladePivot = new THREE.Group();
      bladePivot.rotation.z = (b / 4) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.16, 0.008), bladeMat);
      blade.position.y = 0.1;
      blade.rotation.y = 0.38;
      bladePivot.add(blade);
      fanRotor.add(bladePivot);
    }

    fanHead.add(motorPod, cageRim, cageInner, fanRotor);
    fanGroup.add(fanBase, fanNeck, fanHead);
    this.roomGroup.add(fanGroup);
    this.addContactShadow(this.roomGroup, 1.46, -0.708, -0.94, 0.22);
    this.fanHead = fanHead;
    this.fanRotor = fanRotor;

    // Mosquito Coil / Incense Smoke Dish on desk (0.28, -0.71, -1.06)
    const coilGroup = new THREE.Group();
    coilGroup.position.set(0.28, -0.71, -1.06);
    const tray = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.085, 0.024, 18),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.55 }),
    );
    tray.position.y = 0.012;
    attachInkOutline(tray, 1.05);
    const coilRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.009, 6, 22, Math.PI * 1.65),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85 }),
    );
    coilRing.rotation.x = Math.PI / 2;
    coilRing.position.y = 0.032;
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xf97316 }),
    );
    ember.position.set(0.052, 0.033, 0.012);
    coilGroup.add(tray, coilRing, ember);
    this.roomGroup.add(coilGroup);
    this.addContactShadow(this.roomGroup, 0.28, -0.708, -1.06, 0.14);
  }

  private buildMidnightBalcony(): void {
    const stoneTex = createStoneTileTexture(this.maxAniso);
    const balconyFloorMat = new THREE.MeshPhysicalMaterial({
      map: stoneTex,
      roughness: 0.34,
      metalness: 0.1,
      clearcoat: 0.48,
      clearcoatRoughness: 0.25,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.22,
      metalness: 0.88,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.22,
      roughness: 0.08,
      metalness: 0.05,
      clearcoat: 0.9,
    });

    // Balcony Terrace Slab (top surface at y = -0.71)
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.14, 3.8), balconyFloorMat);
    terrace.position.set(0, -0.78, -0.1);
    terrace.receiveShadow = true;
    attachInkOutline(terrace, 1.008);
    this.balconyGroup.add(terrace);

    // Concrete curb along front edge z = -1.96
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(6.2, 0.12, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78 }),
    );
    curb.position.set(0, -0.65, -1.95);
    curb.receiveShadow = true;
    this.balconyGroup.add(curb);

    // Stainless Steel Handrail + Safety Glass Barrier at z = -1.95
    const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 6.2, 12), steelMat);
    topRail.rotation.z = Math.PI / 2;
    topRail.position.set(0, 0.12, -1.95);
    attachInkOutline(topRail, 1.04);
    this.balconyGroup.add(topRail);

    const glassPanel = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 0.7), glassMat);
    glassPanel.position.set(0, -0.25, -1.95);
    this.balconyGroup.add(glassPanel);

    for (let x = -2.8; x <= 2.81; x += 1.4) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.82, 10), steelMat);
      post.position.set(x, -0.29, -1.95);
      post.castShadow = true;
      this.balconyGroup.add(post);
    }

    // Side balcony parapet walls left/right (open horizon to the front!)
    const sideRailL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 10), steelMat);
    sideRailL.rotation.x = Math.PI / 2;
    sideRailL.position.set(-2.9, 0.12, -0.15);
    const sideRailR = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 10), steelMat);
    sideRailR.rotation.x = Math.PI / 2;
    sideRailR.position.set(2.9, 0.12, -0.15);
    this.balconyGroup.add(sideRailL, sideRailR);

    // Bistro Table + Warm Amber Lantern on left balcony (-1.28, -0.71, -1.35)
    const tableGroup = new THREE.Group();
    tableGroup.position.set(-1.28, -0.71, -1.35);
    const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.22, 0.04, 16), steelMat);
    tableBase.position.y = 0.02;
    const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.56, 12), steelMat);
    tableLeg.position.y = 0.3;
    const tableTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.45 }),
    );
    tableTop.position.y = 0.59;
    tableTop.castShadow = true;
    attachInkOutline(tableTop, 1.03);

    // Lantern sitting on bistro table
    const lanternFrame = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.09, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.75 }),
    );
    lanternFrame.position.set(-0.08, 0.72, 0.02);
    const lanternCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.06, 0.15, 10),
      new THREE.MeshBasicMaterial({ color: 0xfde047 }),
    );
    lanternCore.position.set(-0.08, 0.72, 0.02);
    const lanternCap = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 }),
    );
    lanternCap.position.set(-0.08, 0.87, 0.02);
    tableGroup.add(tableBase, tableLeg, tableTop, lanternFrame, lanternCore, lanternCap);
    this.balconyGroup.add(tableGroup);
    this.addContactShadow(this.balconyGroup, -1.28, -0.708, -1.35, 0.32);

    // Balcony Potted Palm / Fern on right (1.42, -0.71, -1.48)
    const planterGroup = new THREE.Group();
    planterGroup.position.set(1.42, -0.71, -1.48);
    const planterPot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.14, 0.28, 16),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65 }),
    );
    planterPot.position.y = 0.14;
    planterPot.castShadow = true;
    attachInkOutline(planterPot, 1.04);
    planterGroup.add(planterPot);
    const fernMat = new THREE.MeshPhysicalMaterial({
      color: 0x15803d,
      roughness: 0.45,
      clearcoat: 0.2,
    });
    for (let i = 0; i < 8; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 6), fernMat);
      const ang = (i / 8) * Math.PI * 2;
      frond.position.set(Math.cos(ang) * 0.08, 0.36, Math.sin(ang) * 0.08);
      frond.rotation.z = -Math.cos(ang) * 0.65;
      frond.rotation.x = Math.sin(ang) * 0.65;
      attachInkOutline(frond, 1.05);
      planterGroup.add(frond);
    }
    this.balconyGroup.add(planterGroup);
    this.addContactShadow(this.balconyGroup, 1.42, -0.708, -1.48, 0.24);

    // Full Glowing Midnight Moon + Halo high in sky
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.68, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xfef9c3 }),
    );
    moon.position.set(-2.6, 3.2, -13.5);
    const moonHalo = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 24),
      new THREE.MeshBasicMaterial({
        color: 0x60a5fa,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    moonHalo.position.set(-2.6, 3.2, -13.6);
    this.balconyGroup.add(moon, moonHalo);

    // Starfield Points in midnight sky
    const starPositions = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 26;
      starPositions[i * 3 + 1] = 1.2 + Math.random() * 9;
      starPositions[i * 3 + 2] = -10 - Math.random() * 12;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.starField = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xe0f2fe, size: 0.08, transparent: true, opacity: 0.85 }),
    );
    this.balconyGroup.add(this.starField);

    // Distant Neon Midnight City Skyline (spread beyond horizon)
    const winTex = createSkyscraperWindowTexture(this.maxAniso);
    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0x090d1f,
      emissive: 0xffffff,
      emissiveMap: winTex,
      emissiveIntensity: 0.72,
      roughness: 0.5,
      metalness: 0.25,
    });
    const silhouetteMat = new THREE.MeshStandardMaterial({
      color: 0x050814,
      roughness: 0.85,
    });

    for (let i = 0; i < 18; i++) {
      const w = 1.1 + (i % 4) * 0.45;
      const h = 4.2 + ((i * 3) % 7) * 1.15;
      const d = 1.1 + (i % 3) * 0.35;
      const x = -11.5 + i * 1.35 + ((i % 2) - 0.5) * 0.4;
      const z = -9.5 - (i % 3) * 2.4;
      const bldg = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        i % 3 === 0 ? silhouetteMat : bldgMat,
      );
      bldg.position.set(x, h * 0.5 - 4.2, z);
      this.balconyGroup.add(bldg);

      // Aviation beacon light on tall towers
      if (i % 4 === 1) {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xf43f5e }),
        );
        beacon.position.set(x, h - 4.1, z);
        this.balconyGroup.add(beacon);
      }
    }
  }

  private buildToiletStall(): void {
    const wallTileTex = createBathroomTileTexture(this.maxAniso, '#e2e8f0', '#64748b', 6);
    const floorTileTex = createBathroomTileTexture(this.maxAniso, '#1e293b', '#0f172a', 5);

    const wallMat = new THREE.MeshPhysicalMaterial({
      map: wallTileTex,
      roughness: 0.24,
      metalness: 0.05,
      clearcoat: 0.6,
    });
    const floorMat = new THREE.MeshPhysicalMaterial({
      map: floorTileTex,
      roughness: 0.32,
      metalness: 0.08,
      clearcoat: 0.45,
    });
    const porcelainMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.14,
      metalness: 0.04,
      clearcoat: 0.92,
      clearcoatRoughness: 0.1,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.14,
      metalness: 0.94,
    });

    // Tiled Bathroom Floor at y = -0.72 (compatible with Super Stand Floor Slam!)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 4.8), floorMat);
    floor.position.set(0, -0.79, -0.4);
    floor.receiveShadow = true;
    this.toiletGroup.add(floor);

    // Bath mat right in front of the seated toilet
    const bathMat = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.025, 0.75),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.92 }),
    );
    bathMat.position.set(0, -0.708, -0.82);
    bathMat.receiveShadow = true;
    attachInkOutline(bathMat, 1.03);
    this.toiletGroup.add(bathMat);

    // Tiled Bathroom Walls + Ceiling
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.6), wallMat);
    backWall.position.set(0, 0.85, -2.55);
    backWall.receiveShadow = true;

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 3.6), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-2.05, 0.85, -0.1);
    leftWall.receiveShadow = true;

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 3.6), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(2.05, 0.85, -0.1);
    rightWall.receiveShadow = true;

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 5.0),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 2.35, -0.1);
    this.toiletGroup.add(backWall, leftWall, rightWall, ceiling);

    // Overhead Fluorescent Tube Fixture
    const fixtureBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.06, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xf0fdf4 }),
    );
    fixtureBar.position.set(0.4, 2.26, -1.8);
    this.toiletGroup.add(fixtureBar);

    // Bathroom Door ahead-left (-0.72, 0.35, -2.5)
    const doorGroup = new THREE.Group();
    doorGroup.position.set(-0.72, 0.35, -2.5);
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(1.18, 2.12, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.2 }),
    );
    attachInkOutline(doorPanel, 1.02);
    const doorHandle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.032, 0.08), chromeMat);
    doorHandle.position.set(0.42, -0.05, 0.06);
    const doorVent = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.28, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 }),
    );
    doorVent.position.set(0, -0.72, 0.01);
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.24),
      new THREE.MeshBasicMaterial({ map: createToiletSignTexture() }),
    );
    signBoard.position.set(0, 0.42, 0.045);
    doorGroup.add(doorPanel, doorHandle, doorVent, signBoard);
    this.toiletGroup.add(doorGroup);

    // Ceramic Vanity Sink + Mirror ahead-right (0.95, 0.0, -2.28)
    const sinkGroup = new THREE.Group();
    sinkGroup.position.set(0.95, -0.71, -2.25);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.72, 16), porcelainMat);
    pedestal.position.y = 0.36;
    pedestal.castShadow = true;
    const basin = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.16, 0.52), porcelainMat);
    basin.position.y = 0.78;
    basin.castShadow = true;
    attachInkOutline(basin, 1.03);
    const faucetStem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.18, 10), chromeMat);
    faucetStem.position.set(0, 0.94, -0.16);
    const faucetSpout = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.15), chromeMat);
    faucetSpout.position.set(0, 1.02, -0.1);
    const soapBottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.055, 0.16, 12),
      new THREE.MeshPhysicalMaterial({ color: 0x10b981, roughness: 0.25, clearcoat: 0.7 }),
    );
    soapBottle.position.set(-0.26, 0.94, -0.12);

    const mirrorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.88, 1.05, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35 }),
    );
    mirrorFrame.position.set(0, 1.56, -0.24);
    const mirrorGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.76, 0.92),
      new THREE.MeshPhysicalMaterial({
        color: 0xbae6fd,
        metalness: 0.88,
        roughness: 0.08,
        clearcoat: 1.0,
      }),
    );
    mirrorGlass.position.set(0, 1.56, -0.21);

    sinkGroup.add(pedestal, basin, faucetStem, faucetSpout, soapBottle, mirrorFrame, mirrorGlass);
    this.toiletGroup.add(sinkGroup);
    this.addContactShadow(this.toiletGroup, 0.95, -0.708, -2.25, 0.32);

    // Wall-mounted Toilet Paper Dispenser on right wall (1.88, -0.05, -0.98)
    const tpGroup = new THREE.Group();
    tpGroup.position.set(1.88, -0.05, -0.98);
    const tpMount = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.24), chromeMat);
    const tpRoll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.18, 18),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.85 }),
    );
    tpRoll.rotation.z = Math.PI / 2;
    tpRoll.position.set(-0.1, -0.02, 0);
    attachInkOutline(tpRoll, 1.05);
    const tpSheet = new THREE.Mesh(
      new THREE.PlaneGeometry(0.17, 0.36),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9, side: THREE.DoubleSide }),
    );
    tpSheet.position.set(-0.2, -0.18, 0.04);
    tpSheet.rotation.y = Math.PI / 2;
    tpSheet.rotation.x = 0.08;
    tpGroup.add(tpMount, tpRoll, tpSheet);
    this.toiletGroup.add(tpGroup);

    // Small Bathroom Trash Can near front-left (-1.45, -0.71, -1.75)
    const bin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.13, 0.36, 16),
      chromeMat,
    );
    bin.position.set(-1.45, -0.53, -1.75);
    bin.castShadow = true;
    attachInkOutline(bin, 1.04);
    this.toiletGroup.add(bin);
    this.addContactShadow(this.toiletGroup, -1.45, -0.708, -1.75, 0.2);

    // Frosted Night Exhaust Window on left wall (-2.01, 0.78, -1.35)
    const ventFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.65, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 }),
    );
    ventFrame.position.set(-2.01, 0.78, -1.35);
    const ventGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.84, 0.54),
      new THREE.MeshBasicMaterial({ color: 0x1d4ed8 }),
    );
    ventGlass.rotation.y = Math.PI / 2;
    ventGlass.position.set(-1.96, 0.78, -1.35);
    this.toiletGroup.add(ventFrame, ventGlass);

    // First-person Seated Toilet Rim + Dropped Shorts + Knees (framed cleanly at bottom edge)
    const seatRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.29, 0.052, 14, 28, Math.PI * 1.15),
      porcelainMat,
    );
    seatRim.rotation.x = Math.PI / 2;
    seatRim.rotation.z = -Math.PI * 0.075;
    seatRim.position.set(0, -0.46, 0.18);
    attachInkOutline(seatRim, 1.04);
    this.toiletGroup.add(seatRim);

    const shortsMat = new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.85 });
    const legSkinMat = new THREE.MeshPhysicalMaterial({ color: 0xf1bfa2, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 6, 12), shortsMat);
      thigh.rotation.x = Math.PI / 2 - 0.12;
      thigh.rotation.z = -side * 0.15;
      thigh.position.set(side * 0.24, -0.31, 0.36);
      this.toiletGroup.add(thigh);

      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.088, 12, 10), legSkinMat);
      knee.position.set(side * 0.29, -0.35, 0.06);
      this.toiletGroup.add(knee);
    }

    // Subtle rising JoJo cartoon steam/stink wisps near lower-center seat
    const wispMat = new THREE.MeshBasicMaterial({
      color: 0xa3e635,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    for (let i = 0; i < 4; i++) {
      const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), wispMat);
      wisp.position.set((i - 1.5) * 0.12, -0.44 + i * 0.08, 0.02);
      this.toiletGroup.add(wisp);
      this.stinkWisps.push(wisp);
    }

    // Broken Burst Plumbing Pipe on left wall-corner (-1.68, 0.36, -1.86) spraying water across floor
    const pipeGroup = new THREE.Group();
    pipeGroup.position.set(-1.68, -0.71, -1.86);
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.35,
      metalness: 0.78,
    });
    const pipeLower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.02, 14), pipeMat);
    pipeLower.position.y = 0.51;
    pipeLower.castShadow = true;
    attachInkOutline(pipeLower, 1.04);

    const pipeUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.75, 14), pipeMat);
    pipeUpper.position.y = 2.02;
    pipeUpper.castShadow = true;

    const wallCollar = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.016, 8, 18), chromeMat);
    wallCollar.rotation.x = Math.PI / 2;
    wallCollar.position.y = 0.96;

    const burstJoint = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.078, 0.14, 12),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.65 }),
    );
    burstJoint.position.y = 1.07;
    burstJoint.rotation.z = -0.18;

    const pipeBurstGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.65,
      }),
    );
    pipeBurstGlow.position.set(0.07, 1.07, 0.05);
    this.pipeBurstGlow = pipeBurstGlow;

    pipeGroup.add(pipeLower, pipeUpper, wallCollar, burstJoint, pipeBurstGlow);
    this.toiletGroup.add(pipeGroup);

    // Glistening wet floor puddle beneath broken pipe spray zone
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 28),
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        roughness: 0.06,
        metalness: 0.1,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.scale.set(1.35, 0.85, 1);
    puddle.position.set(-0.65, -0.706, -1.42);
    this.toiletGroup.add(puddle);
  }

  public getLocation(): BackgroundLocation {
    return this.activeLocation;
  }

  public setLocation(loc: BackgroundLocation): void {
    this.activeLocation = loc;
    this.roomGroup.visible = loc === 'room';
    this.balconyGroup.visible = loc === 'balcony';
    this.toiletGroup.visible = loc === 'toilet';

    if (loc === 'room') {
      this.scene.background = new THREE.Color(0x160d26);
      this.scene.fog = new THREE.FogExp2(0x160d26, 0.082);
      this.hemiLight.color.setHex(0xd8b4fe);
      this.hemiLight.groundColor.setHex(0x2e1740);
      this.hemiLight.intensity = 1.05;
      this.keyLight.color.setHex(0xfef08a);
      this.keyLight.intensity = 1.75;
      this.rimLight.color.setHex(0xd946ef);
      this.rimLight.intensity = 0.9;
      this.accentPointLight.color.setHex(0xfbbf24);
      this.accentPointLight.position.set(-1.32, 0.28, -1.65);
      this.accentPointLight.intensity = 2.8;
    } else if (loc === 'balcony') {
      this.scene.background = new THREE.Color(0x05091a);
      this.scene.fog = new THREE.FogExp2(0x05091a, 0.032);
      this.hemiLight.color.setHex(0x60a5fa);
      this.hemiLight.groundColor.setHex(0x0f172a);
      this.hemiLight.intensity = 0.95;
      this.keyLight.color.setHex(0xbfdbfe);
      this.keyLight.intensity = 1.45;
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 1.15;
      this.accentPointLight.color.setHex(0xfbbf24);
      this.accentPointLight.position.set(-1.36, 0.12, -1.33);
      this.accentPointLight.intensity = 2.6;
    } else {
      this.scene.background = new THREE.Color(0x132029);
      this.scene.fog = new THREE.FogExp2(0x132029, 0.068);
      this.hemiLight.color.setHex(0xe0f2fe);
      this.hemiLight.groundColor.setHex(0x1e293b);
      this.hemiLight.intensity = 1.25;
      this.keyLight.color.setHex(0xf8fafc);
      this.keyLight.intensity = 1.65;
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 0.75;
      this.accentPointLight.color.setHex(0xd9f99d);
      this.accentPointLight.position.set(0.4, 2.05, -1.75);
      this.accentPointLight.intensity = 2.4;
    }

    // Keep shadow toggle consistent on software WebGL
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.accentPointLight.castShadow = !this.isSoftwareGl;
  }

  public update(elapsed: number, windStrength = 0.25): void {
    if (this.activeLocation === 'room') {
      this.accentPointLight.intensity = 2.8 + Math.sin(elapsed * 3.3) * 0.12;
      if (this.fanRotor) {
        this.fanRotor.rotation.z = -elapsed * (14 + windStrength * 28);
      }
      if (this.fanHead) {
        this.fanHead.rotation.y = -0.58 + Math.sin(elapsed * 0.95) * 0.34;
      }
    } else if (this.activeLocation === 'balcony') {
      this.accentPointLight.intensity = 2.55 + Math.sin(elapsed * 5.2) * 0.22;
      if (this.starField) {
        (this.starField.material as THREE.PointsMaterial).opacity =
          0.72 + Math.sin(elapsed * 1.8) * 0.18;
      }
    } else {
      // Subtle bathroom fluorescent hum + rising cartoon steam wisps + broken pipe spray pulse
      const flicker = Math.sin(elapsed * 29) > 0.96 ? 2.15 : 2.45;
      this.accentPointLight.intensity = flicker;
      if (this.pipeBurstGlow) {
        const sprayPulse = 0.85 + Math.sin(elapsed * 22) * 0.22 + windStrength * 0.45;
        this.pipeBurstGlow.scale.setScalar(sprayPulse);
      }
      this.stinkWisps.forEach((wisp, idx) => {
        const cycle = (elapsed * 0.45 + idx * 0.25) % 1;
        wisp.position.y = -0.44 + cycle * 0.34;
        wisp.position.x = (idx - 1.5) * 0.13 + Math.sin(elapsed * 2.8 + idx) * 0.04;
        wisp.scale.setScalar(0.65 + cycle * 0.55);
      });
    }
  }
}
