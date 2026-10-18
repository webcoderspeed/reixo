/**
 * reixo/mock — mock adapter for testing
 *
 * @example
 * import { MockAdapter } from 'reixo/mock';
 * import { createClient } from 'reixo';
 *
 * const mock = new MockAdapter();
 * const api = createClient({ baseURL: 'https://api.example.com', adapter: mock });
 *
 * mock.onGet('/users/1').reply(200, { id: 1, name: 'Alice' });
 *
 * const result = await api.tryGet('/users/1');
 * expect(result.ok).toBe(true);
 */

export type { MockResponseData } from './utils/mock-adapter';
export { MockAdapter } from './utils/mock-adapter';
