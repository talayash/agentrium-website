export const config = { runtime: 'edge' };
import { proxyWorker, intParam } from './_lib/worker-proxy.js';
export default (request) => proxyWorker(request, {
  path: '/errors/summary',
  allowParams: { days: intParam(1, 90, 7), limit: intParam(1, 100, 20) },
});
