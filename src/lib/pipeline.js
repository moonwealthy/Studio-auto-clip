import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirectories } from './paths.js';
import {
  assignAffiliateStyles,
  createAffiliateClips,
  createAffiliateStrategy,
  createAffiliateTranscript,
} from './affiliate.js';
import { createTranscriptSegments } from './transcript.js';
import { detectHighlights } from './highlights.js';
import { generateVtt } from './subtitles.js';

function normalizeAspectRatios(aspectRatios = []) {
  const unique = [...new Set(aspectRatios.filter(Boolean))];
  return unique.length ? unique : ['9:16', '1:1', '16:9'];
}

function pipelineStep(name, status, metadata = {}) {
  return {
    name,
    status,
    updatedAt: new Date().toISOString(),
    ...metadata,
  };
}

export function createPipeline({ dataDir, jobStore }) {
  let running = new Set();

  async function writeArtifacts(job, clips) {
    const paths = await ensureDataDirectories(dataDir);
    const manifest = {
      jobId: job.id,
      source: job.source,
      options: job.options,
      creativeBrief: job.creativeBrief,
      creativeStrategy: job.creativeStrategy,
      warnings: job.warnings,
      transcript: job.transcript,
      clips: [],
    };

    for (const clip of clips) {
      const vtt = generateVtt(clip.transcriptSegments, clip.start);
      const vttFileName = `${job.id}-${clip.id}.vtt`;
      const planFileName = `${job.id}-${clip.id}.json`;
      const exportPlan = {
        jobId: job.id,
        clipId: clip.id,
        title: clip.title,
        start: clip.start,
        end: clip.end,
        duration: clip.duration,
        affiliateStyle: clip.affiliateStyle ?? null,
        subtitleFile: `/storage/exports/${vttFileName}`,
        renderTargets: job.options.aspectRatios.map((ratio) => ({
          ratio,
          outputFileName: `${job.id}-${clip.id}-${ratio.replace(':', 'x')}.mp4`,
          notes: [
            'Trim source to the requested range.',
            'Burn the generated VTT subtitles into the render.',
            'Apply brand styling and safe-title positioning in the chosen aspect ratio.',
          ],
        })),
      };

      await fs.writeFile(path.join(paths.exportsDir, vttFileName), vtt);
      await fs.writeFile(path.join(paths.exportsDir, planFileName), JSON.stringify(exportPlan, null, 2));

      manifest.clips.push({
        ...clip,
        subtitleUrl: `/storage/exports/${vttFileName}`,
        renderPlanUrl: `/storage/exports/${planFileName}`,
      });
    }

    const manifestFileName = `${job.id}-manifest.json`;
    await fs.writeFile(
      path.join(paths.exportsDir, manifestFileName),
      JSON.stringify(manifest, null, 2),
    );

    return {
      manifestUrl: `/storage/exports/${manifestFileName}`,
      clips: manifest.clips,
    };
  }

  async function processJob(jobId) {
    if (running.has(jobId)) {
      return;
    }

    running.add(jobId);

    try {
      let job = await jobStore.get(jobId);
      if (!job) {
        return;
      }

      job = await jobStore.update(job.id, {
        status: 'processing',
        pipeline: [
          pipelineStep('ingest', 'completed', { detail: 'Source accepted' }),
          pipelineStep('creative-strategy', job.creativeBrief?.trim() ? 'running' : 'skipped'),
          pipelineStep('transcription', 'running'),
          pipelineStep('highlight-detection', 'pending'),
          pipelineStep('clip-generation', 'pending'),
          pipelineStep('publishing', 'pending'),
        ],
      });

      const creativeStrategy = job.creativeBrief?.trim()
        ? createAffiliateStrategy({
            creativeBrief: job.creativeBrief,
            language: job.options.language,
            tone: job.options.tone,
            clipCount: job.options.clipCount,
            sourceLabel: job.source.label,
          })
        : null;

      const transcript =
        creativeStrategy && job.source.type === 'brief'
          ? createAffiliateTranscript({
              strategy: creativeStrategy,
              desiredClipLengthSec: job.options.desiredClipLengthSec,
              language: job.options.language,
            })
          : createTranscriptSegments({
              transcriptHint:
                job.transcriptHint || creativeStrategy?.styles.map((style) => style.hook).join('\n'),
              language: job.options.language,
              sourceLabel: creativeStrategy?.productName || job.source.label,
            });

      const warnings = [...job.warnings];
      if (!job.transcriptHint?.trim() && job.source.type !== 'brief') {
        warnings.push(
          'No transcript hint was provided, so the demo generated a fallback transcript scaffold.',
        );
      }
      if (creativeStrategy) {
        warnings.push(
          'Affiliate creative mode is enabled, so the system generated style variants, hooks, and CTA guidance from the brief automatically.',
        );
      }

      job = await jobStore.update(job.id, {
        creativeStrategy,
        transcript,
        warnings,
        pipeline: [
          pipelineStep('ingest', 'completed', { detail: 'Source accepted' }),
          pipelineStep(
            'creative-strategy',
            creativeStrategy ? 'completed' : 'skipped',
            creativeStrategy
              ? { detail: `${creativeStrategy.styles.length} affiliate styles prepared` }
              : { detail: 'No affiliate brief supplied' },
          ),
          pipelineStep('transcription', 'completed', { detail: `${transcript.length} transcript segments` }),
          pipelineStep('highlight-detection', 'running'),
          pipelineStep('clip-generation', 'pending'),
          pipelineStep('publishing', 'pending'),
        ],
      });

      const clips =
        creativeStrategy && job.source.type === 'brief'
          ? createAffiliateClips({
              strategy: creativeStrategy,
              transcript,
              desiredClipLengthSec: job.options.desiredClipLengthSec,
            })
          : assignAffiliateStyles(
              detectHighlights({
                segments: transcript,
                language: job.options.language,
                tone: job.options.tone,
                desiredClipLengthSec: job.options.desiredClipLengthSec,
                clipCount: job.options.clipCount,
                sourceLabel: creativeStrategy?.productName || job.source.label,
              }),
              creativeStrategy ?? {
                styles: [
                  {
                    key: 'default',
                    name: 'Balanced Highlight',
                    hook: 'Lead with the strongest line.',
                    angle: 'Use captions, proof, and a clean CTA.',
                    cta: 'End with a clear next action.',
                    visualDirection: 'Talking head or source footage with dynamic captions',
                  },
                ],
              },
            );

      job = await jobStore.update(job.id, {
        clips,
        pipeline: [
          pipelineStep('ingest', 'completed', { detail: 'Source accepted' }),
          pipelineStep(
            'creative-strategy',
            creativeStrategy ? 'completed' : 'skipped',
            creativeStrategy
              ? { detail: `${creativeStrategy.styles.length} affiliate styles prepared` }
              : { detail: 'No affiliate brief supplied' },
          ),
          pipelineStep('transcription', 'completed', { detail: `${transcript.length} transcript segments` }),
          pipelineStep('highlight-detection', 'completed', { detail: `${clips.length} highlight candidates` }),
          pipelineStep('clip-generation', 'running'),
          pipelineStep('publishing', 'pending'),
        ],
      });

      const artifacts = await writeArtifacts(
        {
          ...job,
          transcript,
          options: {
            ...job.options,
            aspectRatios: normalizeAspectRatios(job.options.aspectRatios),
          },
        },
        clips,
      );

      await jobStore.update(job.id, {
        status: 'completed',
        clips: artifacts.clips,
        artifacts,
        pipeline: [
          pipelineStep('ingest', 'completed', { detail: 'Source accepted' }),
          pipelineStep(
            'creative-strategy',
            creativeStrategy ? 'completed' : 'skipped',
            creativeStrategy
              ? { detail: `${creativeStrategy.styles.length} affiliate styles prepared` }
              : { detail: 'No affiliate brief supplied' },
          ),
          pipelineStep('transcription', 'completed', { detail: `${transcript.length} transcript segments` }),
          pipelineStep('highlight-detection', 'completed', { detail: `${clips.length} highlight candidates` }),
          pipelineStep('clip-generation', 'completed', { detail: 'Preview and subtitle plans generated' }),
          pipelineStep('publishing', 'completed', { detail: 'Manifest and VTT files exported' }),
        ],
      });
    } catch (error) {
      await jobStore.update(jobId, {
        status: 'failed',
        pipeline: [pipelineStep('publishing', 'failed', { detail: error.message })],
        error: error.message,
      });
    } finally {
      running.delete(jobId);
    }
  }

  return {
    enqueue(jobId) {
      setTimeout(() => {
        processJob(jobId).catch(() => undefined);
      }, 0);
    },
  };
}
