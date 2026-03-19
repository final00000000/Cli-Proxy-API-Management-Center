import { test, expect } from 'vitest';

test('runner smoke test has access to document', () => {
  expect(typeof document).toBe('object');
});
