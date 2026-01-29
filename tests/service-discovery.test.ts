import { describe, it, expect } from 'vitest';
import {
  StaticResolver,
  RoundRobinResolver,
  createServiceDiscoveryInterceptor,
} from '../src/utils/service-discovery';
import { HTTPOptions } from '../src/utils/http';

describe('Service Discovery', () => {
  describe('StaticResolver', () => {
    it('should resolve known services', async () => {
      const resolver = new StaticResolver({
        'user-service': 'https://users.api.com',
        'auth-service': 'http://localhost:3000',
      });

      expect(await resolver.resolve('user-service')).toBe('https://users.api.com');
      expect(await resolver.resolve('auth-service')).toBe('http://localhost:3000');
    });

    it('should return null for unknown services', async () => {
      const resolver = new StaticResolver({});
      expect(await resolver.resolve('unknown')).toBeNull();
    });
  });

  describe('RoundRobinResolver', () => {
    it('should cycle through instances', async () => {
      const resolver = new RoundRobinResolver({
        api: ['http://node1', 'http://node2', 'http://node3'],
      });

      expect(await resolver.resolve('api')).toBe('http://node1');
      expect(await resolver.resolve('api')).toBe('http://node2');
      expect(await resolver.resolve('api')).toBe('http://node3');
      expect(await resolver.resolve('api')).toBe('http://node1');
    });

    it('should return null for empty or unknown services', async () => {
      const resolver = new RoundRobinResolver({ empty: [] });
      expect(await resolver.resolve('empty')).toBeNull();
      expect(await resolver.resolve('unknown')).toBeNull();
    });
  });

  describe('Interceptor', () => {
    it('should replace service:// URL with resolved URL', async () => {
      const resolver = new StaticResolver({
        users: 'https://api.users.com/v1',
      });
      const interceptor = createServiceDiscoveryInterceptor(resolver);

      const config: HTTPOptions = { url: 'service://users/profile?id=123' };
      const result = await interceptor.onFulfilled(config);

      expect(result.url).toBe('https://api.users.com/v1/profile?id=123');
    });

    it('should ignore non-service URLs', async () => {
      const resolver = new StaticResolver({});
      const interceptor = createServiceDiscoveryInterceptor(resolver);

      const config: HTTPOptions = { url: 'https://google.com' };
      const result = await interceptor.onFulfilled(config);

      expect(result.url).toBe('https://google.com');
    });

    it('should throw if service cannot be resolved', async () => {
      const resolver = new StaticResolver({});
      const interceptor = createServiceDiscoveryInterceptor(resolver);

      const config: HTTPOptions = { url: 'service://unknown/path' };

      await expect(interceptor.onFulfilled(config)).rejects.toThrow(
        'Service "unknown" could not be resolved'
      );
    });

    it('should handle trailing slashes correctly', async () => {
      const resolver = new StaticResolver({
        api: 'https://api.com/',
      });
      const interceptor = createServiceDiscoveryInterceptor(resolver);

      const config: HTTPOptions = { url: 'service://api/users' };
      const result = await interceptor.onFulfilled(config);

      // Base: https://api.com/ -> clean: https://api.com
      // Path: /users
      // Result: https://api.com/users
      expect(result.url).toBe('https://api.com/users');
    });
  });
});
