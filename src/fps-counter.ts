import type * as THREE from 'three';
import type { Three } from './types.ts';

// Compteur d'images par seconde, en haut à droite, dessiné dans le canvas WebGL (pas
// dans le HTML) : une texture de texte sur un plan, rendue par-dessus l'image du jeu
// avec une caméra orthographique en pixels CSS. Le chiffre est mesuré sur une fenêtre
// d'une demi-seconde et la texture n'est redessinée qu'à ce rythme.

/** Durée de la fenêtre de mesure, en secondes. */
export const FPS_WINDOW = 0.5;
const WIDTH = 64;
const HEIGHT = 22;
const MARGIN = 8;
const INK = '#ece8dc';
const SHADE = 'rgba(11, 33, 31, 0.55)';

/** Mesure glissante : appeler `tick(dt)` à chaque image ; renvoie les FPS à chaque fin de fenêtre. */
export class FpsMeter {
  private frames = 0;
  private elapsed = 0;
  value = 0;

  /** @returns true quand `value` vient d'être mise à jour. */
  tick(dt: number): boolean {
    if (!(dt > 0)) return false;
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < FPS_WINDOW) return false;
    this.value = Math.round(this.frames / this.elapsed);
    this.frames = 0;
    this.elapsed = 0;
    return true;
  }
}

export interface FpsCounter {
  /** À appeler une fois par image, après le rendu du jeu. */
  draw(renderer: THREE.WebGLRenderer, dt: number): void;
}

export function createFpsCounter(T: Three): FpsCounter {
  const meter = new FpsMeter();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const plane = new T.Mesh(new T.PlaneGeometry(WIDTH, HEIGHT), material);
  const scene = new T.Scene();
  scene.add(plane);
  const camera = new T.OrthographicCamera(0, 1, 1, 0, -1, 1);
  let scale = 0;

  const paint = (pixelRatio: number): void => {
    if (!ctx) return;
    if (scale !== pixelRatio) {
      scale = pixelRatio;
      canvas.width = Math.ceil(WIDTH * pixelRatio);
      canvas.height = Math.ceil(HEIGHT * pixelRatio);
    }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = SHADE;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = INK;
    ctx.font = "600 14px 'Barlow Condensed', Impact, sans-serif";
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${meter.value} FPS`, WIDTH - 6, HEIGHT / 2 + 1);
    texture.needsUpdate = true;
  };

  return {
    draw(renderer, dt) {
      const pixelRatio = renderer.getPixelRatio();
      if (meter.tick(dt) || scale !== pixelRatio) paint(pixelRatio);
      const size = renderer.getSize(new T.Vector2());
      camera.left = 0;
      camera.right = size.x;
      camera.top = size.y;
      camera.bottom = 0;
      camera.updateProjectionMatrix();
      plane.position.set(size.x - MARGIN - WIDTH / 2, size.y - MARGIN - HEIGHT / 2, 0);
      const target = renderer.getRenderTarget();
      const autoClear = renderer.autoClear;
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(target);
    },
  };
}
