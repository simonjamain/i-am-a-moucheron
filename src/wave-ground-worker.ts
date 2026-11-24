import { setActiveLayout } from './layouts.ts';
import { predictedGroundPaths, type GroundPathRequest } from './wave-ground-paths.ts';
// The worker has its own module instances: it follows the room's plan per request.
// Started by wave-forecast-scene.ts at the served URL `./wave-ground-worker.js`.
self.onmessage = ({ data }: MessageEvent<GroundPathRequest & { key: string; layout: string }>) => {
  setActiveLayout(data.layout);
  self.postMessage({ key: data.key, paths: predictedGroundPaths(data) });
};
