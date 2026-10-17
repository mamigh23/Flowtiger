import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseApiUrl } from './check-release-env.mjs';

test('HTTPS API kökünü ve son eğik çizgiyi kabul eder', () => {
  assert.doesNotThrow(() => validateReleaseApiUrl('https://api.example.com/api/v1'));
  assert.doesNotThrow(() => validateReleaseApiUrl('https://example.com/backend/api/v1/'));
});

for (const value of [undefined, '', 'not-a-url', 'http://api.example.com/api/v1',
  'https://localhost/api/v1', 'https://127.0.0.1/api/v1', 'https://[::1]/api/v1',
  'https://0.0.0.0/api/v1', 'https://api.test/api/v1', 'https://api.example.com',
  'https://user:secret@api.example.com/api/v1', 'https://api.example.com/api/v1?token=x',
  'https://api.example.com/api/v1#x']) {
  test(`geçersiz yayın yapılandırması ${String(value).includes('secret') ? '(kimlik bilgisi)' : value}`, () => {
    assert.throws(() => validateReleaseApiUrl(value));
  });
}
