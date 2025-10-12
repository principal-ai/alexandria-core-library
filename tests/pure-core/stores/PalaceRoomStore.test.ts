import { describe, test, expect, beforeEach } from "bun:test";
import { PalaceRoomStore } from "../../../src/pure-core/stores/PalaceRoomStore";
import { InMemoryFileSystemAdapter } from "../../../src/test-adapters/InMemoryFileSystemAdapter";
import type { ValidatedAlexandriaPath } from "../../../src/pure-core/types/repository";

describe("PalaceRoomStore", () => {
  let fs: InMemoryFileSystemAdapter;
  let store: PalaceRoomStore;
  const alexandriaPath = "/test/repo/.alexandria" as ValidatedAlexandriaPath;

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    fs.createDir("/test");
    fs.createDir("/test/repo");
    fs.createDir(alexandriaPath);
    store = new PalaceRoomStore(fs, alexandriaPath);
  });

  describe("initialization", () => {
    test("should NOT create palace-rooms directory on init (lazy initialization)", () => {
      const palaceRoomsPath = fs.join(alexandriaPath, "palace-rooms");
      expect(fs.exists(palaceRoomsPath)).toBe(false);
    });
  });

  describe("createRoom", () => {
    test("should create a new palace room", () => {
      const result = store.createRoom({
        name: "Test Room",
        description: "A test room",
        color: "#ff0000",
        icon: "🎯",
        displayOrder: 1,
      });

      expect(result.success).toBe(true);
      expect(result.palaceRoom).toBeTruthy();
      expect(result.palaceRoom?.name).toBe("Test Room");
      expect(result.palaceRoom?.description).toBe("A test room");
      expect(result.palaceRoom?.color).toBe("#ff0000");
      expect(result.palaceRoom?.icon).toBe("🎯");
      expect(result.palaceRoom?.displayOrder).toBe(1);
      expect(result.palaceRoom?.drawingIds).toEqual([]);
      expect(result.palaceRoom?.codebaseViewIds).toEqual([]);
      expect(result.palaceRoom?.noteIds).toEqual([]);
    });

    test("should generate unique IDs for rooms", () => {
      const result1 = store.createRoom({ name: "Room 1" });
      const result2 = store.createRoom({ name: "Room 2" });

      expect(result1.palaceRoom?.id).not.toBe(result2.palaceRoom?.id);
    });
  });

  describe("listRooms", () => {
    test("should list all palace rooms", () => {
      store.createRoom({ name: "Room 1", displayOrder: 2 });
      store.createRoom({ name: "Room 2", displayOrder: 1 });
      store.createRoom({ name: "Room 3" }); // No displayOrder

      const rooms = store.listRooms();
      expect(rooms.length).toBe(3);

      // Check sorting by displayOrder
      expect(rooms[0].displayOrder).toBe(1);
      expect(rooms[1].displayOrder).toBe(2);
    });

    test("should handle empty palace rooms directory", () => {
      // Create a new store with non-existent directory
      const emptyFs = new InMemoryFileSystemAdapter();
      emptyFs.createDir("/empty/repo");
      emptyFs.createDir("/empty/repo/.alexandria");
      const emptyStore = new PalaceRoomStore(
        emptyFs,
        "/empty/repo/.alexandria" as ValidatedAlexandriaPath,
      );

      const rooms = emptyStore.listRooms();
      expect(rooms.length).toBe(0); // No rooms until first access (lazy init)
    });
  });

  describe("getRoom", () => {
    test("should get a specific room by ID", () => {
      const result = store.createRoom({ name: "Test Room" });
      const roomId = result.palaceRoom?.id;

      const room = store.getRoom(roomId!);
      expect(room).toBeTruthy();
      expect(room?.name).toBe("Test Room");
    });

    test("should return null for non-existent room", () => {
      const room = store.getRoom("non-existent-id");
      expect(room).toBeNull();
    });
  });

  describe("updateRoom", () => {
    test("should update a palace room", () => {
      const createResult = store.createRoom({ name: "Original Name" });
      if (!createResult.palaceRoom) {
        throw new Error("Failed to create room");
      }
      const roomId = createResult.palaceRoom.id;

      const updateResult = store.updateRoom(roomId, {
        name: "Updated Name",
        description: "New description",
        color: "#00ff00",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.palaceRoom?.name).toBe("Updated Name");
      expect(updateResult.palaceRoom?.description).toBe("New description");
      expect(updateResult.palaceRoom?.color).toBe("#00ff00");

      // Verify persistence
      const room = store.getRoom(roomId);
      expect(room?.name).toBe("Updated Name");
    });

    test("should fail to update non-existent room", () => {
      const result = store.updateRoom("non-existent", { name: "New Name" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("deleteRoom", () => {
    test("should delete a palace room", () => {
      const createResult = store.createRoom({ name: "To Delete" });
      if (!createResult.palaceRoom) {
        throw new Error("Failed to create room");
      }
      const roomId = createResult.palaceRoom.id;

      const deleted = store.deleteRoom(roomId);
      expect(deleted).toBe(true);

      const room = store.getRoom(roomId);
      expect(room).toBeNull();
    });

    test("should not delete room with content", () => {
      const createResult = store.createRoom({ name: "Room with Content" });
      if (!createResult.palaceRoom) {
        throw new Error("Failed to create room");
      }
      const roomId = createResult.palaceRoom.id;

      // Add content to the room
      store.addDrawingToRoom(roomId, "drawing1");

      const deleted = store.deleteRoom(roomId);
      expect(deleted).toBe(false);

      const room = store.getRoom(roomId);
      expect(room).toBeTruthy();
    });

    test("should return false for non-existent room", () => {
      const deleted = store.deleteRoom("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("content management", () => {
    let roomId: string;

    beforeEach(() => {
      const result = store.createRoom({ name: "Content Room" });
      if (!result.palaceRoom) {
        throw new Error("Failed to create room");
      }
      roomId = result.palaceRoom.id;
    });

    describe("drawings", () => {
      test("should add drawing to room", () => {
        const added = store.addDrawingToRoom(roomId, "drawing1");
        expect(added).toBe(true);

        const room = store.getRoom(roomId);
        expect(room?.drawingIds).toContain("drawing1");
      });

      test("should not add duplicate drawing", () => {
        store.addDrawingToRoom(roomId, "drawing1");
        const added = store.addDrawingToRoom(roomId, "drawing1");
        expect(added).toBe(false);

        const room = store.getRoom(roomId);
        expect(room?.drawingIds.length).toBe(1);
      });

      test("should remove drawing from room", () => {
        store.addDrawingToRoom(roomId, "drawing1");
        const removed = store.removeDrawingFromRoom(roomId, "drawing1");
        expect(removed).toBe(true);

        const room = store.getRoom(roomId);
        expect(room?.drawingIds).not.toContain("drawing1");
      });

      test("should return false when removing non-existent drawing", () => {
        const removed = store.removeDrawingFromRoom(roomId, "non-existent");
        expect(removed).toBe(false);
      });

      test("should find room by drawing", () => {
        store.addDrawingToRoom(roomId, "unique-drawing");
        const room = store.findRoomByDrawing("unique-drawing");
        expect(room?.id).toBe(roomId);
      });

      test("should return null when finding room by non-existent drawing", () => {
        const room = store.findRoomByDrawing("non-existent");
        expect(room).toBeNull();
      });
    });

    describe("codebase views", () => {
      test("should add codebase view to room", () => {
        const added = store.addCodebaseViewToRoom(roomId, "view1");
        expect(added).toBe(true);

        const room = store.getRoom(roomId);
        expect(room?.codebaseViewIds).toContain("view1");
      });

      test("should not add duplicate codebase view", () => {
        store.addCodebaseViewToRoom(roomId, "view1");
        const added = store.addCodebaseViewToRoom(roomId, "view1");
        expect(added).toBe(false);

        const room = store.getRoom(roomId);
        expect(room?.codebaseViewIds.length).toBe(1);
      });

      test("should remove codebase view from room", () => {
        store.addCodebaseViewToRoom(roomId, "view1");
        const removed = store.removeCodebaseViewFromRoom(roomId, "view1");
        expect(removed).toBe(true);

        const room = store.getRoom(roomId);
        expect(room?.codebaseViewIds).not.toContain("view1");
      });

      test("should find room by codebase view", () => {
        store.addCodebaseViewToRoom(roomId, "unique-view");
        const room = store.findRoomByCodebaseView("unique-view");
        expect(room?.id).toBe(roomId);
      });
    });

    describe("notes", () => {
      test("should add note to room", () => {
        const added = store.addNoteToRoom(roomId, "note1");
        expect(added).toBe(true);

        const room = store.getRoom(roomId);
        expect(room?.noteIds).toContain("note1");
      });

      test("should not add duplicate note", () => {
        store.addNoteToRoom(roomId, "note1");
        const added = store.addNoteToRoom(roomId, "note1");
        expect(added).toBe(false);

        const room = store.getRoom(roomId);
        expect(room?.noteIds.length).toBe(1);
      });

      test("should remove note from room", () => {
        store.addNoteToRoom(roomId, "note1");
        const removed = store.removeNoteFromRoom(roomId, "note1");
        expect(removed).toBe(true);

        const room = store.getRoom(roomId);
        expect(room?.noteIds).not.toContain("note1");
      });

      test("should find room by note", () => {
        store.addNoteToRoom(roomId, "unique-note");
        const room = store.findRoomByNote("unique-note");
        expect(room?.id).toBe(roomId);
      });
    });

    test("should update timestamps when content changes", () => {
      const room1 = store.getRoom(roomId);
      const originalUpdatedAt = room1?.updatedAt;

      // Wait a tiny bit to ensure timestamp difference
      setTimeout(() => {
        store.addDrawingToRoom(roomId, "drawing1");
        const room2 = store.getRoom(roomId);
        expect(room2?.updatedAt).not.toBe(originalUpdatedAt);
      }, 10);
    });
  });
});
