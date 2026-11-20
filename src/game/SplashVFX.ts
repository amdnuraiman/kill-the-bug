import * as THREE from 'three';
import type { BugKind } from '../audio/ProceduralAudioEngine';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  active: boolean;
  initialScale: number;
}

interface ShockRing {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
  active: boolean;
  maxScale: number;
}

export class SplashVFX {
  private scene: THREE.Scene;
  private particles: Particle[] = [];
  private rings: ShockRing[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const dropGeo = new THREE.SphereGeometry(0.022, 7, 6);
    for (let i = 0; i < 140; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xa3e635,
        roughness: 0.25,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(dropGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(),
        age: 0,
        maxAge: 0.55,
        active: false,
        initialScale: 1,
      });
    }

    const ringGeo = new THREE.RingGeometry(0.06, 0.11, 32);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({
        mesh,
        age: 0,
        maxAge: 0.32,
        active: false,
        maxScale: 3.8,
      });
    }
  }

  public spawnShockwave(
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    color = 0xfef08a,
    maxScale = 3.8,
    maxAge = 0.28,
  ): void {
    const ring = this.rings.find((r) => !r.active);
    if (!ring) return;
    ring.active = true;
    ring.age = 0;
    ring.maxAge = maxAge;
    ring.maxScale = maxScale;
    ring.mesh.position.copy(pos);
    ring.mesh.quaternion.copy(quat);
    ring.mesh.scale.setScalar(0.5);
    ring.mesh.visible = true;
    const mat = ring.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = 0.92;
  }

  public spawnSuperFloorSmash(floorPos: THREE.Vector3): void {
    const flatQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    this.spawnShockwave(floorPos, flatQuat, 0xfacc15, 16.0, 0.55);
    const innerPos = floorPos.clone().add(new THREE.Vector3(0, 0.03, 0));
    this.spawnShockwave(innerPos, flatQuat, 0xd946ef, 11.5, 0.42);

    const palette = [0xfacc15, 0xd946ef, 0xa855f7, 0xfef08a, 0x38bdf8];
    let spawned = 0;
    for (const p of this.particles) {
      if (p.active) continue;
      p.active = true;
      p.age = 0;
      p.maxAge = 0.45 + Math.random() * 0.35;
      p.initialScale = 1.1 + Math.random() * 1.6;
      p.mesh.position.copy(floorPos).add(
        new THREE.Vector3((Math.random() - 0.5) * 0.35, 0.05, (Math.random() - 0.5) * 0.35),
      );
      p.mesh.scale.setScalar(p.initialScale);
      p.mesh.visible = true;

      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(palette[spawned % palette.length]);
      mat.opacity = 0.98;

      const ang = Math.random() * Math.PI * 2;
      const radialSpeed = 2.6 + Math.random() * 4.2;
      p.vel.set(
        Math.cos(ang) * radialSpeed,
        1.8 + Math.random() * 3.4,
        Math.sin(ang) * radialSpeed,
      );
      spawned++;
      if (spawned >= 38) break;
    }
  }

  public spawnBugSplash(pos: THREE.Vector3, kind: BugKind, isClap = false): void {
    const count = isClap ? 24 : 18;
    const palette =
      kind === 'mosquito'
        ? [0xef4444, 0xdc2626, 0xfca5a5, 0x334155]
        : [0x84cc16, 0x10b981, 0xfacc15, 0x1e293b];

    let spawned = 0;
    for (const p of this.particles) {
      if (p.active) continue;
      p.active = true;
      p.age = 0;
      p.maxAge = 0.38 + Math.random() * 0.28;
      p.initialScale = 0.65 + Math.random() * 0.9;
      p.mesh.position.copy(pos);
      p.mesh.scale.setScalar(p.initialScale);
      p.mesh.visible = true;

      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(palette[spawned % palette.length]);
      mat.opacity = 0.96;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = (isClap ? 2.4 : 1.9) + Math.random() * 2.2;
      p.vel.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 0.85,
        Math.sin(phi) * Math.sin(theta) * speed,
      );

      spawned++;
      if (spawned >= count) break;
    }
  }

  public update(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= 7.2 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < -0.7) {
        p.mesh.position.y = -0.7;
        p.vel.y *= -0.35;
      }
      const t = p.age / p.maxAge;
      p.mesh.scale.setScalar(p.initialScale * (1 - t * 0.72));
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 1 - t);
    }

    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      if (r.age >= r.maxAge) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const t = r.age / r.maxAge;
      const scale = 0.6 + t * r.maxScale;
      r.mesh.scale.setScalar(scale);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - t));
    }
  }
}
