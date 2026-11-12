import { APPEARANCES, appearanceId, nextAppearance } from './character-appearances.js';
import { createCharacter, loadCharacter, characterLoaded } from './character-model.js';

// Home screen character selector: a small turntable of the chosen appearance
// between the name/room fields and the join button, with previous/next arrows
// (and ←/→ while the selector has focus). No second WebGL context: draw() is
// called by the game loop before the frame, renders the turntable with the game
// renderer into a scissored corner of its canvas, copies it into the 2D preview
// canvas in the same task, and the frame then overwrites that corner. Models
// load on demand (the chosen one here, other players' ones in game).
export const PREVIEW_BACKGROUND = '#0c211f';
export function createAppearancePicker(T, { root, canvas, label, prev, next, initial, onChange }) {
  let value = appearanceId(initial),
    shown = null,
    character = null,
    active = true,
    yaw = -0.35;
  const scene = new T.Scene();
  scene.background = new T.Color(PREVIEW_BACKGROUND);
  scene.add(new T.HemisphereLight('#f6f1dc', '#20332f', 2.2));
  const key = new T.DirectionalLight('#fff4dc', 2.4);
  key.position.set(1.5, 3, 4);
  scene.add(key);
  const camera = new T.PerspectiveCamera(26, 1, 0.1, 20);
  camera.position.set(0, 1.0, 4.4);
  camera.lookAt(0, 0.82, 0);
  const context = canvas.getContext('2d');
  const nameOf = (id) => APPEARANCES.find((a) => a.id === id).name;
  function show() {
    if (shown === value || !characterLoaded(value)) return;
    if (character) scene.remove(character.container);
    character = createCharacter(T, value);
    scene.add(character.container);
    shown = value;
  }
  function select(id) {
    const chosen = (value = appearanceId(id));
    label.textContent = nameOf(value);
    root.dataset.appearance = value;
    root.setAttribute('aria-busy', String(!characterLoaded(value)));
    loadCharacter(value)
      .then(() => {
        if (value === chosen) root.setAttribute('aria-busy', 'false');
      })
      .catch(() => {
        if (value === chosen) label.textContent = nameOf(value) + ' (indisponible)';
      });
    onChange?.(value);
  }
  const step = (n) => select(nextAppearance(value, n));
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    step(e.key === 'ArrowLeft' ? -1 : 1);
  });
  select(value);
  return {
    get value() {
      return value;
    },
    get active() {
      return active;
    },
    select,
    // Call before the game renders its frame (it must clear the whole canvas).
    draw(renderer, dt) {
      if (!active) return;
      show();
      // Software fallback renderer: the name alone identifies the choice.
      if (!renderer?.isWebGLRenderer || !context) return void (canvas.hidden = true);
      const width = canvas.clientWidth,
        height = canvas.clientHeight,
        ratio = renderer.getPixelRatio(),
        source = renderer.domElement;
      if (!character || !width || !height) return;
      if (width * ratio > source.width || height * ratio > source.height) return;
      if (canvas.width !== Math.round(width * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      yaw += Math.min(0.1, dt || 0) * 0.45;
      character.container.rotation.y = Math.sin(yaw) * 0.6;
      character.update(dt, {});
      const viewport = renderer.getViewport(new T.Vector4());
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      renderer.setViewport(viewport);
      // WebGL y runs upward: the corner is the bottom-left of the source.
      context.drawImage(
        source,
        0,
        source.height - canvas.height,
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    },
    // Joined: stop drawing. Shared geometry, materials and textures stay alive.
    stop() {
      active = false;
      if (character) scene.remove(character.container);
      character = null;
    },
  };
}
