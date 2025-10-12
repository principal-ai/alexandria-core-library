/**
 * Drawing types for room-aware drawing management
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

/**
 * Drawing metadata with room associations
 */
export interface RoomDrawingMetadata {
  id: string;
  name: string; // Extracted from appState.name or file name
  fileName: string; // Actual file name in storage
  format: "excalidraw" | "svg" | "png";
  roomIds: string[]; // Rooms this drawing belongs to
  created: string;
  modified: string;
  fileSize: number;
}
