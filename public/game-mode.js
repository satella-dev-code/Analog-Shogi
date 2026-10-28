export function normalizeGameMode(mode) {
  return ['local', 'cpu', 'cpu-vs-cpu'].includes(mode) ? mode : 'local';
}
export function isCpuTurn(mode, side) {
  return mode === 'cpu-vs-cpu' || (mode === 'cpu' && side === 'gote');
}
export function cpuMoveDelay(mode) { return mode === 'cpu-vs-cpu' ? 900 : 250; }
