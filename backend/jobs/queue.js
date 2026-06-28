import IORedis from 'ioredis';
import { Queue } from 'bullmq';

// A simple in-memory store to track batch progress
export const batchStore = new Map();

// ── Redis availability check ───────────────────────────────────────────────
// Test once at startup with a short timeout. If Redis isn't running we export
// no-op stubs so bullmq is never instantiated and the console stays clean.

let bulkAuditQueue = null;
let redisAvailable = false;

async function checkRedis() {
  const probe = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    retryStrategy: () => null,        // do NOT retry the probe connection
    enableOfflineQueue: false,
  });
  // Suppress the expected ECONNREFUSED on the probe instance
  probe.on('error', () => {});

  try {
    await probe.ping();
    redisAvailable = true;
  } catch {
    redisAvailable = false;
  } finally {
    probe.disconnect();
  }
}

redisConnection.on('error', (err) => {
  console.warn('Redis Connection Error (queue):', err.message);
});

// Create the shared queue instance
export const bulkAuditQueue = new Queue('bulk-audit-queue', {
  connection: redisConnection
});

bulkAuditQueue.on('error', (err) => {
  console.warn('Queue Redis Connection Error:', err.message);
});

// A simple in-memory store to track batch progress
// In a real production app, this would be stored in Redis or a DB.
export const batchStore = new Map();

/**
 * Enqueues a batch of repositories for analysis.
 */
export async function enqueueBulkAudit(batchId, repoUrls) {
  batchStore.set(batchId, {
    total: repoUrls.length,
    completed: 0,
    failed: 0,
    results: [],
    status: 'processing'
  });

  if (redisAvailable && bulkAuditQueue) {
    const jobs = repoUrls.map((url, index) => ({
      name: `audit-${batchId}-${index}`,
      data: { batchId, repoUrl: url }
    }));
    await bulkAuditQueue.addBulk(jobs);
    return;
  }

  // ── In-process fallback (no Redis) ───────────────────────────────────────
  setImmediate(async () => {
    const { analyzeWorkflow } = await import('../repository-analyzer/cicdValidator.js');
    const { VCSFactory } = await import('../vcs/VCSFactory.js');
    for (const url of repoUrls) {
      try {
        const provider = VCSFactory.getProvider(url);
        const workflows = await provider.getNormalizedWorkflows();
        let bestScore = 0;
        for (const wf of workflows) {
          const result = analyzeWorkflow(wf.commands);
          if (result.score > bestScore) bestScore = result.score;
        }
        const batch = batchStore.get(batchId);
        if (batch) { batch.completed += 1; batch.results.push({ repoUrl: url, score: bestScore }); }
      } catch (err) {
        const batch = batchStore.get(batchId);
        if (batch) { batch.failed += 1; batch.results.push({ repoUrl: url, error: err.message, score: 0 }); }
      }
    }
  });
}

/**
 * Gets the current progress of a batch.
 */
export function getBatchProgress(batchId) {
  const batch = batchStore.get(batchId);
  if (!batch) return null;

  const totalProcessed = batch.completed + batch.failed;
  const progress = batch.total > 0 ? Math.round((totalProcessed / batch.total) * 100) : 0;

  if (progress === 100) batch.status = 'completed';

  return { ...batch, progress };
}
