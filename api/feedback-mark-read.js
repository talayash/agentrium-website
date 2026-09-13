export const config = { runtime: 'edge' };
import { proxyWorker } from './_lib/worker-proxy.js';
export default (request) => proxyWorker(request, { path: '/feedback/mark_read', method: 'POST' });
