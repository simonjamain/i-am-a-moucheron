import { predictedGroundPaths } from './wave-ground-paths.js';
self.onmessage = ({ data }) =>
  self.postMessage({ key: data.key, paths: predictedGroundPaths(data) });
