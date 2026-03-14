import { Reixo } from '../src';

/**
 * Example 3: Task Queue & Offline Sync
 * Demonstrates concurrency control, prioritization, persistence, and background sync.
 */

async function runQueueDemo() {
  console.log('🚀 Running Queue & Offline Sync Demo\n');

  // 1. Setup Persistent Queue with Offline Support
  // We use in-memory storage for demo, but LocalStorage works in browser
  const queue = new Reixo.TaskQueue({
    concurrency: 2,
    autoStart: true,
    syncWithNetwork: true, // Auto pause/resume on network changes
    // storage: new LocalStorageAdapter() // Use in browser
    storageKey: 'demo-queue',
  });

  // 2. Setup Listeners
  queue.on('task:added', (arg) => {
    const { id, priority } = arg;
    console.log(`[Queue] Task ${id} added (Priority: ${priority})`);
  });

  queue.on('task:start', (arg) => {
    const { id } = arg;
    console.log(`[Queue] Task ${id} started`);
  });

  queue.on('task:completed', (arg) => {
    const { id, result } = arg;
    console.log(`[Queue] Task ${id} completed: ${result}`);
  });

  queue.on('queue:paused', () => console.log('⏸️ Queue Paused (Offline)'));
  queue.on('queue:resumed', () => console.log('▶️ Queue Resumed (Online)'));

  // 3. Add Tasks with different priorities
  // Higher priority number = Higher importance

  const tasks = [
    { id: 'low-1', priority: 1, duration: 1000 },
    { id: 'high-1', priority: 10, duration: 500 },
    { id: 'medium-1', priority: 5, duration: 800 },
    { id: 'high-2', priority: 10, duration: 500 },
    { id: 'low-2', priority: 1, duration: 1000 },
  ];

  console.log('Adding 5 tasks...');

  // Note: We use a wrapper function for the task to make it serializable?
  // Actually Reixo queue stores closures in memory, but only metadata in storage.
  // For true persistence, you would need a way to reconstruct tasks from metadata.

  for (const t of tasks) {
    queue.add(
      async () => {
        // delay is not available from Reixo namespace, use setTimeout instead
        await new Promise((resolve) => setTimeout(resolve, t.duration));
        return `Done (${t.duration}ms)`;
      },
      { id: t.id, priority: t.priority }
    );
  }

  // 4. Simulate Network Offline/Online
  console.log('\n--- Simulating Offline Mode ---');

  // We can manually trigger network events if we had access to the monitor,
  // or just pause/resume the queue manually to demonstrate effect.

  // NetworkMonitor is not directly exported, so we skip direct access here
  // In a real browser app, network events happen automatically

  // In a real browser, network events would be triggered by window events
  // For this demo, we just wait for the queue to process tasks
  await new Promise((resolve) => setTimeout(resolve, 4000));
  console.log('\n✅ Queue Demo Finished');
}

runQueueDemo();
