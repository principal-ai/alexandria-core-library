import { ALEXANDRIA_DIRS } from "../constants/paths";
import { ValidatedRepositoryPath } from "../pure-core/types";
import { FileSystemAdapter } from "../pure-core/abstractions/filesystem";

/**
 * Gets the Alexandria data directory for a project
 */
export function getAlexandriaDir(
  fs: FileSystemAdapter,
  projectRoot: ValidatedRepositoryPath,
): string {
  return fs.join(projectRoot, ALEXANDRIA_DIRS.PRIMARY);
}

/**
 * Gets a specific subdirectory within the Alexandria directory
 */
export function getAlexandriaSubdir(
  fs: FileSystemAdapter,
  projectRoot: ValidatedRepositoryPath,
  subdir: string,
): string {
  return fs.join(getAlexandriaDir(fs, projectRoot), subdir);
}

/**
 * Gets the views directory with fallback support
 */
export function getViewsDir(
  fs: FileSystemAdapter,
  projectRoot: ValidatedRepositoryPath,
): string {
  return getAlexandriaSubdir(fs, projectRoot, ALEXANDRIA_DIRS.VIEWS);
}

/**
 * Gets the notes directory with fallback support
 */
export function getNotesDir(
  fs: FileSystemAdapter,
  projectRoot: ValidatedRepositoryPath,
): string {
  return getAlexandriaSubdir(fs, projectRoot, ALEXANDRIA_DIRS.NOTES);
}

/**
 * Gets the overviews directory with fallback support
 */
export function getOverviewsDir(
  fs: FileSystemAdapter,
  projectRoot: ValidatedRepositoryPath,
): string {
  return getAlexandriaSubdir(fs, projectRoot, ALEXANDRIA_DIRS.OVERVIEWS);
}
