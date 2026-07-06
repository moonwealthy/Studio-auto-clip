import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';

test('server creates and completes an auto clip job', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-auto-clip-'));
  const app = await createApp({ dataDir });
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const form = new FormData();
    form.set('sourceUrl', 'https://example.com/demo.mp4');
    form.set(
      'transcriptHint',
      'This is the important hook. Here is how to solve the workflow. Final summary wraps it up.',
    );
    form.set('language', 'en');
    form.set('tone', 'educational');
    form.set('desiredClipLengthSec', '20');
    form.set('clipCount', '2');
    form.append('aspectRatios', '9:16');
    form.append('aspectRatios', '1:1');

    const createResponse = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      body: form,
    });

    assert.equal(createResponse.status, 202);
    const created = await createResponse.json();

    let completed;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const jobResponse = await fetch(`${baseUrl}/api/jobs/${created.id}`);
      completed = await jobResponse.json();
      if (completed.status === 'completed') {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.equal(completed.status, 'completed');
    assert.equal(completed.clips.length, 2);
    assert.ok(completed.artifacts.manifestUrl);

    const manifestResponse = await fetch(`${baseUrl}/api/jobs/${created.id}/export`);
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.clips.length, 2);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
