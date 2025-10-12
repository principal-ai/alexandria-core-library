/**
 * Simplified Alexandria Bookmark System
 * Document-centric bookmarking without visit tracking
 */

/**
 * A bookmarked document in Alexandria
 * Represents a saved reference to a specific document/chapter
 */
export interface AlexandriaBookmark {
  id: string;

  // Document identification
  documentId: string; // Combined "owner/repo:chapterId" for unique identification
  volumeId: string; // Repository ID (owner/name)
  chapterId: string; // View/document ID

  // Document metadata
  title: string; // Document title
  description?: string; // Optional description

  // Bookmark metadata
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number; // How many times opened

  // Future: Could add
  // gitHash?: string;       // Specific version bookmarked
  // scrollPosition?: number; // Where in document
  // notes?: string;         // User notes
}

export type BookmarkSortOrder = "recent" | "alphabetical" | "mostAccessed";

/**
 * User preferences for bookmarking
 */
export interface BookmarkPreferences {
  sortOrder: BookmarkSortOrder;
  maxBookmarks: number;
}

/**
 * Stats about bookmark usage
 */
export interface BookmarkStats {
  totalBookmarks: number;
  storageUsed: number;
  oldestBookmark?: Date;
  newestBookmark?: Date;
  mostAccessedBookmark?: AlexandriaBookmark;
}
