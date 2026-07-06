const form = document.querySelector('#job-form');
const statusNode = document.querySelector('#form-status');
const jobEmpty = document.querySelector('#job-empty');
const jobView = document.querySelector('#job-view');
const jobMeta = document.querySelector('#job-meta');
const pipelineNode = document.querySelector('#pipeline');
const warningsNode = document.querySelector('#warnings');
const clipsNode = document.querySelector('#clips');
const videoNode = document.querySelector('#video-preview');
const manifestLink = document.querySelector('#manifest-link');

let pollTimer;

function formatSeconds(value) {
  const minutes = Math.floor(value / 60);
  const seconds = String(value % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function buildClipCard(clip) {
  const ratios = clip.renderPlanUrl
    ? `<a class="button-link" href="${clip.renderPlanUrl}" target="_blank" rel="noreferrer">Render plan</a>`
    : '';

  return `
    <article class="clip-card">
      <div class="status-pill">${clip.id}</div>
      <h3>${clip.title}</h3>
      <p>${clip.summary}</p>
      <div class="clip-times">
        <span>Start ${formatSeconds(clip.start)}</span>
        <span>End ${formatSeconds(clip.end)}</span>
        <span>${clip.duration}s</span>
      </div>
      <div class="clip-actions">
        <button data-start="${clip.start}" type="button">Jump preview</button>
        <a class="button-link" href="${clip.subtitleUrl}" target="_blank" rel="noreferrer">Subtitle VTT</a>
        ${ratios}
      </div>
    </article>
  `;
}

function renderJob(job) {
  jobEmpty.classList.add('hidden');
  jobView.classList.remove('hidden');

  jobMeta.innerHTML = `
    <p><strong>Status:</strong> ${job.status}</p>
    <p><strong>Source:</strong> ${job.source.label}</p>
    <p><strong>Language:</strong> ${job.options.language}</p>
    <p><strong>Tone:</strong> ${job.options.tone}</p>
    <p><strong>Ratios:</strong> ${job.options.aspectRatios.join(', ') || '9:16, 1:1, 16:9'}</p>
  `;

  pipelineNode.innerHTML = job.pipeline
    .map(
      (step) =>
        `<li><strong>${step.name}</strong> · ${step.status}${step.detail ? ` · ${step.detail}` : ''}</li>`,
    )
    .join('');

  warningsNode.innerHTML = (job.warnings || [])
    .map((warning) => `<p>${warning}</p>`)
    .join('');

  clipsNode.innerHTML = (job.clips || []).map(buildClipCard).join('');
  clipsNode.querySelectorAll('button[data-start]').forEach((button) => {
    button.addEventListener('click', () => {
      videoNode.currentTime = Number(button.dataset.start);
      videoNode.play().catch(() => undefined);
    });
  });

  if (job.source.playbackUrl) {
    videoNode.src = job.source.playbackUrl;
    videoNode.classList.remove('hidden');
  } else {
    videoNode.classList.add('hidden');
  }

  if (job.artifacts?.manifestUrl) {
    manifestLink.classList.remove('hidden');
    manifestLink.href = `/api/jobs/${job.id}/export`;
  } else {
    manifestLink.classList.add('hidden');
  }
}

async function loadJob(jobId) {
  const response = await fetch(`/api/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error('Unable to load job.');
  }

  const job = await response.json();
  renderJob(job);

  if (job.status === 'queued' || job.status === 'processing') {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => loadJob(jobId).catch(showError), 1500);
  }
}

function showError(error) {
  statusNode.textContent = error.message;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusNode.textContent = 'Submitting job...';

  try {
    const data = new FormData(form);
    if (!data.getAll('aspectRatios').length) {
      data.append('aspectRatios', '9:16');
    }

    const response = await fetch('/api/jobs', {
      method: 'POST',
      body: data,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Job creation failed.');
    }

    statusNode.textContent = 'Job queued.';
    const url = new URL(window.location.href);
    url.searchParams.set('job', payload.id);
    window.history.replaceState({}, '', url);
    loadJob(payload.id).catch(showError);
  } catch (error) {
    showError(error);
  }
});

const existingJobId = new URL(window.location.href).searchParams.get('job');
if (existingJobId) {
  loadJob(existingJobId).catch(showError);
}
