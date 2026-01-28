import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager } from '../src/utils/cache';

describe('CacheManager Invalidation', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager({ storage: 'memory' });
  });

  it('should invalidate entries by tag', () => {
    cache.set('user:1', { name: 'User 1' }, 60000, ['user', 'profile']);
    cache.set('user:2', { name: 'User 2' }, 60000, ['user', 'profile']);
    cache.set('post:1', { title: 'Post 1' }, 60000, ['post']);

    expect(cache.get('user:1')).not.toBeNull();
    expect(cache.get('user:2')).not.toBeNull();
    expect(cache.get('post:1')).not.toBeNull();

    cache.invalidateByTag('user');

    expect(cache.get('user:1')).toBeNull();
    expect(cache.get('user:2')).toBeNull();
    expect(cache.get('post:1')).not.toBeNull();
  });

  it('should invalidate entries by regex pattern', () => {
    cache.set('api/users/1', 'data', 60000);
    cache.set('api/users/2', 'data', 60000);
    cache.set('api/posts/1', 'data', 60000);

    cache.invalidateByPattern(/api\/users\/.*/);

    expect(cache.get('api/users/1')).toBeNull();
    expect(cache.get('api/users/2')).toBeNull();
    expect(cache.get('api/posts/1')).not.toBeNull();
  });

  it('should invalidate entries by string pattern (wildcard logic is regex)', () => {
    // Note: The implementation uses `new RegExp(string)`, so special chars need escaping if meant literally
    // But typical use case 'prefix' works fine.
    cache.set('prefix_1', 'val');
    cache.set('prefix_2', 'val');
    cache.set('other', 'val');

    cache.invalidateByPattern('prefix_');

    expect(cache.get('prefix_1')).toBeNull();
    expect(cache.get('prefix_2')).toBeNull();
    expect(cache.get('other')).not.toBeNull();
  });
});
