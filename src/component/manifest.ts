import fs from 'fs';
import path from 'path';

export const resolveExistingPath = (filePath: string) =>
  fs.realpathSync(path.resolve(filePath));

export const posixRel = (from: string, to: string) => {
  const fromReal = fs.existsSync(from)
    ? fs.realpathSync(from)
    : path.resolve(from);
  const toReal = fs.existsSync(to) ? fs.realpathSync(to) : path.resolve(to);
  return path.relative(fromReal, toReal).split(path.sep).join('/');
};
