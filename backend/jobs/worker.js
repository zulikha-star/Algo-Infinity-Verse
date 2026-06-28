import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { analyzeWorkflow } from '../repository-analyzer/cicdValidator.js';
import { VCSFactory } from '../vcs/VCSFactory.js';
import { batchStore, redisAvailable } from './queue.js';

// Only start the bullmq Worker if Redis is actually available.
// This prevents ECONNREFUSED spam when running without Redis locally.
if (redisAvailable) {
  const conn = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
  });

redisConnection.on('error', (err) => {
  console.warn('Redis Connection Error (worker):', err.message);
});

// Configure the worker process
export const auditWorker = new Worker('bulk-audit-queue', async (job) => {
  const { batchId, repoUrl } = job.data;
  
  if (!repoUrl || !repoUrl.includes("github.com")) {
    throw new Error("Invalid GitHub URL");
  }

    const provider = VCSFactory.getProvider(repoUrl);
    const workflows = await provider.getNormalizedWorkflows();

    let bestScore = 0;
    for (const wf of workflows) {
      const result = analyzeWorkflow(wf.commands);
      if (result.score > bestScore) bestScore = result.score;
    }

    return { repoUrl, score: bestScore };

  } catch (error) {
    console.error(`Job ${job.id} failed for repo ${repoUrl}:`, error.message);
    throw error;
  }
}, {
  connection: redisConnection,
  concurrency: 5 // Process up to 5 jobs simultaneously
});

auditWorker.on('error', (err) => {
  console.warn('Worker Redis Connection Error:', err.message);
});

// Event listeners for tracking batch progress
auditWorker.on('completed', (job, result) => {
  const { batchId } = job.data;
  const batch = batchStore.get(batchId);
  if (batch) {
    batch.completed += 1;
    batch.results.push(result);
  }
});

auditWorker.on('failed', (job, err) => {
  const { batchId } = job.data;
  const batch = batchStore.get(batchId);
  if (batch) {
    batch.failed += 1;
    batch.results.push({ repoUrl: job.data.repoUrl, error: err.message, score: 0 });
  }
});

console.log('Background Audit Worker started and listening for jobs...');


