import { Reixo } from '../src';

/**
 * Example 5: GraphQL Client
 * Demonstrates GraphQL queries and mutations using the GraphQLClient wrapper.
 */

async function runGraphQLDemo() {
  console.log('🚀 Running GraphQL Demo\n');

  // Using a public GraphQL API (e.g., SpaceX or similar, or just mocking)
  // For stability, we'll use a known public endpoint: https://spacex-production.up.railway.app/
  const endpoint = 'https://spacex-production.up.railway.app/';

  const client = new Reixo.GraphQLClient(endpoint, {
    timeoutMs: 10000,
  });

  // --- Query Example ---
  console.log('--- 1. GraphQL Query ---');

  const query = `
    query GetCompanyInfo {
      company {
        name
        ceo
        cto
      }
    }
  `;

  try {
    console.log('Fetching Company Info...');
    const result = await client.query<{ company: { name: string; ceo: string; cto: string } }>(
      query
    );

    if (result.data) {
      console.log('✅ Company:', result.data.company.name);
      console.log('👤 CEO:', result.data.company.ceo);
    } else {
      console.log('❌ No data returned');
    }
  } catch (error) {
    console.error('❌ Query Failed:', error);
  }

  // --- Query with Variables ---
  console.log('\n--- 2. Query with Variables ---');

  const dragonsQuery = `
    query GetDragon($id: ID!) {
      dragon(id: $id) {
        name
        description
      }
    }
  `;

  try {
    console.log('Fetching Dragon Info (dragon1)...');
    const result = await client.query<{ dragon: { name: string; description: string } }>(
      dragonsQuery,
      { id: 'dragon1' }
    );

    if (result.data && result.data.dragon) {
      console.log('✅ Dragon:', result.data.dragon.name);
      console.log('📝 Description:', result.data.dragon.description.substring(0, 50) + '...');
    } else {
      console.log('❌ No dragon data returned.');
      if (result.errors) {
        console.log('Errors:', JSON.stringify(result.errors, null, 2));
      }
    }
  } catch (error) {
    console.error('❌ Query Failed:', error);
  }

  console.log('\n✅ GraphQL Demo Finished');
}

runGraphQLDemo();
