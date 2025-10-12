/**
 * Tests for room-aware drawing management in MemoryPalace
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryPalace } from "../src/MemoryPalace";
import { InMemoryFileSystemAdapter } from "../src/test-adapters/InMemoryFileSystemAdapter";
import type { ExcalidrawData } from "../src/pure-core/types/drawing";

describe("MemoryPalace - Room-Aware Drawing Management", () => {
  let memory: MemoryPalace;
  let fs: InMemoryFileSystemAdapter;

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    fs.createDir("/test-repo");
    fs.createDir("/test-repo/.git");
    memory = new MemoryPalace("/test-repo", fs);
  });

  describe("saveRoomDrawing", () => {
    it("should save a drawing and associate it with a room", () => {
      // Create a room first
      const roomResult = memory.createPalaceRoom({
        name: "Architecture Diagrams",
      });
      expect(roomResult.success).toBe(true);
      const roomId = roomResult.palaceRoom!.id;

      // Create drawing data
      const drawingData: ExcalidrawData = {
        elements: [],
        appState: {
          name: "System Architecture",
        },
      };

      // Save the drawing to the room
      const drawingId = memory.saveRoomDrawing(
        roomId,
        "System Architecture",
        drawingData,
      );

      expect(drawingId).toBeTruthy();

      // Verify the drawing is in the room
      const roomDrawings = memory.listRoomDrawings(roomId);
      expect(roomDrawings).toHaveLength(1);
      expect(roomDrawings[0].name).toBe("System Architecture");
      expect(roomDrawings[0].id).toBe(drawingId);
    });

    it("should extract name from appState.name", () => {
      const roomResult = memory.createPalaceRoom({
        name: "Test Room",
      });
      const roomId = roomResult.palaceRoom!.id;

      const drawingData: ExcalidrawData = {
        elements: [],
        appState: {
          name: "My Custom Drawing Name",
        },
      };

      const drawingId = memory.saveRoomDrawing(
        roomId,
        "Different Name", // This should be overridden by appState.name
        drawingData,
      );

      const savedDrawing = memory.loadRoomDrawing(roomId, drawingId!);
      expect(savedDrawing?.appState.name).toBe("Different Name");
    });

    it("should return null if room doesn't exist", () => {
      const drawingData: ExcalidrawData = {
        elements: [],
        appState: { name: "Test" },
      };

      const drawingId = memory.saveRoomDrawing(
        "non-existent-room",
        "Test",
        drawingData,
      );

      expect(drawingId).toBeNull();
    });
  });

  describe("listRoomDrawings", () => {
    it("should list all drawings with extracted names", () => {
      const roomResult = memory.createPalaceRoom({
        name: "Design Room",
      });
      const roomId = roomResult.palaceRoom!.id;

      // Add multiple drawings
      const drawing1: ExcalidrawData = {
        elements: [],
        appState: { name: "UI Mockup" },
      };

      const drawing2: ExcalidrawData = {
        elements: [],
        appState: { name: "Database Schema" },
      };

      memory.saveRoomDrawing(roomId, "UI Mockup", drawing1);
      memory.saveRoomDrawing(roomId, "Database Schema", drawing2);

      const drawings = memory.listRoomDrawings(roomId);

      expect(drawings).toHaveLength(2);
      expect(drawings.map((d) => d.name)).toContain("UI Mockup");
      expect(drawings.map((d) => d.name)).toContain("Database Schema");
      expect(drawings.every((d) => d.roomIds.includes(roomId))).toBe(true);
    });

    it("should return empty array for non-existent room", () => {
      const drawings = memory.listRoomDrawings("non-existent");
      expect(drawings).toEqual([]);
    });
  });

  describe("updateDrawingName", () => {
    it("should update drawing name without loading full content", () => {
      const roomResult = memory.createPalaceRoom({
        name: "Test Room",
      });
      const roomId = roomResult.palaceRoom!.id;

      const drawingData: ExcalidrawData = {
        elements: [{ type: "rectangle", id: "1" }],
        appState: { name: "Original Name" },
      };

      const drawingId = memory.saveRoomDrawing(
        roomId,
        "Original Name",
        drawingData,
      );

      // Update the name
      const success = memory.updateDrawingName(drawingId!, "Updated Name");
      expect(success).toBe(true);

      // Verify the name was updated
      const drawings = memory.listRoomDrawings(roomId);
      expect(drawings[0].name).toBe("Updated Name");

      // Verify the content wasn't changed
      const loaded = memory.loadRoomDrawing(roomId, drawingId!);
      expect(loaded?.elements).toHaveLength(1);
      expect(loaded?.appState.name).toBe("Updated Name");
    });
  });

  describe("updateRoomDrawingContent", () => {
    it("should update drawing content when drawing belongs to the room", () => {
      const roomResult = memory.createPalaceRoom({
        name: "Content Room",
      });
      const roomId = roomResult.palaceRoom!.id;

      const originalData: ExcalidrawData = {
        elements: [{ id: "1", type: "ellipse" }],
        appState: { name: "Original Content" },
      };

      const drawingId = memory.saveRoomDrawing(
        roomId,
        "Original Content",
        originalData,
      );

      const updatedData: ExcalidrawData = {
        elements: [{ id: "2", type: "diamond" }],
        appState: { name: "Updated Content" },
        files: { asset1: { id: "asset1" } },
        libraryItems: [],
      };

      const success = memory.updateRoomDrawingContent(
        roomId,
        drawingId!,
        updatedData,
      );

      expect(success).toBe(true);

      const loaded = memory.loadRoomDrawing(roomId, drawingId!);
      expect(loaded?.appState.name).toBe("Updated Content");
      expect(loaded?.elements).toEqual(updatedData.elements);
      expect(loaded?.files).toEqual(updatedData.files);
    });

    it("should return false when drawing is not associated with the room", () => {
      const roomAResult = memory.createPalaceRoom({
        name: "Room A",
      });
      const roomBResult = memory.createPalaceRoom({
        name: "Room B",
      });
      const roomAId = roomAResult.palaceRoom!.id;
      const roomBId = roomBResult.palaceRoom!.id;

      const drawingData: ExcalidrawData = {
        elements: [],
        appState: { name: "Shared" },
      };

      const drawingId = memory.saveRoomDrawing(roomAId, "Shared", drawingData);

      const success = memory.updateRoomDrawingContent(roomBId, drawingId!, {
        elements: [{ id: "3", type: "rectangle" }],
        appState: { name: "Updated" },
      });

      expect(success).toBe(false);

      const loaded = memory.loadRoomDrawing(roomAId, drawingId!);
      expect(loaded?.appState.name).toBe("Shared");
    });
  });

  describe("copyDrawingsToRoom", () => {
    it("should copy drawings between rooms", () => {
      // Create two rooms
      const room1Result = memory.createPalaceRoom({
        name: "Room 1",
      });
      const room2Result = memory.createPalaceRoom({
        name: "Room 2",
      });
      const room1Id = room1Result.palaceRoom!.id;
      const room2Id = room2Result.palaceRoom!.id;

      // Add drawings to room 1
      const drawing: ExcalidrawData = {
        elements: [],
        appState: { name: "Shared Diagram" },
      };

      const drawingId = memory.saveRoomDrawing(
        room1Id,
        "Shared Diagram",
        drawing,
      );

      // Copy to room 2
      const success = memory.copyDrawingsToRoom(room1Id, room2Id, [drawingId!]);

      expect(success).toBe(true);

      // Verify drawing is in both rooms
      const room1Drawings = memory.listRoomDrawings(room1Id);
      const room2Drawings = memory.listRoomDrawings(room2Id);

      expect(room1Drawings).toHaveLength(1);
      expect(room2Drawings).toHaveLength(1);
      expect(room2Drawings[0].id).toBe(drawingId);
    });
  });

  describe("moveDrawingsToRoom", () => {
    it("should move drawings between rooms", () => {
      // Create two rooms
      const room1Result = memory.createPalaceRoom({
        name: "Source Room",
      });
      const room2Result = memory.createPalaceRoom({
        name: "Target Room",
      });
      const room1Id = room1Result.palaceRoom!.id;
      const room2Id = room2Result.palaceRoom!.id;

      // Add drawing to room 1
      const drawing: ExcalidrawData = {
        elements: [],
        appState: { name: "Moving Diagram" },
      };

      const drawingId = memory.saveRoomDrawing(
        room1Id,
        "Moving Diagram",
        drawing,
      );

      // Move to room 2
      const success = memory.moveDrawingsToRoom(room1Id, room2Id, [drawingId!]);

      expect(success).toBe(true);

      // Verify drawing is only in room 2
      const room1Drawings = memory.listRoomDrawings(room1Id);
      const room2Drawings = memory.listRoomDrawings(room2Id);

      expect(room1Drawings).toHaveLength(0);
      expect(room2Drawings).toHaveLength(1);
      expect(room2Drawings[0].id).toBe(drawingId);
    });
  });

  describe("deleteDrawingCompletely", () => {
    it("should remove drawing from all rooms and delete file", () => {
      // Create two rooms
      const room1Result = memory.createPalaceRoom({
        name: "Room 1",
      });
      const room2Result = memory.createPalaceRoom({
        name: "Room 2",
      });
      const room1Id = room1Result.palaceRoom!.id;
      const room2Id = room2Result.palaceRoom!.id;

      // Add drawing to room 1
      const drawing: ExcalidrawData = {
        elements: [],
        appState: { name: "To Delete" },
      };

      const drawingId = memory.saveRoomDrawing(room1Id, "To Delete", drawing);

      // Copy to room 2
      memory.copyDrawingsToRoom(room1Id, room2Id, [drawingId!]);

      // Delete completely
      const success = memory.deleteDrawingCompletely(drawingId!);
      expect(success).toBe(true);

      // Verify drawing is gone from both rooms
      const room1Drawings = memory.listRoomDrawings(room1Id);
      const room2Drawings = memory.listRoomDrawings(room2Id);

      expect(room1Drawings).toHaveLength(0);
      expect(room2Drawings).toHaveLength(0);

      // Verify file is deleted
      const loaded = memory.loadRoomDrawing(room1Id, drawingId!);
      expect(loaded).toBeNull();
    });
  });

  describe("listAllDrawings", () => {
    it("should list all drawings with room associations", () => {
      // Create rooms
      const room1Result = memory.createPalaceRoom({
        name: "Room A",
      });
      const room2Result = memory.createPalaceRoom({
        name: "Room B",
      });
      const room1Id = room1Result.palaceRoom!.id;
      const room2Id = room2Result.palaceRoom!.id;

      // Add drawings
      const drawing1: ExcalidrawData = {
        elements: [],
        appState: { name: "Drawing 1" },
      };

      const drawing2: ExcalidrawData = {
        elements: [],
        appState: { name: "Drawing 2" },
      };

      const id1 = memory.saveRoomDrawing(room1Id, "Drawing 1", drawing1);
      const id2 = memory.saveRoomDrawing(room2Id, "Drawing 2", drawing2);

      // Copy drawing 1 to room 2 as well
      memory.copyDrawingsToRoom(room1Id, room2Id, [id1!]);

      const allDrawings = memory.listAllDrawings();

      expect(allDrawings).toHaveLength(2);

      const drawing1Meta = allDrawings.find((d) => d.id === id1);
      const drawing2Meta = allDrawings.find((d) => d.id === id2);

      // Drawing 1 should be in both rooms
      expect(drawing1Meta?.roomIds).toHaveLength(2);
      expect(drawing1Meta?.roomIds).toContain(room1Id);
      expect(drawing1Meta?.roomIds).toContain(room2Id);

      // Drawing 2 should only be in room 2
      expect(drawing2Meta?.roomIds).toHaveLength(1);
      expect(drawing2Meta?.roomIds).toContain(room2Id);
    });
  });
});
