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
// What the page paints over the game image around the selector, redrawn behind
// the model so the selector has no frame of its own: the side shade (#shade,
// linear-gradient(90deg, #0b211fee, transparent 85%)) then the panel colour
// (.appearance box-shadow, #102b29eb). Both are "over" blends of constant colours
// on sRGB values, like WebGL blending on the canvas: result = C + k * game.
export const PANEL_TINT = Object.freeze({ color: [0x10, 0x2b, 0x29], alpha: 0xeb / 255 });
export const SIDE_SHADE = Object.freeze({
  color: [0x0b, 0x21, 0x1f],
  alpha: 0xee / 255,
  end: 0.85,
});
const rgb = (c) => c.map((v) => v / 255);
const BAND = { top: 22, bottom: 4 }; // px taken by the title row, and the margin below
export function createAppearancePicker(T, { root, label, prev, next, shade, initial, onChange }) {
  let value = appearanceId(initial),
    shown = null,
    character = null,
    active = true,
    hole = '',
    yaw = -0.35;
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight('#f6f1dc', '#20332f', 2.2));
  const key = new T.DirectionalLight('#fff4dc', 2.4);
  key.position.set(1.5, 3, 4);
  scene.add(key);
  const camera = new T.PerspectiveCamera(26, 1, 0.1, 20);
  const tint = new T.Scene(),
    flat = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tintMaterial = new T.ShaderMaterial({
    uniforms: {
      panel: { value: new T.Vector4(...rgb(PANEL_TINT.color), PANEL_TINT.alpha) },
      shade: { value: new T.Vector4(...rgb(SIDE_SHADE.color), SIDE_SHADE.alpha) },
      shadeEnd: { value: SIDE_SHADE.end },
      viewWidth: { value: 1 },
    },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
          uniform vec4 panel, shade;
          uniform float shadeEnd, viewWidth;
          void main() {
            float s = shade.a * clamp(1.0 - gl_FragCoord.x / (viewWidth * shadeEnd), 0.0, 1.0);
            vec3 c = panel.rgb * panel.a + (1.0 - panel.a) * s * shade.rgb;
            float k = (1.0 - panel.a) * (1.0 - s);
            gl_FragColor = vec4(c, 1.0 - k); // premultiplied: c + k * game
          }`,
    blending: T.CustomBlending,
    blendSrc: T.OneFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
  });
  tint.add(new T.Mesh(new T.PlaneGeometry(2, 2), tintMaterial));
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
      // Rounded outward: no unpainted sliver between the drawing and the panel.
      const x = Math.floor(box.left - view.left),
        y = Math.floor(view.bottom - box.bottom),
        width = Math.ceil(box.right - view.left) - x,
        height = Math.ceil(view.bottom - box.top) - y;
      if (width < 1 || height < 1) return;
      // The shade's hole is exactly the drawn rectangle (CSS px from the top-left).
      const rect = [x + view.left, view.bottom - y - height, width, height].map((v) => v + 'px');
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
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      tintMaterial.uniforms.viewWidth.value = renderer.domElement.width;
      renderer.render(tint, flat); // shade and panel colour over this frame's game image
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = autoClear;
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
