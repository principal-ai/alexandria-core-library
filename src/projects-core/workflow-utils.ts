import { FileSystemAdapter } from "../pure-core/abstractions/filesystem";

/**
 * Check if a project has the Alexandria workflow installed
 * @param fs - File system adapter
 * @param projectPath - The path to the git repository
 * @returns True if the workflow exists
 */
export function hasAlexandriaWorkflow(
  fs: FileSystemAdapter,
  projectPath: string,
): boolean {
  const workflowPath = fs.join(
    projectPath,
    ".github",
    "workflows",
    "alexandria.yml",
  );
  return fs.exists(workflowPath);
}
