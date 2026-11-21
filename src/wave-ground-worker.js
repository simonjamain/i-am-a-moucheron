import { setActiveLayout } from './layouts.ts';
import { predictedGroundPaths } from './wave-ground-paths.js';
// The worker has its own module instances: it follows the room's plan per request.
self.onmessage = ({ data }) => {
  setActiveLayout(data.layout);
  self.postMessage({ key: data.key, paths: predictedGroundPaths(data) });
};
