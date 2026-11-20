export type WebcamGesture = 'clap' | 'smash_left' | 'smash_right';

export class WebcamHandTracker {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private active = false;
  private rafId: number | null = null;

  private readonly w = 64;
  private readonly h = 48;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private prevLuma: Float32Array;
  private hasPrev = false;
  private lastTriggerMs = 0;

  private onGesture: (gesture: WebcamGesture, aimX: number, aimY: number) => void;
  private previewCanvas: HTMLCanvasElement | null = null;

  constructor(onGesture: (gesture: WebcamGesture, aimX: number, aimY: number) => void) {
    this.onGesture = onGesture;
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = this.w;
    this.offscreen.height = this.h;
    const ctx = this.offscreen.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.offCtx = ctx;
    this.prevLuma = new Float32Array(this.w * this.h);
  }

  public isActive(): boolean {
    return this.active;
  }

  public attachPreviewCanvas(canvas: HTMLCanvasElement | null): void {
    this.previewCanvas = canvas;
  }

  public async enable(): Promise<{ ok: boolean; error?: string }> {
    if (this.active) return { ok: true };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, error: 'Camera API unavailable in this browser' };
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false,
      });
      this.stream = stream;
      if (!this.video) {
        this.video = document.createElement('video');
        this.video.playsInline = true;
        this.video.muted = true;
      }
      this.video.srcObject = stream;
      await this.video.play();
      this.active = true;
      this.hasPrev = false;
      this.loop();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera permission denied';
      return { ok: false, error: msg };
    }
  }

  public disable(): void {
    this.active = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
    this.hasPrev = false;
  }

  private loop = (): void => {
    if (!this.active) return;
    this.processFrame();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private processFrame(): void {
    if (!this.video || this.video.readyState < 2) return;

    const { w, h, offCtx } = this;
    offCtx.save();
    offCtx.scale(-1, 1);
    offCtx.drawImage(this.video, -w, 0, w, h);
    offCtx.restore();

    const pixels = offCtx.getImageData(0, 0, w, h).data;
    const halfW = w / 2;

    let leftEnergy = 0;
    let rightEnergy = 0;
    let leftX = 0;
    let leftY = 0;
    let rightX = 0;
    let rightY = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const p = idx * 4;
        const luma = (pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114) / 255;

        if (this.hasPrev) {
          const diff = Math.abs(luma - this.prevLuma[idx]);
          if (diff > 0.14) {
            if (x < halfW) {
              leftEnergy += diff;
              leftX += (x / w) * diff;
              leftY += (y / h) * diff;
            } else {
              rightEnergy += diff;
              rightX += (x / w) * diff;
              rightY += (y / h) * diff;
            }
          }
        }
        this.prevLuma[idx] = luma;
      }
    }

    if (!this.hasPrev) {
      this.hasPrev = true;
      return;
    }

    if (this.previewCanvas) {
      const pCtx = this.previewCanvas.getContext('2d');
      if (pCtx) {
        const pw = this.previewCanvas.width;
        const ph = this.previewCanvas.height;
        pCtx.save();
        pCtx.scale(-1, 1);
        pCtx.drawImage(this.video, -pw, 0, pw, ph);
        pCtx.restore();

        // Subtle left/right zone divider
        pCtx.strokeStyle = 'rgba(255,255,255,0.28)';
        pCtx.lineWidth = 1;
        pCtx.beginPath();
        pCtx.moveTo(pw * 0.5, 0);
        pCtx.lineTo(pw * 0.5, ph);
        pCtx.stroke();
      }
    }

    const now = performance.now();
    if (now - this.lastTriggerMs < 320) return;

    const threshold = 9.5;
    if (leftEnergy > threshold && rightEnergy > threshold) {
      this.lastTriggerMs = now;
      const cx = ((leftX / leftEnergy) + (rightX / rightEnergy)) * 0.5;
      const cy = ((leftY / leftEnergy) + (rightY / rightEnergy)) * 0.5;
      this.onGesture('clap', (cx - 0.5) * 2, (0.5 - cy) * 2);
    } else if (leftEnergy > threshold * 1.15 && leftEnergy > rightEnergy * 1.45) {
      this.lastTriggerMs = now;
      const cx = leftX / leftEnergy;
      const cy = leftY / leftEnergy;
      this.onGesture('smash_left', (cx - 0.5) * 2, (0.5 - cy) * 2);
    } else if (rightEnergy > threshold * 1.15 && rightEnergy > leftEnergy * 1.45) {
      this.lastTriggerMs = now;
      const cx = rightX / rightEnergy;
      const cy = rightY / rightEnergy;
      this.onGesture('smash_right', (cx - 0.5) * 2, (0.5 - cy) * 2);
    }
  }

  public dispose(): void {
    this.disable();
  }
}
