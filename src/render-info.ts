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
/** What three.js exposes of a WebGPU adapter and device (`renderer.backend`). */
interface GpuBackendLike {
  isWebGPUBackend?: boolean;
  adapter?: { info?: Record<string, unknown> };
  device?: { limits?: { maxTextureDimension2D?: number } };
  /** WebGL 2 context of the fallback backend. */
  gl?: GlLike;
}
interface RendererLike {
  isWebGPURenderer?: boolean;
  backend?: GpuBackendLike;
  getPixelRatio?: () => number;
}

/**
 * Plain-text report of how this browser draws the game, for players who do not
 * see everything (rings, tracers...): backend (WebGPU or WebGL 2), GPU, depth bits, MSAA,
 * software fallback. Copied to the clipboard from the "Nouveautés" dialog.
 */
export function renderInfo(
  _T: Three | null,
  renderer: RendererLike,
  env: Record<string, unknown> = globalThis as Record<string, unknown>,
): string[] {
  const lines: string[] = [];
  if (!renderer?.isWebGPURenderer) {
    lines.push('Rendu : logiciel 2D (GPU indisponible, affichage simplifié)');
  } else {
    let backend: GpuBackendLike | undefined;
    try {
      backend = renderer.backend;
    } catch {
      backend = undefined;
    }
    if (backend?.isWebGPUBackend) {
      lines.push('Rendu : WebGPU');
      const info = backend.adapter?.info ?? {};
      const name = info.description || info.device || info.architecture || info.vendor;
      lines.push('GPU : ' + String(name || 'inconnu'));
      if (info.vendor) lines.push('Fabricant : ' + String(info.vendor));
      lines.push('Texture max : ' + String(backend.device?.limits?.maxTextureDimension2D ?? '?'));
    } else {
      // WebGL 2 backend of the same renderer (browsers without WebGPU).
      const gl = backend?.gl ?? null;
      lines.push(
        'Rendu : WebGL 2 (secours de WebGPU)' + (gl?.isContextLost?.() ? ' (contexte perdu)' : ''),
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
          if (info)
            lines.push('Fabricant : ' + String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)));
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
          lines.push(
            'GPU : lecture impossible (' + String((error as Error)?.message ?? error) + ')',
          );
        }
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
