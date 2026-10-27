import { chooseCpuMove } from './cpu.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ action: chooseCpuMove(data) }); }
  catch { self.postMessage({ error: true }); }
};
