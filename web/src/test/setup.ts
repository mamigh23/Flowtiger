import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { tokenStorage } from '@/lib/auth/tokenStorage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();

  // Token bellekte tutulduğu için testler arasında sızabilir.
  tokenStorage.clear();
});
