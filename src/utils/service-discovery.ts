import { HTTPOptions } from './http';

export interface ServiceResolver {
  resolve(serviceName: string): Promise<string | null>;
}

/**
 * Static resolver that maps service names to fixed URLs.
 */
export class StaticResolver implements ServiceResolver {
  constructor(private readonly registry: Record<string, string>) {}

  async resolve(serviceName: string): Promise<string | null> {
    return this.registry[serviceName] || null;
  }
}

/**
 * Round-robin resolver that cycles through a list of instances for each service.
 */
export class RoundRobinResolver implements ServiceResolver {
  private counters: Record<string, number> = {};

  constructor(private readonly registry: Record<string, string[]>) {}

  async resolve(serviceName: string): Promise<string | null> {
    const instances = this.registry[serviceName];
    if (!instances || instances.length === 0) {
      return null;
    }

    const index = (this.counters[serviceName] || 0) % instances.length;
    this.counters[serviceName] = (this.counters[serviceName] || 0) + 1;

    return instances[index];
  }
}

/**
 * Creates an interceptor that resolves `service://service-name` URLs to actual endpoints.
 */
export function createServiceDiscoveryInterceptor(resolver: ServiceResolver) {
  return {
    onFulfilled: async (config: HTTPOptions): Promise<HTTPOptions> => {
      if (!config.url || !config.url.startsWith('service://')) {
        return config;
      }

      try {
        const urlObj = new URL(config.url);
        const serviceName = urlObj.hostname;
        const baseUrl = await resolver.resolve(serviceName);

        if (!baseUrl) {
          throw new Error(`Service "${serviceName}" could not be resolved`);
        }

        // Handle path joining: remove trailing slash from base, ensure leading slash on path
        const cleanBase = baseUrl.replace(/\/$/, '');
        const path = urlObj.pathname === '/' && !config.url.endsWith('/') ? '' : urlObj.pathname;
        const search = urlObj.search;

        config.url = `${cleanBase}${path}${search}`;
        return config;
      } catch (error) {
        if (error instanceof Error && error.message.includes('could not be resolved')) {
          throw error;
        }
        // If URL parsing fails, ignore (though service:// should parse)
        return config;
      }
    },
  };
}
