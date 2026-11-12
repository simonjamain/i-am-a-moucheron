import { APPEARANCES, appearanceId, nextAppearance } from './character-appearances.js';
import {
  createCharacter,
  loadCharacter,
  characterLoaded,
  CHARACTER_HEIGHT,
} from './character-model.js';

// Home screen character selector: a small turntable of the chosen appearance
// between the name/room fields and the join button, with previous/next arrows
// (and ←/→ while the selector has focus). Models load on demand (the chosen one
// here, other players' ones in game).
//
// Drawing: after each game frame, draw() renders the turntable with the game
// renderer straight into the game canvas, scissored to the selector's screen
// rectangle; the page leaves that rectangle see-through (the panel colour is a
// box-shadow around it, and the side shade gets a matching mask hole). No second
// WebGL context and no pixel read-back: in Chrome either one left the game
// several times slower for the rest of the session.
export const PREVIEW_BACKGROUND = '#0c211f';
const BAND = { top: 26, bottom: 34 }; // px taken by the title and the name rows
export function createAppearancePicker(T, { root, label, prev, next, shade, initial, onChange }) {
  let value = appearanceId(initial),
    shown = null,
    character = null,
    active = true,
    hole = '',
    yaw = -0.35;
  const scene = new T.Scene();
  scene.background = new T.Color(PREVIEW_BACKGROUND);
  scene.add(new T.HemisphereLight('#f6f1dc', '#20332f', 2.2));
  const key = new T.DirectionalLight('#fff4dc', 2.4);
  key.position.set(1.5, 3, 4);
  scene.add(key);
  const camera = new T.PerspectiveCamera(26, 1, 0.1, 20);
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
    // Called once per game frame, after the frame is rendered, on the home screen.
    draw(renderer, dt) {
      if (!active) return;
      // Software fallback renderer: an opaque selector, the name identifies the choice.
      if (!renderer?.isWebGLRenderer) return void root.classList.add('appearance-flat');
      show();
      const box = root.getBoundingClientRect(),
        view = renderer.domElement.getBoundingClientRect();
      const x = box.left - view.left,
        y = view.bottom - box.bottom,
        width = box.width,
        height = box.height;
      if (width < 1 || height < 1) return;
      const rect = [box.left, box.top, width, height].map((v) => Math.round(v) + 'px');
      if (rect.join() !== hole) {
        hole = rect.join();
        shade?.style.setProperty('--hole-x', rect[0]);
        shade?.style.setProperty('--hole-y', rect[1]);
        shade?.style.setProperty('--hole-w', rect[2]);
        shade?.style.setProperty('--hole-h', rect[3]);
        shade?.classList.add('appearance-hole');
      }
      // Fit the 1.7 m character between the title row (top) and the name (bottom).
      const band = Math.max(40, height - BAND.top - BAND.bottom),
        visible = (CHARACTER_HEIGHT * 1.08 * height) / band,
        centre = CHARACTER_HEIGHT / 2 + ((BAND.top - BAND.bottom) / 2) * (visible / height);
      camera.aspect = width / height;
      camera.position.set(0, centre + 0.1, visible / (2 * Math.tan(T.MathUtils.degToRad(13))));
      camera.lookAt(0, centre, 0);
      camera.updateProjectionMatrix();
      if (character) {
        yaw += Math.min(0.1, dt || 0) * 0.45;
        character.container.rotation.y = Math.sin(yaw) * 0.6;
        character.update(dt, {});
      }
      const viewport = renderer.getViewport(new T.Vector4()),
        target = renderer.getRenderTarget();
      renderer.setRenderTarget(null);
      renderer.setViewport(x, y, width, height);
      renderer.setScissor(x, y, width, height);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      renderer.setViewport(viewport);
      renderer.setRenderTarget(target);
    },
    // Joined: stop drawing. Shared geometry, materials and textures stay alive.
    stop() {
      active = false;
      shade?.classList.remove('appearance-hole');
      if (character) scene.remove(character.container);
      character = null;
    },
  };
}
