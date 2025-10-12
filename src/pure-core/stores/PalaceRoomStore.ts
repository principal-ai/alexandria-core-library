/**
 * PalaceRoomStore - Storage and management for palace rooms in memory palace
 */

import { FileSystemAdapter } from "../abstractions/filesystem";
import type { ValidatedAlexandriaPath } from "../types/repository";
import type {
  PalaceRoom,
  CreatePalaceRoomOptions,
  UpdatePalaceRoomOptions,
  PalaceRoomOperationResult,
} from "../types/palace-room";
import type { PalacePortal, CreatePortalOptions } from "../types/palace-portal";
import { generateId } from "../utils/idGenerator";

const PALACE_ROOMS_DIR = "palace-rooms";

/**
 * Store for managing palace rooms
 */
export class PalaceRoomStore {
  private fs: FileSystemAdapter;
  private alexandriaPath: ValidatedAlexandriaPath;
  private palaceRoomsPath: string;

  constructor(fs: FileSystemAdapter, alexandriaPath: ValidatedAlexandriaPath) {
    this.fs = fs;
    this.alexandriaPath = alexandriaPath;
    this.palaceRoomsPath = this.fs.join(alexandriaPath, PALACE_ROOMS_DIR);
    // Lazy initialization - don't create directory or default room until needed
  }

  /**
   * Ensure the palace rooms directory exists
   */
  private ensureDirectoryExists(): void {
    if (!this.fs.exists(this.palaceRoomsPath)) {
      this.fs.createDir(this.palaceRoomsPath);
    }
  }

  /**
   * Get the path for a palace room file
   */
  private getRoomPath(roomId: string): string {
    return this.fs.join(this.palaceRoomsPath, `${roomId}.json`);
  }

  /**
   * List all palace rooms
   */
  listRooms(): PalaceRoom[] {
    if (!this.fs.exists(this.palaceRoomsPath)) {
      return [];
    }

    const files = this.fs.readDir(this.palaceRoomsPath);
    const rooms: PalaceRoom[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const roomPath = this.fs.join(this.palaceRoomsPath, file);
        try {
          const content = this.fs.readFile(roomPath);
          const room = JSON.parse(content) as PalaceRoom;
          rooms.push(room);
        } catch (error) {
          console.error(`Failed to load palace room from ${file}:`, error);
        }
      }
    }

    // Sort by displayOrder, then by name
    return rooms.sort((a, b) => {
      if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder;
        }
      } else if (a.displayOrder !== undefined) {
        return -1;
      } else if (b.displayOrder !== undefined) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get a specific palace room by ID
   */
  getRoom(roomId: string): PalaceRoom | null {
    const roomPath = this.getRoomPath(roomId);

    if (!this.fs.exists(roomPath)) {
      return null;
    }

    try {
      const content = this.fs.readFile(roomPath);
      return JSON.parse(content) as PalaceRoom;
    } catch (error) {
      console.error(`Failed to load palace room ${roomId}:`, error);
      return null;
    }
  }

  /**
   * Create a new palace room
   */
  createRoom(options: CreatePalaceRoomOptions): PalaceRoomOperationResult {
    try {
      this.ensureDirectoryExists();

      const roomId = generateId();
      const now = new Date().toISOString();

      const room: PalaceRoom = {
        id: roomId,
        name: options.name,
        description: options.description,
        drawingIds: [],
        codebaseViewIds: [],
        noteIds: [],
        portals: [],
        createdAt: now,
        updatedAt: now,
        color: options.color,
        icon: options.icon,
        displayOrder: options.displayOrder,
        metadata: options.metadata,
      };

      const roomPath = this.getRoomPath(roomId);
      this.fs.writeFile(roomPath, JSON.stringify(room, null, 2));

      return {
        success: true,
        palaceRoom: room,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create palace room: ${error}`,
      };
    }
  }

  /**
   * Update a palace room
   */
  updateRoom(
    roomId: string,
    options: UpdatePalaceRoomOptions,
  ): PalaceRoomOperationResult {
    try {
      const room = this.getRoom(roomId);
      if (!room) {
        return {
          success: false,
          error: `Palace room ${roomId} not found`,
        };
      }

      const updatedRoom: PalaceRoom = {
        ...room,
        name: options.name ?? room.name,
        description: options.description ?? room.description,
        color: options.color ?? room.color,
        icon: options.icon ?? room.icon,
        displayOrder: options.displayOrder ?? room.displayOrder,
        metadata: options.metadata ?? room.metadata,
        updatedAt: new Date().toISOString(),
      };

      const roomPath = this.getRoomPath(roomId);
      this.fs.writeFile(roomPath, JSON.stringify(updatedRoom, null, 2));

      return {
        success: true,
        palaceRoom: updatedRoom,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update palace room: ${error}`,
      };
    }
  }

