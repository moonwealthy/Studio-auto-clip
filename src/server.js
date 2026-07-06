import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJobStore } from './lib/job-store.js';
import { createPipeline } from './lib/pipeline.js';
import { ensureDataDirectories, resolveDataPaths } from './lib/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function normalizeAspectRatios(rawValue) {
  const values = Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === 'string'
      ? rawValue.split(',')
      : [];

  const normalized = values
    .map((value) => String(value).trim())
    .filter(Boolean);

  return [...new Set(normalized)].slice(0, 5);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function classifySourceLabel(sourceUrl, fileName) {
  if (fileName) {
    return fileName;
  }

  if (sourceUrl?.includes('youtube.com') || sourceUrl?.includes('youtu.be')) {
    return 'YouTube source';
  }

  if (sourceUrl?.includes('tiktok.com')) {
    return 'TikTok source';
  }

  return 'External source';
}

async function createUploadsHandler(dataDir) {
  const paths = await ensureDataDirectories(dataDir);

  return multer({
    storage: multer.diskStorage({
      destination: (_request, _file, callback) => callback(null, paths.uploadsDir),
      filename: (_request, file, callback) => {
        const extension = path.extname(file.originalname || '');
        const baseName = path
          .basename(file.originalname || 'upload', extension)
          .replace(/[^a-zA-Z0-9-_]+/g, '-')
          .toLowerCase();
        callback(null, `${Date.now()}-${baseName || 'upload'}${extension}`);
      },
    }),
    limits: {
      fileSize: 300 * 1024 * 1024,
    },
  });
}

function buildSource({ file, sourceUrl }) {
  return {
    type: file ? 'upload' : 'url',
    label: classifySourceLabel(sourceUrl, file?.originalname),
    originalName: file?.originalname ?? null,
    mimeType: file?.mimetype ?? null,
    playbackUrl: file ? `/storage/uploads/${file.filename}` : sourceUrl,
    ingestReference: file ? file.path : sourceUrl,
  };
}

function validateRequest({ file, sourceUrl, clipCount, desiredClipLengthSec }) {
  if (!file && !sourceUrl) {
    return 'Provide either a video file or a source URL.';
  }

  if (clipCount < 1 || clipCount > 10) {
    return 'Clip count must be between 1 and 10.';
  }

  if (desiredClipLengthSec < 10 || desiredClipLengthSec > 120) {
    return 'Clip length must be between 10 and 120 seconds.';
  }

  return null;
}

export async function createApp({ dataDir = path.resolve(projectRoot, 'data') } = {}) {
  const app = express();
  const paths = resolveDataPaths(dataDir);
  const upload = await createUploadsHandler(dataDir);
  const jobStore = createJobStore({ dataDir });
  await jobStore.initialize();
  const pipeline = createPipeline({ dataDir, jobStore });

  app.use(express.json({ limit: '2mb' }));
  app.use('/storage', express.static(dataDir));
  app.use(express.static(path.join(projectRoot, 'public')));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.post('/api/jobs', (request, response, next) => {
    if (request.is('multipart/form-data')) {
      upload.single('videoFile')(request, response, (error) => {
        if (error) {
          next(error);
          return;
        }
        next();
      });
      return;
    }

    next();
  });

  app.post('/api/jobs', async (request, response) => {
    const sourceUrl = request.body.sourceUrl?.trim() || '';
    const options = {
      language: request.body.language || 'th',
      tone: request.body.tone || 'balanced',
      desiredClipLengthSec: parseNumber(request.body.desiredClipLengthSec, 30),
      clipCount: parseNumber(request.body.clipCount, 3),
      aspectRatios: normalizeAspectRatios(request.body.aspectRatios),
    };

    const error = validateRequest({
      file: request.file,
      sourceUrl,
      clipCount: options.clipCount,
      desiredClipLengthSec: options.desiredClipLengthSec,
    });

    if (error) {
      response.status(400).json({ error });
      return;
    }

    const job = await jobStore.create({
      source: buildSource({ file: request.file, sourceUrl }),
      transcriptHint: request.body.transcriptHint || '',
      options,
    });

    pipeline.enqueue(job.id);
    response.status(202).json(job);
  });

  app.get('/api/jobs/:jobId', async (request, response) => {
    const job = await jobStore.get(request.params.jobId);

    if (!job) {
      response.status(404).json({ error: 'Job not found.' });
      return;
    }

    response.json(job);
  });

  app.get('/api/jobs/:jobId/export', async (request, response) => {
    const job = await jobStore.get(request.params.jobId);

    if (!job?.artifacts?.manifestUrl) {
      response.status(404).json({ error: 'Export manifest is not ready yet.' });
      return;
    }

    const manifestPath = path.join(paths.exportsDir, path.basename(job.artifacts.manifestUrl));
    const raw = await fs.readFile(manifestPath, 'utf8');
    response.type('application/json').send(raw);
  });

  app.use((error, _request, response, _next) => {
    response.status(500).json({
      error: error.message || 'Unexpected server error.',
    });
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || 3000);
  const dataDir = process.env.APP_DATA_DIR || path.resolve(projectRoot, 'data');

  createApp({ dataDir })
    .then((app) => {
      app.listen(port, () => {
        console.log(`Studio auto clip listening on http://localhost:${port}`);
      });
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
