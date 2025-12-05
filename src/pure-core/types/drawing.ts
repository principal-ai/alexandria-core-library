/**
 * Drawing types for Excalidraw management
 */

/**
 * Represents Excalidraw data structure
 */
export interface ExcalidrawData {
  elements: unknown[];
  appState: {
    name: string;
    viewBackgroundColor?: string;
    gridSize?: number;
    [key: string]: unknown;
  };
  files?: Record<string, unknown>;
  libraryItems?: unknown[];
}