  /**
   * Delete a palace room
   */
  deleteRoom(roomId: string): boolean {
    try {
      const room = this.getRoom(roomId);
      if (!room) {
        return false;
      }

      // Check if room has content
      if (
        room.drawingIds.length > 0 ||
        room.codebaseViewIds.length > 0 ||
        room.noteIds.length > 0
      ) {
        console.error(
          "Cannot delete palace room with content. Remove all content first.",
        );
        return false;
      }

      const roomPath = this.getRoomPath(roomId);
      this.fs.deleteFile(roomPath);
      return true;
    } catch (error) {
      console.error(`Failed to delete palace room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Add a drawing to a palace room
   */
  addDrawingToRoom(roomId: string, drawingId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room) {
      return false;
    }

    if (!room.drawingIds.includes(drawingId)) {
      room.drawingIds.push(drawingId);
      room.updatedAt = new Date().toISOString();
      const roomPath = this.getRoomPath(roomId);
      this.fs.writeFile(roomPath, JSON.stringify(room, null, 2));
      return true;
    }

    return false;
  }

  /**
   * Remove a drawing from a palace room
   */
  removeDrawingFromRoom(roomId: string, drawingId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room) {
      return false;
    }

    const index = room.drawingIds.indexOf(drawingId);
    if (index > -1) {
      room.drawingIds.splice(index, 1);
      room.updatedAt = new Date().toISOString();
      const roomPath = this.getRoomPath(roomId);
      this.fs.writeFile(roomPath, JSON.stringify(room, null, 2));
      return true;
    }

    return false;
  }

  /**
   * Add a codebase view to a palace room
   */
  addCodebaseViewToRoom(roomId: string, viewId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room) {
      return false;
    }

    if (!room.codebaseViewIds.includes(viewId)) {
      room.codebaseViewIds.push(viewId);
      room.updatedAt = new Date().toISOString();
      const roomPath = this.getRoomPath(roomId);
      this.fs.writeFile(roomPath, JSON.stringify(room, null, 2));
      return true;
    }

    return false;
  }

  /**
   * Remove a codebase view from a palace room
   */
  removeCodebaseViewFromRoom(roomId: string, viewId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room) {
      return false;
    }

    const index = room.codebaseViewIds.indexOf(viewId);
    if (index > -1) {
      room.codebaseViewIds.splice(index, 1);
      room.updatedAt = new Date().toISOString();
      const roomPath = this.getRoomPath(roomId);
      this.fs.writeFile(roomPath, JSON.stringify(room, null, 2));
      return true;
    }

    return false;
  }

  /**
   * Add a note to a palace room
   */
  addNoteToRoom(roomId: string, noteId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room) {
      return false;
    }

    if (!room.noteIds.includes(noteId)) {
      room.noteIds.push(noteId);
      room.updatedAt = new Date().toISOString();
      const roomPath = this.getRoomPath(roomId);
      this.fs.writeFile(roomPath, JSON.stringify(room, null, 2));
      return true;
    }

    return false;
  }

  /**
   * Remove a note from a palace room
   */
  removeNoteFromRoom(roomId: string, noteId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room) {
      return false;
    }

    const index = room.noteIds.indexOf(noteId);
    if (index > -1) {
      room.noteIds.splice(index, 1);
      room.updatedAt = new Date().toISOString();
      const roomPath = this.getRoomPath(roomId);
      this.fs.writeFile(roomPath, JSON.stringify(room, null, 2));
      return true;
    }

    return false;
  }

  /**
   * Find which palace room contains a specific drawing
   */
  findRoomByDrawing(drawingId: string): PalaceRoom | null {
    const rooms = this.listRooms();
    return rooms.find((room) => room.drawingIds.includes(drawingId)) || null;
  }

  /**
   * Find which palace room contains a specific codebase view
   */
  findRoomByCodebaseView(viewId: string): PalaceRoom | null {
    const rooms = this.listRooms();
    return rooms.find((room) => room.codebaseViewIds.includes(viewId)) || null;
  }

  /**
   * Find which palace room contains a specific note
   */
  findRoomByNote(noteId: string): PalaceRoom | null {
    const rooms = this.listRooms();
    return rooms.find((room) => room.noteIds.includes(noteId)) || null;
  }

  /**
   * Add a portal to a palace room
   */
  addPortalToRoom(
    roomId: string,
    portalOptions: CreatePortalOptions,
  ): PalacePortal | null {
    const room = this.getRoom(roomId);
    if (!room) {
      console.error(`Room ${roomId} not found`);
      return null;
    }

    const portalId = generateId();
    const now = new Date().toISOString();

    const portal: PalacePortal = {
      id: portalId,
      name: portalOptions.name,
      description: portalOptions.description,
      target: portalOptions.target,
      referenceType: portalOptions.referenceType || "full",
      references: portalOptions.references,
      displayMode: portalOptions.displayMode || "linked",
      syncStrategy: portalOptions.syncStrategy,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      metadata: portalOptions.metadata,
    };

    // Initialize portals array if it doesn't exist (for backward compatibility)
    if (!room.portals) {
      room.portals = [];
    }

    room.portals.push(portal);
    room.updatedAt = now;

    const roomPath = this.getRoomPath(roomId);
    this.fs.writeFile(roomPath, JSON.stringify(room, null, 2));

    return portal;
  }

  /**
   * Remove a portal from a palace room
   */
  removePortalFromRoom(roomId: string, portalId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room || !room.portals) {
      return false;
    }

    const index = room.portals.findIndex((p) => p.id === portalId);
    if (index === -1) {
      return false;
    }

    room.portals.splice(index, 1);
    room.updatedAt = new Date().toISOString();

    const roomPath = this.getRoomPath(roomId);
    this.fs.writeFile(roomPath, JSON.stringify(room, null, 2));

    return true;
  }

  /**
   * Update a portal in a palace room
   */
  updatePortalInRoom(
    roomId: string,
    portalId: string,
    updates: Partial<PalacePortal>,
  ): PalacePortal | null {
    const room = this.getRoom(roomId);
    if (!room || !room.portals) {
      return null;
    }

    const portalIndex = room.portals.findIndex((p) => p.id === portalId);
    if (portalIndex === -1) {
      return null;
    }

    const now = new Date().toISOString();
    const updatedPortal: PalacePortal = {
      ...room.portals[portalIndex],
      ...updates,
      id: portalId, // Ensure ID cannot be changed
      createdAt: room.portals[portalIndex].createdAt, // Preserve creation time
      updatedAt: now,
    };

    room.portals[portalIndex] = updatedPortal;
    room.updatedAt = now;

    const roomPath = this.getRoomPath(roomId);
    this.fs.writeFile(roomPath, JSON.stringify(room, null, 2));

    return updatedPortal;
  }

  /**
   * Get a specific portal from a room
   */
  getPortalFromRoom(roomId: string, portalId: string): PalacePortal | null {
    const room = this.getRoom(roomId);
    if (!room || !room.portals) {
      return null;
    }

    return room.portals.find((p) => p.id === portalId) || null;
  }

  /**
   * List all portals in a room
   */
  listPortalsInRoom(roomId: string): PalacePortal[] {
    const room = this.getRoom(roomId);
    if (!room || !room.portals) {
      return [];
    }

    return room.portals;
  }

  /**
   * Find rooms that have portals to a specific target
   */
  findRoomsByPortalTarget(targetPath: string): PalaceRoom[] {
    const rooms = this.listRooms();
    return rooms.filter((room) => {
      if (!room.portals || room.portals.length === 0) {
        return false;
      }
      return room.portals.some(
        (portal) =>
          portal.target.path === targetPath ||
          portal.target.gitUrl === targetPath ||
          portal.target.url === targetPath,
      );
    });
  }
}
