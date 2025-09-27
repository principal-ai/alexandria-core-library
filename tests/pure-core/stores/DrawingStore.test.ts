import { describe, it, expect, beforeEach } from "@jest/globals";
import { DrawingStore } from "../../../src/pure-core/stores/DrawingStore";
import { InMemoryFileSystemAdapter } from "../../../src/test-adapters/InMemoryFileSystemAdapter";
import { ValidatedAlexandriaPath } from "../../../src/pure-core/types/repository";
import type { ExcalidrawData } from "../../../src/pure-core/types/drawing";

describe("DrawingStore", () => {
  let fs: InMemoryFileSystemAdapter;
  let store: DrawingStore;
  const alexandriaPath = "/.alexandria" as ValidatedAlexandriaPath;

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    // Create the alexandria directory
    fs.createDir(alexandriaPath);
    store = new DrawingStore(fs, alexandriaPath);
  });

  describe("Text Drawing Operations", () => {
    it("should save and load a text-based drawing", () => {
      const drawingName = "test-diagram";
      const content = JSON.stringify({
        type: "excalidraw",
        version: 2,
        elements: [
          { id: "1", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
        ],
      });

      store.saveDrawing(drawingName, content);
      const loaded = store.loadDrawing(drawingName);

      expect(loaded).toBe(content);
    });

    it("should add .excalidraw extension if not provided", () => {
      const drawingName = "test-diagram";
      const content = '{"type":"excalidraw"}';

      store.saveDrawing(drawingName, content);

      const files = store.listDrawings();
      expect(files).toContain("test-diagram.excalidraw");
    });

    it("should preserve extension if provided", () => {
      const drawingName = "test-diagram.svg";
      const content = "<svg></svg>";

      store.saveDrawing(drawingName, content);

      const files = store.listDrawings();
      expect(files).toContain("test-diagram.svg");
    });

    it("should return null for non-existent drawing", () => {
      const result = store.loadDrawing("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("Binary Drawing Operations", () => {
    it("should save and load a binary drawing", () => {
      const drawingName = "test-image.png";
      const content = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header

      store.saveBinaryDrawing(drawingName, content);
      const loaded = store.loadBinaryDrawing(drawingName);

      expect(loaded).toEqual(content);
    });

    it("should return null for non-existent binary drawing", () => {
      const result = store.loadBinaryDrawing("non-existent.png");
      expect(result).toBeNull();
    });
  });

  describe("Listing Operations", () => {
    it("should list all drawings", () => {
      store.saveDrawing("diagram1", "{}");
      store.saveDrawing("diagram2.excalidraw", "{}");
      store.saveDrawing("image.svg", "<svg/>");
      store.saveBinaryDrawing("screenshot.png", new Uint8Array([1, 2, 3]));

      const files = store.listDrawings();

      expect(files).toHaveLength(4);
      expect(files).toContain("diagram1.excalidraw");
      expect(files).toContain("diagram2.excalidraw");
      expect(files).toContain("image.svg");
      expect(files).toContain("screenshot.png");
    });

    it("should return empty array when no drawings exist", () => {
      const files = store.listDrawings();
      expect(files).toEqual([]);
    });

    it("should filter only drawing files", () => {
      // Create the drawings directory
      const drawingsDir = fs.join(alexandriaPath, "drawings");
      fs.createDir(drawingsDir);

      // Add various files including non-drawing files
      fs.writeFile(fs.join(drawingsDir, "diagram.excalidraw"), "{}");
      fs.writeFile(fs.join(drawingsDir, "image.svg"), "<svg/>");
      fs.writeFile(fs.join(drawingsDir, "readme.txt"), "text");
      fs.writeFile(fs.join(drawingsDir, "config.json"), "{}");

      const files = store.listDrawings();

      expect(files).toHaveLength(2);
      expect(files).toContain("diagram.excalidraw");
      expect(files).toContain("image.svg");
      expect(files).not.toContain("readme.txt");
      expect(files).not.toContain("config.json");
    });
  });

  describe("Delete Operations", () => {
    it("should delete an existing drawing", () => {
      store.saveDrawing("test-diagram", "{}");

      const deleted = store.deleteDrawing("test-diagram");
      expect(deleted).toBe(true);

      const loaded = store.loadDrawing("test-diagram");
      expect(loaded).toBeNull();

      const files = store.listDrawings();
      expect(files).not.toContain("test-diagram.excalidraw");
    });

    it("should return false when deleting non-existent drawing", () => {
      const deleted = store.deleteDrawing("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("Rename Operations", () => {
    it("should rename an existing drawing", () => {
      const originalContent = '{"name":"original"}';
      store.saveDrawing("original", originalContent);

      const renamed = store.renameDrawing("original", "renamed");
      expect(renamed).toBe(true);

      const oldFile = store.loadDrawing("original");
      expect(oldFile).toBeNull();

      const newFile = store.loadDrawing("renamed");
      expect(newFile).toBe(originalContent);
    });

    it("should return false when renaming non-existent drawing", () => {
      const renamed = store.renameDrawing("non-existent", "new-name");
      expect(renamed).toBe(false);
    });

    it("should not rename if target name already exists", () => {
      store.saveDrawing("file1", '{"file":1}');
      store.saveDrawing("file2", '{"file":2}');

      const renamed = store.renameDrawing("file1", "file2");
      expect(renamed).toBe(false);

      // Original files should remain unchanged
      expect(store.loadDrawing("file1")).toBe('{"file":1}');
      expect(store.loadDrawing("file2")).toBe('{"file":2}');
    });
  });

  describe("Excalidraw Content Updates", () => {
    it("should update drawing content when file exists", () => {
      const originalData: ExcalidrawData = {
        elements: [{ id: "1", type: "rectangle" }],
        appState: { name: "Original" },
      };

      const drawingId = store.saveExcalidrawDrawing(originalData);

      const updatedData: ExcalidrawData = {
        elements: [{ id: "2", type: "ellipse" }],
        appState: { name: "Updated" },
        files: { asset: { id: "asset" } },
      };

      const success = store.updateExcalidrawDrawingContent(
        drawingId,
        updatedData,
      );

      expect(success).toBe(true);
      const loaded = store.loadExcalidrawDrawing(drawingId);
      expect(loaded?.appState.name).toBe("Updated");
      expect(loaded?.elements).toEqual(updatedData.elements);
      expect(loaded?.files).toEqual(updatedData.files);
    });

    it("should preserve existing name if update omits name", () => {
      const originalData: ExcalidrawData = {
        elements: [],
        appState: { name: "Keep Name" },
      };

      const drawingId = store.saveExcalidrawDrawing(originalData);

      const updatedData = {
        elements: [{ id: "3", type: "diamond" }],
        appState: {},
      } as unknown as ExcalidrawData;

      const success = store.updateExcalidrawDrawingContent(
        drawingId,
        updatedData,
      );

      expect(success).toBe(true);
      const loaded = store.loadExcalidrawDrawing(drawingId);
      expect(loaded?.appState.name).toBe("Keep Name");
      expect(loaded?.elements).toEqual(updatedData.elements);
    });

    it("should return false when drawing file does not exist", () => {
      const data: ExcalidrawData = {
        elements: [],
        appState: { name: "Missing" },
      };

      const success = store.updateExcalidrawDrawingContent("missing", data);
      expect(success).toBe(false);
    });
  });

  describe("Existence Check", () => {
    it("should correctly check if drawing exists", () => {
      store.saveDrawing("existing", "{}");

      expect(store.drawingExists("existing")).toBe(true);
      expect(store.drawingExists("non-existent")).toBe(false);
    });

    it("should handle extension normalization in existence check", () => {
      store.saveDrawing("test", "{}"); // Will be saved as test.excalidraw

      expect(store.drawingExists("test")).toBe(true);
      expect(store.drawingExists("test.excalidraw")).toBe(true);
    });
  });

  describe("Metadata Operations", () => {
    it("should list drawings with metadata", () => {
      store.saveDrawing("diagram1", "{}");
      store.saveDrawing("image.svg", "<svg/>");
      store.saveBinaryDrawing("screenshot.png", new Uint8Array([1, 2, 3]));

      const metadata = store.listDrawingsWithMetadata();

      expect(metadata).toHaveLength(3);

      const diagram = metadata.find((m) => m.name === "diagram1.excalidraw");
      expect(diagram).toBeDefined();
      expect(diagram?.format).toBe("excalidraw");

      const svg = metadata.find((m) => m.name === "image.svg");
      expect(svg).toBeDefined();
      expect(svg?.format).toBe("svg");

      const png = metadata.find((m) => m.name === "screenshot.png");
      expect(png).toBeDefined();
      expect(png?.format).toBe("png");
    });
  });

  describe("Directory Creation", () => {
    it("should create drawings directory on first save", () => {
      // Start fresh without pre-creating directories
      fs = new InMemoryFileSystemAdapter();
      fs.createDir(alexandriaPath);
      store = new DrawingStore(fs, alexandriaPath);

      // Directory should be created on save
      store.saveDrawing("test", "{}");

      const drawingsDir = fs.join(alexandriaPath, "drawings");
      expect(fs.exists(drawingsDir)).toBe(true);
      expect(fs.isDirectory(drawingsDir)).toBe(true);
    });
  });
});
