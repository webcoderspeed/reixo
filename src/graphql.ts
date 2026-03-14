/**
 * reixo/graphql — GraphQL client
 *
 * @example
 * import { createGraphQLClient } from 'reixo/graphql';
 *
 * const gql = createGraphQLClient({
 *   endpoint: 'https://api.example.com/graphql',
 *   headers: { Authorization: `Bearer ${token}` },
 * });
 *
 * const result = await gql.query<{ user: User }>({
 *   query: `query GetUser($id: ID!) { user(id: $id) { id name } }`,
 *   variables: { id: '1' },
 * });
 */

export type { GraphQLClientConfig, GraphQLResponse } from './core/graphql-client';
export { GraphQLClient, GraphQLError } from './core/graphql-client';

import type { GraphQLClientConfig } from './core/graphql-client';
import { GraphQLClient } from './core/graphql-client';

/**
 * Convenience factory — same as `new GraphQLClient(endpoint, config)`
 */
export function createGraphQLClient(
  endpoint: string,
  config: GraphQLClientConfig = {}
): GraphQLClient {
  return new GraphQLClient(endpoint, config);
}
