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
const MAX_FILE_SIZE_BYTES = 300 * 1024 * 1024;

function getUrlHostname(sourceUrl) {
  try {
    return new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isTrustedHostname(hostname, allowedHosts) {
  return allowedHosts.some((allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`));
}

function createRateLimit({ windowMs, maxRequests }) {
  const requests = new Map();

  return {
    check(request) {
      const key = request.ip || 'unknown';
      const now = Date.now();
      const recent = (requests.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

      if (recent.length >= maxRequests) {
        return false;
      }

      recent.push(now);
      requests.set(key, recent);
      return true;
    },
  };
}

function enforceRateLimit(limiter, request, response) {
  if (limiter.check(request)) {
    return false;
  }

  response.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  return true;
}

function validateJobId(jobId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId);
}

function readManifestPath(exportsDir, manifestUrl) {
  const fileName = path.basename(manifestUrl);
  const manifestPath = path.resolve(exportsDir, fileName);

  if (!manifestPath.startsWith(path.resolve(exportsDir) + path.sep)) {
    return null;
  }

  return manifestPath;
}

function parseApiError(error) {
  if (error instanceof multer.MulterError) {
    return {
      status: 400,
      message:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Uploaded files must be 300MB or smaller.'
          : error.message,
    };
  }

  if (error?.status && error?.message) {
    return { status: error.status, message: error.message };
  }

  return { status: 500, message: error.message || 'Unexpected server error.' };
}

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

  const hostname = getUrlHostname(sourceUrl);

  if (isTrustedHostname(hostname, ['youtube.com', 'youtu.be'])) {
    return 'YouTube source';
  }

  if (isTrustedHostname(hostname, ['tiktok.com'])) {
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
      fileSize: MAX_FILE_SIZE_BYTES,
    },
  });
}

function buildSource({ file, sourceUrl, creativeBrief }) {
  const sourceType = file ? 'upload' : sourceUrl ? 'url' : 'brief';
  return {
    type: sourceType,
    label:
      sourceType === 'brief'
        ? creativeBrief?.trim().slice(0, 60) || 'Affiliate concept'
        : classifySourceLabel(sourceUrl, file?.originalname),
    originalName: file?.originalname ?? null,
    mimeType: file?.mimetype ?? null,
    playbackUrl: file ? `/storage/uploads/${file.filename}` : sourceUrl || null,
    ingestReference: file ? file.path : sourceUrl || creativeBrief || null,
  };
}

function validateRequest({ file, sourceUrl, creativeBrief, clipCount, desiredClipLengthSec }) {
  if (!file && !sourceUrl && !creativeBrief?.trim()) {
    return 'Provide a creative brief, a video file, or a source URL.';
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
  const createJobRateLimit = createRateLimit({ windowMs: 60_000, maxRequests: 10 });
  const readJobRateLimit = createRateLimit({ windowMs: 60_000, maxRequests: 60 });

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
    if (enforceRateLimit(createJobRateLimit, request, response)) {
      return;
    }

    const sourceUrl = request.body.sourceUrl?.trim() || '';
    const creativeBrief = request.body.creativeBrief?.trim() || '';
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
      creativeBrief,
      clipCount: options.clipCount,
      desiredClipLengthSec: options.desiredClipLengthSec,
    });

    if (error) {
      response.status(400).json({ error });
      return;
    }

    const job = await jobStore.create({
      source: buildSource({ file: request.file, sourceUrl, creativeBrief }),
      creativeBrief,
      transcriptHint: request.body.transcriptHint || '',
      options,
    });

    pipeline.enqueue(job.id);
    response.status(202).json(job);
  });

  app.get('/api/jobs/:jobId', async (request, response) => {
    if (enforceRateLimit(readJobRateLimit, request, response)) {
      return;
    }

    if (!validateJobId(request.params.jobId)) {
      response.status(404).json({ error: 'Job not found.' });
      return;
    }

    const job = await jobStore.get(request.params.jobId);

    if (!job) {
      response.status(404).json({ error: 'Job not found.' });
      return;
    }

    response.json(job);
  });

  app.get('/api/jobs/:jobId/export', async (request, response) => {
    if (enforceRateLimit(readJobRateLimit, request, response)) {
      return;
    }

    if (!validateJobId(request.params.jobId)) {
      response.status(404).json({ error: 'Export manifest is not ready yet.' });
      return;
    }

    const job = await jobStore.get(request.params.jobId);

    if (!job?.artifacts?.manifestUrl) {
      response.status(404).json({ error: 'Export manifest is not ready yet.' });
      return;
    }

    const manifestPath = readManifestPath(paths.exportsDir, job.artifacts.manifestUrl);
    if (!manifestPath) {
      response.status(400).json({ error: 'Invalid export manifest path.' });
      return;
    }

    const raw = await fs.readFile(manifestPath, 'utf8');
    response.type('application/json').send(raw);
  });

  app.use((error, _request, response, _next) => {
    const normalized = parseApiError(error);
    response.status(normalized.status).json({
      error: normalized.message,
    });
  });

  return app;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
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
