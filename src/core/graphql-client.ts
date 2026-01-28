import { HTTPClient, HTTPClientConfig } from './http-client';

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

/**
 * Lightweight GraphQL Client wrapper around HTTPClient.
 */
export class GraphQLClient {
  private httpClient: HTTPClient;

  constructor(endpoint: string, config: Partial<HTTPClientConfig> = {}) {
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

  /**
   * Access the underlying HTTPClient instance.
   */
  public get client(): HTTPClient {
    return this.httpClient;
  }
}
