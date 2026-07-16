import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Ensure the DOM is reset between tests to avoid cross-test leakage.
afterEach(() => {
  cleanup();
});
