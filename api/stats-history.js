export const config = { runtime: 'edge' };
import { proxyWorker, intParam, oneOf } from './_lib/worker-proxy.js';
const METRICS = ['dau', 'heartbeats', 'update_checks', 'version', 'os', 'country'];
export default (request) => proxyWorker(request, {
  path: '/stats/history',
  allowParams: { metric: oneOf(METRICS), days: intParam(1, 365, 30) },
});
