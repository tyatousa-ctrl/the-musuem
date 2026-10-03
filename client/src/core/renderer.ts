import * as THREE from 'three';
import type { QualityTier } from './config';

/** WebGL renderer with WebXR (brief §4: WebGL for XR; see DECISIONS.md). */
export function createRenderer(tier: QualityTier, container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: tier !== 'quest',
    powerPreference: 'high-performance',
    preserveDrawingBuffer: new URLSearchParams(location.search).has('cam'), // screenshots
  });
  const ratio = tier === 'quest' ? 1 : tier === 'desktop-high' ? Math.min(2, devicePixelRatio) : Math.min(1.5, devicePixelRatio);
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  // Quest: fixed foveation and a modest framebuffer scale; both exposed in the dev panel.
  renderer.xr.setFoveation(tier === 'quest' ? 1 : 0.5);
  renderer.xr.setFramebufferScaleFactor(tier === 'quest' ? 1 : 1);
  container.appendChild(renderer.domElement);
  window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight));
  return renderer;
}
