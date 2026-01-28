import { describe, it, expect, vi, afterEach } from 'vitest';
import { GraphQLClient } from '../src/core/graphql-client';
import * as httpUtils from '../src/utils/http';

describe('GraphQLClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should make a query request', async () => {
    const client = new GraphQLClient('https://api.graphql.com/query');

    const httpSpy = vi.spyOn(httpUtils, 'http').mockResolvedValue({
      data: {
        data: {
          user: { id: 1, name: 'Test' },
        },
      },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      config: {},
    });

    const query = `
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
        }
      }
    `;

    const result = await client.query(query, { id: 1 });

    expect(httpSpy).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        baseURL: 'https://api.graphql.com/query',
        method: 'POST',
        body: expect.stringContaining('"query"'),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(JSON.parse(httpSpy.mock.calls[0][1]?.body as string)).toEqual({
      query,
      variables: { id: 1 },
    });

    expect(result).toEqual({
      data: {
        user: { id: 1, name: 'Test' },
      },
    });
  });

  it('should make a mutation request', async () => {
    const client = new GraphQLClient('https://api.graphql.com/query');

    const httpSpy = vi.spyOn(httpUtils, 'http').mockResolvedValue({
      data: {
        data: {
          createUser: { id: 2, name: 'New' },
        },
      },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      config: {},
    });

    const mutation = `
      mutation CreateUser($name: String!) {
        createUser(name: $name) {
          id
          name
        }
      }
    `;

    const result = await client.mutate(mutation, { name: 'New' });

    expect(httpSpy).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        baseURL: 'https://api.graphql.com/query',
        method: 'POST',
      })
    );

    expect(result).toEqual({
      data: {
        createUser: { id: 2, name: 'New' },
      },
    });
  });

  it('should handle GraphQL errors', async () => {
    const client = new GraphQLClient('https://api.graphql.com/query');

    vi.spyOn(httpUtils, 'http').mockResolvedValue({
      data: {
        errors: [{ message: 'Cannot query field "unknown" on type "User".' }],
      },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      config: {},
    });

    const result = await client.query('{ user { unknown } }');

    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].message).toContain('Cannot query field');
  });

  it('should expose underlying HTTPClient', () => {
    const client = new GraphQLClient('https://api.graphql.com');
    expect(client.client).toBeDefined();
    expect(client.client.interceptors).toBeDefined();
  });
});
