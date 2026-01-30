import { HTTPClient, HTTPClientConfig } from './http-client';
import { sha256 } from '../utils/hash';

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
  extensions?: Record<string, unknown>;
}

export interface GraphQLClientConfig extends Partial<HTTPClientConfig> {
  enablePersistedQueries?: boolean;
}

/**
 * Lightweight GraphQL Client wrapper around HTTPClient.
 */
export class GraphQLClient {
  private httpClient: HTTPClient;
  private enablePersistedQueries: boolean;

  constructor(endpoint: string, config: GraphQLClientConfig = {}) {
    this.enablePersistedQueries = !!config.enablePersistedQueries;
    this.httpClient = new HTTPClient({
      ...config,
      baseURL: endpoint,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...config.headers,
      },
    });
  }

  /**
   * Performs a GraphQL Query.
   */
  public async query<T>(
    query: string,
    variables?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<GraphQLResponse<T>> {
    return this.request<T>(query, variables, headers);
  }

  /**
   * Performs a GraphQL Mutation.
   */
  public async mutate<T>(
    mutation: string,
    variables?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<GraphQLResponse<T>> {
    return this.request<T>(mutation, variables, headers);
  }

  private async request<T>(
    query: string,
    variables?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<GraphQLResponse<T>> {
    if (this.enablePersistedQueries) {
      return this.persistedRequest<T>(query, variables, headers);
    }

    const response = await this.httpClient.post<GraphQLResponse<T>>(
      '', // Post to baseURL directly
      {
        query,
        variables,
      },
      {
        headers,
      }
    );

    return response.data;
  }

  private async persistedRequest<T>(
    query: string,
    variables?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<GraphQLResponse<T>> {
    const hash = await sha256(query);
    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: hash,
      },
    };

    // Try sending just the hash first
    try {
      const response = await this.httpClient.post<GraphQLResponse<T>>(
        '',
        {
          extensions,
          variables,
        },
        {
          headers,
          // Don't retry automatically on 4xx/5xx for this specific optimization flow
          // unless it's a network error, but we want to handle the specific GraphQL error manually
          retry: false,
        }
      );

      // Check for specific APQ errors if the server returns 200 OK but with errors
      if (response.data.errors) {
        const isPersistedQueryError = response.data.errors.some(
          (err) =>
            err.message === 'PersistedQueryNotFound' || err.message === 'PersistedQueryNotSupported'
        );
        if (isPersistedQueryError) {
          throw new Error('PersistedQueryNotFound');
        }
      }

      return response.data;
    } catch (error: unknown) {
      // If server doesn't recognize the hash (or other error), retry with full query
      // We check for specific error messages or status codes usually
      // Standard APQ returns "PersistedQueryNotFound" or similar
      const errMsg = (error as Error).message;
      const isAPQError =
        errMsg === 'PersistedQueryNotFound' ||
        (
          error as { response?: { data?: { errors?: Array<{ message: string }> } } }
        ).response?.data?.errors?.some((e) => e.message === 'PersistedQueryNotFound');

      if (isAPQError || errMsg.includes('PersistedQueryNotFound')) {
        // Retry with full query + hash
        const response = await this.httpClient.post<GraphQLResponse<T>>(
          '',
          {
            query,
            extensions,
            variables,
          },
          { headers }
        );
        return response.data;
      }

      throw error;
    }
  }

  /**
   * Access the underlying HTTPClient instance.
   */
  public get client(): HTTPClient {
    return this.httpClient;
  }
}
