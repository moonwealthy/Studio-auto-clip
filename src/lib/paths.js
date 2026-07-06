import fs from 'node:fs/promises';
import path from 'node:path';

export function resolveDataPaths(dataDir = path.resolve(process.cwd(), 'data')) {
  return {
    dataDir,
    jobsDir: path.join(dataDir, 'jobs'),
    uploadsDir: path.join(dataDir, 'uploads'),
    exportsDir: path.join(dataDir, 'exports'),
  };
}

export async function ensureDataDirectories(dataDir) {
  const paths = resolveDataPaths(dataDir);

  await Promise.all(
    Object.values(paths).map((target) => fs.mkdir(target, { recursive: true })),
  );

  return paths;
}
