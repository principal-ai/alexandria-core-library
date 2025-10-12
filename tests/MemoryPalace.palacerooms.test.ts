import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryPalace } from "../src/MemoryPalace";
import { InMemoryFileSystemAdapter } from "../src/test-adapters/InMemoryFileSystemAdapter";

describe("MemoryPalace - PalaceRoom Integration", () => {
  let fs: InMemoryFileSystemAdapter;
  let palace: MemoryPalace;
  const repoPath = "/test/repo";

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    fs.createDir("/test");
    fs.createDir(repoPath);
    fs.createDir(`${repoPath}/.git`); // Make it a git repo
    palace = new MemoryPalace(repoPath, fs);
  });

  describe("palace room management", () => {
    test("should list palace rooms (initially empty)", () => {
      // List should be empty initially
      let rooms = palace.listPalaceRooms();
      expect(rooms.length).toBe(0);

      // Create a room
      palace.createPalaceRoom({ name: "First Room" });

      // Now list should include the created room
      rooms = palace.listPalaceRooms();
      expect(rooms.length).toBe(1);
      expect(rooms[0].name).toBe("First Room");
    });

    test("should create a new palace room", () => {
      const result = palace.createPalaceRoom({
        name: "Feature Room",
        description: "Room for feature development",
        color: "#2ecc71",
        icon: "✨",
      });

      expect(result.success).toBe(true);
      expect(result.palaceRoom?.name).toBe("Feature Room");

      // Verify it appears in the list
      const rooms = palace.listPalaceRooms();
      const featureRoom = rooms.find((r) => r.name === "Feature Room");
      expect(featureRoom).toBeTruthy();
    });

    test("should update a palace room", () => {
      const createResult = palace.createPalaceRoom({ name: "Original" });
      if (!createResult.palaceRoom) {
        throw new Error("Failed to create room");
      }
      const roomId = createResult.palaceRoom.id;

      const updateResult = palace.updatePalaceRoom(roomId, {
        name: "Updated",
        description: "Updated description",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.palaceRoom?.name).toBe("Updated");
      expect(updateResult.palaceRoom?.description).toBe("Updated description");
    });

    test("should delete a palace room", () => {
      const createResult = palace.createPalaceRoom({ name: "Temp Room" });
      if (!createResult.palaceRoom) {
        throw new Error("Failed to create room");
      }
      const roomId = createResult.palaceRoom.id;

      const deleted = palace.deletePalaceRoom(roomId);
      expect(deleted).toBe(true);

      const room = palace.getPalaceRoom(roomId);
      expect(room).toBeNull();
    });
  });

  describe("content association with palace rooms", () => {
    let roomId: string;

    beforeEach(() => {
      const result = palace.createPalaceRoom({ name: "Test Room" });
      if (!result.palaceRoom) {
        throw new Error("Failed to create room");
      }
      roomId = result.palaceRoom.id;
    });

    describe("drawings", () => {
      test("should add drawing to palace room", () => {
        // First create a drawing
        palace.saveDrawing("test-drawing", JSON.stringify({ test: "data" }));

        const added = palace.addDrawingToPalaceRoom(roomId, "test-drawing");
        expect(added).toBe(true);

        const room = palace.getPalaceRoom(roomId);
        expect(room?.drawingIds).toContain("test-drawing");
      });

      test("should not add non-existent drawing", () => {
        const added = palace.addDrawingToPalaceRoom(roomId, "non-existent");
        expect(added).toBe(false);
      });

      test("should remove drawing from palace room", () => {
        palace.saveDrawing("test-drawing", JSON.stringify({ test: "data" }));
        palace.addDrawingToPalaceRoom(roomId, "test-drawing");

        const removed = palace.removeDrawingFromPalaceRoom(
          roomId,
          "test-drawing",
        );
        expect(removed).toBe(true);

        const room = palace.getPalaceRoom(roomId);
        expect(room?.drawingIds).not.toContain("test-drawing");
      });

      test("should find palace room by drawing", () => {
        palace.saveDrawing("unique-drawing", JSON.stringify({ test: "data" }));
        palace.addDrawingToPalaceRoom(roomId, "unique-drawing");

        const room = palace.findPalaceRoomByDrawing("unique-drawing");
        expect(room?.id).toBe(roomId);
      });
    });

    describe("codebase views", () => {
      test("should add codebase view to palace room", () => {
        // Create a minimal codebase view
        const view = {
          id: "test-view",
          name: "Test View",
          description: "Test description",
          overviewPath: "README.md",
          category: "test",
          displayOrder: 0,
          referenceGroups: {},
          version: "1.0.0",
        };
        palace.saveView(view);

        const added = palace.addCodebaseViewToPalaceRoom(roomId, "test-view");
        expect(added).toBe(true);

        const room = palace.getPalaceRoom(roomId);
        expect(room?.codebaseViewIds).toContain("test-view");
      });

      test("should not add non-existent view", () => {
        const added = palace.addCodebaseViewToPalaceRoom(
          roomId,
          "non-existent",
        );
        expect(added).toBe(false);
      });

      test("should remove codebase view from palace room", () => {
        const view = {
          id: "test-view",
          name: "Test View",
          description: "Test description",
          overviewPath: "README.md",
          category: "test",
          displayOrder: 0,
          referenceGroups: {},
          version: "1.0.0",
        };
        palace.saveView(view);
        palace.addCodebaseViewToPalaceRoom(roomId, "test-view");

        const removed = palace.removeCodebaseViewFromPalaceRoom(
          roomId,
          "test-view",
        );
        expect(removed).toBe(true);

        const room = palace.getPalaceRoom(roomId);
        expect(room?.codebaseViewIds).not.toContain("test-view");
      });

      test("should find palace room by codebase view", () => {
        const view = {
          id: "unique-view",
          name: "Unique View",
          description: "Test description",
          overviewPath: "README.md",
          category: "test",
          displayOrder: 0,
          referenceGroups: {},
          version: "1.0.0",
        };
        palace.saveView(view);
        palace.addCodebaseViewToPalaceRoom(roomId, "unique-view");

        const room = palace.findPalaceRoomByCodebaseView("unique-view");
        expect(room?.id).toBe(roomId);
      });
    });

    describe("notes", () => {
      test("should add note to palace room", () => {
        // Create a note (notes require at least one anchor)
        const noteResult = palace.saveNote({
          note: "Test note",
          tags: ["test"],
          anchors: ["src/test.ts"],
        });

        const added = palace.addNoteToPalaceRoom(roomId, noteResult.note.id);
        expect(added).toBe(true);

        const room = palace.getPalaceRoom(roomId);
        expect(room?.noteIds).toContain(noteResult.note.id);
      });

      test("should not add non-existent note", () => {
        const added = palace.addNoteToPalaceRoom(roomId, "non-existent");
        expect(added).toBe(false);
      });

      test("should remove note from palace room", () => {
        const noteResult = palace.saveNote({
          note: "Test note",
          tags: ["test"],
          anchors: ["src/test.ts"],
        });
        palace.addNoteToPalaceRoom(roomId, noteResult.note.id);

        const removed = palace.removeNoteFromPalaceRoom(
          roomId,
          noteResult.note.id,
        );
        expect(removed).toBe(true);

        const room = palace.getPalaceRoom(roomId);
        expect(room?.noteIds).not.toContain(noteResult.note.id);
      });

      test("should find palace room by note", () => {
        const noteResult = palace.saveNote({
          note: "Unique note",
          tags: ["unique"],
          anchors: ["src/unique.ts"],
        });
        palace.addNoteToPalaceRoom(roomId, noteResult.note.id);

        const room = palace.findPalaceRoomByNote(noteResult.note.id);
        expect(room?.id).toBe(roomId);
      });
    });
  });

  describe("complex scenarios", () => {
    test("should prevent deleting room with content", () => {
      const createResult = palace.createPalaceRoom({
        name: "Room with Content",
      });
      if (!createResult.palaceRoom) {
        throw new Error("Failed to create room");
      }
      const roomId = createResult.palaceRoom.id;

      // Add a drawing
      palace.saveDrawing(
        "important-drawing",
        JSON.stringify({ data: "important" }),
      );
      palace.addDrawingToPalaceRoom(roomId, "important-drawing");

      // Try to delete - should fail
      const deleted = palace.deletePalaceRoom(roomId);
      expect(deleted).toBe(false);

      // Room should still exist
      const room = palace.getPalaceRoom(roomId);
      expect(room).toBeTruthy();
    });

    test("should handle content in multiple rooms", () => {
      const room1Result = palace.createPalaceRoom({ name: "Room 1" });
      const room2Result = palace.createPalaceRoom({ name: "Room 2" });
      if (!room1Result.palaceRoom || !room2Result.palaceRoom) {
        throw new Error("Failed to create rooms");
      }
      const room1Id = room1Result.palaceRoom.id;
      const room2Id = room2Result.palaceRoom.id;

      // Create content
      palace.saveDrawing("drawing1", JSON.stringify({ id: 1 }));
      palace.saveDrawing("drawing2", JSON.stringify({ id: 2 }));

      // Add different drawings to different rooms
      palace.addDrawingToPalaceRoom(room1Id, "drawing1");
      palace.addDrawingToPalaceRoom(room2Id, "drawing2");

      // Verify each room has correct content
      const room1 = palace.getPalaceRoom(room1Id);
      const room2 = palace.getPalaceRoom(room2Id);

      expect(room1?.drawingIds).toContain("drawing1");
      expect(room1?.drawingIds).not.toContain("drawing2");
      expect(room2?.drawingIds).toContain("drawing2");
      expect(room2?.drawingIds).not.toContain("drawing1");

      // Find rooms by content
      const foundRoom1 = palace.findPalaceRoomByDrawing("drawing1");
      const foundRoom2 = palace.findPalaceRoomByDrawing("drawing2");

      expect(foundRoom1?.id).toBe(room1Id);
      expect(foundRoom2?.id).toBe(room2Id);
    });
  });
});
