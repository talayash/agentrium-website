export const config = { runtime: 'edge' };
import { proxyWorker, intParam, oneOf } from './_lib/worker-proxy.js';
export default (request) => proxyWorker(request, {
  path: '/feedback/list',
  allowParams: { limit: intParam(1, 500, 100), unread_only: oneOf(['0', '1']) },
});
