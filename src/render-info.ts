import type { Three } from './types.ts';

interface GlLike {
  getParameter(name: number): unknown;
  getExtension(
    name: string,
  ): { UNMASKED_RENDERER_WEBGL: number; UNMASKED_VENDOR_WEBGL: number } | null;
  getContextAttributes(): { antialias?: boolean } | null;
  isContextLost?(): boolean;
  VERSION: number;
  DEPTH_BITS: number;
  SAMPLES: number;
  MAX_TEXTURE_SIZE: number;
  RENDERER: number;
}
interface RendererLike {
  isWebGLRenderer?: boolean;
  capabilities?: { isWebGL2?: boolean; logarithmicDepthBuffer?: boolean };
  getPixelRatio?: () => number;
  getContext?: () => GlLike;
}

/**
 * Plain-text report of how this browser draws the game, for players who do not
 * see everything (rings, tracers...): GPU, WebGL version, depth bits, MSAA,
 * software fallback. Copied to the clipboard from the "Nouveautés" dialog.
 */
export function renderInfo(
  _T: Three | null,
  renderer: RendererLike,
  env: Record<string, unknown> = globalThis as Record<string, unknown>,
): string[] {
  const lines: string[] = [];
  if (!renderer?.isWebGLRenderer) {
    lines.push('Rendu : logiciel 2D (WebGL indisponible, affichage simplifié)');
  } else {
    let gl: GlLike | null = null;
    try {
      gl = renderer.getContext?.() ?? null;
    } catch {
      gl = null;
    }
    lines.push(
      'Rendu : WebGL' +
        (renderer.capabilities?.isWebGL2 ? ' 2' : ' 1') +
        (gl?.isContextLost?.() ? ' (contexte perdu)' : ''),
    );
    if (gl) {
      try {
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        lines.push(
          'GPU : ' +
            String(
              info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            ),
        );
        if (info) lines.push('Fabricant : ' + String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)));
        lines.push(
          'Profondeur : ' +
            String(gl.getParameter(gl.DEPTH_BITS)) +
            ' bits, MSAA ' +
            String(gl.getContextAttributes()?.antialias ? 'oui' : 'non') +
            ' (' +
            String(gl.getParameter(gl.SAMPLES)) +
            ' échantillons)',
        );
        lines.push('Texture max : ' + String(gl.getParameter(gl.MAX_TEXTURE_SIZE)));
      } catch (error) {
        lines.push('GPU : lecture impossible (' + String((error as Error)?.message ?? error) + ')');
      }
    }
    lines.push('Pixel ratio utilisé : ' + String(renderer.getPixelRatio?.() ?? '?'));
  }
  const nav = (env.navigator ?? {}) as Record<string, unknown>;
  lines.push(
    'Écran : ' +
      String(env.innerWidth) +
      '×' +
      String(env.innerHeight) +
      ' @' +
      String(env.devicePixelRatio),
  );
  lines.push(
    'Cœurs : ' +
      String(nav.hardwareConcurrency ?? '?') +
      ', mémoire : ' +
      String(nav.deviceMemory ?? '?') +
      ' Go',
  );
  lines.push('Navigateur : ' + String(nav.userAgent ?? '?'));
  return lines;
}
