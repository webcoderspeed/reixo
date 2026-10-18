import { Reixo } from '../src';

// Example: Smart Polling for Long-Running Job Status
async function main() {
  console.log('🚀 Starting Smart Polling Example...');

  // Mock API client
  interface JobStatus {
    status: string;
    progress?: number;
    result?: string;
  }

  let attempts = 0;
  const mockApi = {
    checkStatus: async (jobId: string): Promise<JobStatus> => {
      attempts++;
      console.log(`🔍 Checking status for job ${jobId} (Attempt ${attempts})...`);

      // Simulate processing delay
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (attempts < 5) {
        return { status: 'processing', progress: attempts * 20 };
      }
      return { status: 'completed', result: 'Job finished successfully!' };
    },
  };

  try {
    console.log('⏳ Starting poll for job "job-123"...');

    const { promise } = Reixo.poll<JobStatus>(async () => await mockApi.checkStatus('job-123'), {
      interval: 1000, // Start with 1s interval
      timeout: 30000, // Stop after 30 seconds
      maxAttempts: 10, // Or max 10 attempts
      stopCondition: (response) => {
        const isDone = response.status === 'completed';
        if (!isDone) {
          console.log(`   Status: ${response.status}, Progress: ${response.progress}%`);
        }
        return isDone;
      },
      backoff: {
        factor: 1.5, // Increase interval by 50% each time
        maxInterval: 5000, // Max 5s interval
      },
    });

    const result = await promise;

    console.log('✅ Polling finished!');
    console.log('🎉 Result:', result);
  } catch (error) {
    console.error('❌ Polling failed:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
