/**
 * Example 12: GraphQL Client
 *
 * Demonstrates GraphQLClient for querying and mutating GraphQL APIs.
 * Uses the public SpaceX GraphQL API (no authentication required).
 *
 * Run:  npx tsx examples/12-graphql.ts
 */

import { GraphQLClient, GraphQLError } from '../src';

const ENDPOINT = 'https://spacex-production.up.railway.app/';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface Company {
  name: string;
  ceo: string;
  cto: string;
  founded: number;
  employees: number;
  summary: string;
}

interface Launch {
  id: string;
  mission_name: string;
  launch_year: string;
  launch_success: boolean | null;
  rocket: { rocket_name: string };
  links: { wikipedia: string | null };
}

interface Rocket {
  id: string;
  name: string;
  country: string;
  first_flight: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Scenario 1 — Simple query (company info)
// ---------------------------------------------------------------------------

async function demo_simpleQuery(): Promise<void> {
  console.log('\n--- 1. Simple query — company info ---');

  const client = new GraphQLClient(ENDPOINT, { timeoutMs: 10_000 });

  const query = `
    query CompanyInfo {
      company {
        name
        ceo
        cto
        founded
        employees
      }
    }
  `;

  const result = await client.query<{ company: Company }>(query);

  if (result.errors?.length) {
    console.log('  GraphQL errors:', result.errors.map((e) => e.message).join(', '));
    return;
  }

  const c = result.data!.company;
  console.log(`  Company : ${c.name}`);
  console.log(`  CEO     : ${c.ceo}`);
  console.log(`  CTO     : ${c.cto}`);
  console.log(`  Founded : ${c.founded}`);
  console.log(`  Staff   : ${c.employees.toLocaleString()}`);
}

// ---------------------------------------------------------------------------
// Scenario 2 — Query with variables
// ---------------------------------------------------------------------------

async function demo_queryWithVariables(): Promise<void> {
  console.log('\n--- 2. Query with variables --- ');

  const client = new GraphQLClient(ENDPOINT, { timeoutMs: 10_000 });

  const query = `
    query RecentLaunches($limit: Int!, $offset: Int) {
      launches(limit: $limit, offset: $offset) {
        id
        mission_name
        launch_year
        launch_success
        rocket {
          rocket_name
        }
      }
    }
  `;

  const result = await client.query<{ launches: Launch[] }>(query, {
    limit: 5,
    offset: 0,
  });

  if (result.errors?.length) {
    console.log('  GraphQL errors:', result.errors.map((e) => e.message).join(', '));
    return;
  }

  console.log('  Recent launches:');
  for (const launch of result.data!.launches) {
    const success = launch.launch_success === null ? '?' : launch.launch_success ? '✓' : '✗';
    console.log(
      `    [${success}] ${launch.mission_name} (${launch.launch_year}) — ${launch.rocket.rocket_name}`
    );
  }
}

// ---------------------------------------------------------------------------
// Scenario 3 — Query with custom request headers
// ---------------------------------------------------------------------------

async function demo_customHeaders(): Promise<void> {
  console.log('\n--- 3. Per-request custom headers ---');

  const client = new GraphQLClient(ENDPOINT, { timeoutMs: 10_000 });

  const query = `
    query GetRockets {
      rockets {
        id
        name
        country
        first_flight
      }
    }
  `;

  const result = await client.query<{ rockets: Rocket[] }>(
    query,
    undefined,
    // Pass custom headers for this specific request
    {
      'X-Request-Source': 'reixo-example',
      Accept: 'application/json',
    }
  );

  if (result.errors?.length) {
    console.log('  GraphQL errors:', result.errors.map((e) => e.message).join(', '));
    return;
  }

  console.log('  Rockets:');
  for (const rocket of result.data!.rockets) {
    console.log(`    ${rocket.name} (${rocket.country}, first flight: ${rocket.first_flight})`);
  }
}

// ---------------------------------------------------------------------------
// Scenario 4 — Error handling
// ---------------------------------------------------------------------------

async function demo_errorHandling(): Promise<void> {
  console.log('\n--- 4. Error handling ---');

  const client = new GraphQLClient(ENDPOINT, { timeoutMs: 5_000 });

  // Intentionally malformed query
  const badQuery = `
    query BadQuery {
      nonExistentField {
        id
      }
    }
  `;

  const result = await client.query(badQuery);

  if (result.errors && result.errors.length > 0) {
    console.log('  GraphQL errors received (expected):');
    result.errors.forEach((err: GraphQLError) => {
      console.log(`    - ${err.message}`);
      if (err.path) console.log(`      path: ${err.path.join('.')}`);
    });
  } else {
    console.log('  Unexpected: no errors returned');
  }
}

// ---------------------------------------------------------------------------
// Scenario 5 — Multiple queries in parallel
// ---------------------------------------------------------------------------

async function demo_parallel(): Promise<void> {
  console.log('\n--- 5. Parallel queries ---');

  const client = new GraphQLClient(ENDPOINT, { timeoutMs: 10_000 });

  const companyQuery = `query { company { name ceo } }`;
  const rocketQuery = `query { rockets { name country } }`;

  const [companyResult, rocketResult] = await Promise.all([
    client.query<{ company: Company }>(companyQuery),
    client.query<{ rockets: Rocket[] }>(rocketQuery),
  ]);

  const company = companyResult.data?.company;
  const rockets = rocketResult.data?.rockets ?? [];

  console.log(`  Company: ${company?.name ?? 'unknown'} — CEO: ${company?.ceo ?? 'unknown'}`);
  console.log(`  Rockets: ${rockets.map((r) => r.name).join(', ')}`);
}

// ---------------------------------------------------------------------------
// Scenario 6 — Persisted queries (APQ)
// ---------------------------------------------------------------------------

async function demo_persistedQueries(): Promise<void> {
  console.log('\n--- 6. Automatic Persisted Queries (APQ) ---');

  // Enable APQ — reixo sends a SHA-256 hash first; if the server has the
  // query cached it returns data immediately without re-parsing the full query.
  // If the server doesn't recognise the hash it returns a "PersistedQueryNotFound"
  // error, and reixo automatically retries with the full query string.
  const client = new GraphQLClient(ENDPOINT, {
    enablePersistedQueries: true,
    timeoutMs: 10_000,
  });

  const query = `
    query CompanyName {
      company {
        name
      }
    }
  `;

  // First call — may fall back to full query if server doesn't support APQ
  const result = await client.query<{ company: { name: string } }>(query);
  console.log('  Company via APQ:', result.data?.company?.name ?? 'unavailable');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== reixo GraphQL examples ===');
  console.log('(Using the public SpaceX GraphQL API)');

  try {
    await demo_simpleQuery();
    await demo_queryWithVariables();
    await demo_customHeaders();
    await demo_errorHandling();
    await demo_parallel();
    await demo_persistedQueries();
  } catch (err) {
    console.error(
      '\nFailed — the SpaceX API may be temporarily unavailable:',
      (err as Error).message
    );
  }

  console.log('\nAll GraphQL demos complete.');
}

main().catch(console.error);
