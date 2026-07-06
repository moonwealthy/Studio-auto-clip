import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDataDirectories, resolveDataPaths } from './paths.js';

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jobFilePath(jobsDir, jobId) {
  return path.join(jobsDir, `${jobId}.json`);
}

export function createJobStore({ dataDir }) {
  const cache = new Map();
  const paths = resolveDataPaths(dataDir);

  async function persist(job) {
    await fs.writeFile(jobFilePath(paths.jobsDir, job.id), JSON.stringify(job, null, 2));
    cache.set(job.id, job);
    return job;
  }

  return {
    async initialize() {
      await ensureDataDirectories(dataDir);
      const entries = await fs.readdir(paths.jobsDir, { withFileTypes: true });

      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map(async (entry) => {
            const raw = await fs.readFile(path.join(paths.jobsDir, entry.name), 'utf8');
            const job = JSON.parse(raw);
            cache.set(job.id, job);
          }),
      );
    },
    async create(input) {
      const now = new Date().toISOString();
      const job = {
        id: randomUUID(),
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        warnings: [],
        pipeline: [],
        transcript: [],
        clips: [],
        artifacts: {},
        ...input,
      };

      return persist(job);
    },
    async update(jobId, patch) {
      const current = await this.get(jobId);
      if (!current) {
        return null;
      }

      return persist({
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
    },
    async get(jobId) {
      if (!JOB_ID_PATTERN.test(jobId)) {
        return null;
      }

      return cache.get(jobId) ?? null;
    },
  };
}
