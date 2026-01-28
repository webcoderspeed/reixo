import { Reixo } from '../src';

async function runDemo() {
  console.log('🚀 Starting Reixo Demo with JSONPlaceholder\n');

  // 1. Setup Client with Builder
  const client = Reixo.HTTPBuilder.create('https://jsonplaceholder.typicode.com')
    .withTimeout(5000)
    .withRetry({
      maxRetries: 3,
      backoffFactor: 2
    })
    .addRequestInterceptor(config => {
      console.log(`[Req] ${config.method || 'GET'} ${config.url}`);
      return config;
    })
    .addResponseInterceptor(response => {
      console.log(`[Res] ${response.status} from ${response.config.url}`);
      return response;
    })
    .build();

  // 2. Setup Global Progress Listeners
  client.on('download:progress', (p: any) => {
    // Reduce noise
    if (p.progress && (p.progress % 50 === 0 || p.progress === 100)) {
       console.log(`[Download] ${p.url}: ${p.progress}%`);
    }
  });

  try {
    // 3. Basic GET Request
    console.log('\n--- 1. Fetching Single Post ---');
    const post = await client.get<{ id: number; title: string }>('/posts/1');
    console.log('✅ Fetched Post:', post.data.title);

    // 4. Queue System Demo
    console.log('\n--- 2. Queue System (Concurrency: 2) ---');
    const queue = new Reixo.TaskQueue({ concurrency: 2 });
    
    queue.on('task:start', ({ id }: any) => console.log(`[Queue] Task ${id} started`));
    queue.on('task:completed', ({ id }: any) => console.log(`[Queue] Task ${id} completed`));

    const postIds = [2, 3, 4, 5, 6];
    const tasks = postIds.map(id => 
      queue.add(async () => {
        // Add artificial delay to visualize concurrency
        await Reixo.delay(300); 
        const res = await client.get<{ id: number; title: string }>(`/posts/${id}`);
        return res.data;
      }, { id: `post-${id}` })
    );

    const results = await Promise.all(tasks);
    console.log(`✅ All ${results.length} queue tasks finished`);

    // 5. Retry & Error Handling Demo
    console.log('\n--- 3. Retry Logic (Simulating Network Error) ---');
    const startTime = Date.now();
    try {
      // Try a non-existent domain to trigger network error retry
      await Reixo.http('https://this-domain-does-not-exist-12345.com/posts/1', {
         method: 'GET',
         retry: { 
           maxRetries: 2, 
           initialDelayMs: 200,
           onRetry: (err: unknown, attempt: number) => console.log(`[Retry] Attempt ${attempt} failed, retrying...`)
         },
         timeoutMs: 1000
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`✅ Expected Error caught after ${duration}ms:`, (error as Error).message);
    }

    console.log('\n🎉 Demo Completed Successfully!');

  } catch (error) {
    console.error('❌ Demo Failed:', error);
  }
}

runDemo();
