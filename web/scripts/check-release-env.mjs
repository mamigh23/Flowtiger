import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

export function validateReleaseApiUrl(value) {
  if (!value) throw new Error('Yayın için VITE_API_BASE_URL tanımlanmalıdır.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_API_BASE_URL geçerli bir mutlak URL olmalıdır.');
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    host === 'localhost' || host.endsWith('.localhost') ||
    host === '0.0.0.0' || host.startsWith('127.') ||
    host === '[::1]' || host === '[::]' ||
    host.endsWith('.test') || host.endsWith('.invalid') || host.endsWith('.local')
  ) {
    throw new Error('Yayın API adresi HTTPS kullanmalı ve yerel/test adresi olmamalıdır.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Yayın API adresi kimlik bilgisi, sorgu veya fragment içeremez.');
  }
  if (!url.pathname.replace(/\/+$/, '').endsWith('/api/v1')) {
    throw new Error('Yayın API adresi /api/v1 ile bitmelidir.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = loadEnv('production', process.cwd(), 'VITE_');
    validateReleaseApiUrl(env.VITE_API_BASE_URL);
    console.log('Yayın API yapılandırması doğrulandı; sunucu erişimi ayrıca doğrulanmalıdır.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
