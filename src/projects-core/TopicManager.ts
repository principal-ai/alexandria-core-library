/**
 * TopicManager — manages curated bundles of trails on a single subject.
 *
 * CORE LIBRARY RESPONSIBILITY:
 * - Store and retrieve topic definitions
 * - Handle membership of trails within a topic (ordered list of trail ids)
 * - Provide query methods for UI consumption
 *
 * Topics intentionally do NOT track repository membership — the set of
 * repositories involved in a topic is derived by walking the topic's trails.
 */

import { FileSystemAdapter } from "../pure-core/abstractions/filesystem";
import { idGenerator } from "../pure-core/utils/idGenerator";
import { Topic, TopicsData } from "./types";

export class TopicManager {
  private fs: FileSystemAdapter;
  private topicsPath: string;

  constructor(
    private readonly registryPath: string,
    private readonly fsAdapter: FileSystemAdapter,
  ) {
    this.fs = fsAdapter;
    this.topicsPath = this.fs.join(registryPath, "topics.json");
  }

  // ===== Private Storage Methods =====

  private ensureRegistryDir(): void {
    if (!this.fs.exists(this.registryPath)) {
      this.fs.createDir(this.registryPath);
    }
  }

  private loadTopics(): TopicsData {
    this.ensureRegistryDir();

    if (!this.fs.exists(this.topicsPath)) {
      return {
        version: "1.0.0",
        topics: [],
      };
    }

    try {
      const content = this.fs.readFile(this.topicsPath);
      return JSON.parse(content) as TopicsData;
    } catch {
      return {
        version: "1.0.0",
        topics: [],
      };
    }
  }

  private saveTopics(data: TopicsData): void {
    this.ensureRegistryDir();
    this.fs.writeFile(this.topicsPath, JSON.stringify(data, null, 2));
  }

  // ===== Topic CRUD =====

  /**
   * Create a new topic. Generates an id and timestamps if not provided.
   *
   * Callers can pass an `id` explicitly when they need to control it
   * (e.g. round-tripping from a remote publish that returned a server id),
   * but the default is a locally generated id.
   */
  async createTopic(
    topic: Omit<Topic, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
      createdAt?: string;
      updatedAt?: string;
    },
  ): Promise<Topic> {
    const data = this.loadTopics();

    const now = new Date().toISOString();
    const newTopic: Topic = {
      ...topic,
      id: topic.id ?? idGenerator.generate("topic"),
      createdAt: topic.createdAt ?? now,
      updatedAt: topic.updatedAt ?? now,
    };

    // Reject duplicate ids — the caller is responsible for resolving conflicts.
    if (data.topics.some((t) => t.id === newTopic.id)) {
      throw new Error(`Topic with id '${newTopic.id}' already exists`);
    }

    data.topics.push(newTopic);
    this.saveTopics(data);

    return newTopic;
  }

  /**
   * Get a topic by id.
   */
  async getTopic(id: string): Promise<Topic | null> {
    const data = this.loadTopics();
    return data.topics.find((t) => t.id === id) || null;
  }

  /**
   * Get all topics.
   */
  async getTopics(): Promise<Topic[]> {
    const data = this.loadTopics();
    return data.topics;
  }

  /**
   * Update topic properties. `id`, `createdAt`, and `trailIds` are not
   * updatable here — use the trail-membership methods to mutate `trailIds`.
   */
  async updateTopic(
    id: string,
    updates: Partial<Omit<Topic, "id" | "createdAt" | "trailIds">>,
  ): Promise<Topic> {
    const data = this.loadTopics();
    const topic = data.topics.find((t) => t.id === id);

    if (!topic) {
      throw new Error(`Topic with id '${id}' not found`);
    }

    Object.assign(topic, updates, {
      updatedAt: new Date().toISOString(),
    });

    this.saveTopics(data);
    return topic;
  }

  /**
   * Delete a topic. Does NOT cascade to the underlying trails — the trails
   * remain in their own store; the topic just stops listing them.
   */
  async deleteTopic(id: string): Promise<boolean> {
    const data = this.loadTopics();
    const index = data.topics.findIndex((t) => t.id === id);

    if (index === -1) {
      return false;
    }

    data.topics.splice(index, 1);
    this.saveTopics(data);

    return true;
  }

  // ===== Trail membership =====

  /**
   * Append a trail to the topic's ordered list. No-op if the trail is
   * already present.
   */
  async addTrailToTopic(topicId: string, trailId: string): Promise<Topic> {
    const data = this.loadTopics();
    const topic = data.topics.find((t) => t.id === topicId);

    if (!topic) {
      throw new Error(`Topic with id '${topicId}' not found`);
    }

    if (!topic.trailIds.includes(trailId)) {
      topic.trailIds.push(trailId);
      topic.updatedAt = new Date().toISOString();
      this.saveTopics(data);
    }

    return topic;
  }

  /**
   * Remove a trail from the topic. No-op if the trail isn't present.
   */
  async removeTrailFromTopic(
    topicId: string,
    trailId: string,
  ): Promise<Topic> {
    const data = this.loadTopics();
    const topic = data.topics.find((t) => t.id === topicId);

    if (!topic) {
      throw new Error(`Topic with id '${topicId}' not found`);
    }

    const before = topic.trailIds.length;
    topic.trailIds = topic.trailIds.filter((id) => id !== trailId);

    if (topic.trailIds.length !== before) {
      topic.updatedAt = new Date().toISOString();
      this.saveTopics(data);
    }

    return topic;
  }

  /**
   * Replace the trail list with a new ordered list. The new list must be a
   * permutation of the existing one — adding or removing trails should go
   * through the dedicated add/remove methods so the intent is explicit.
   */
  async reorderTopicTrails(
    topicId: string,
    trailIds: string[],
  ): Promise<Topic> {
    const data = this.loadTopics();
    const topic = data.topics.find((t) => t.id === topicId);

    if (!topic) {
      throw new Error(`Topic with id '${topicId}' not found`);
    }

    const current = new Set(topic.trailIds);
    const next = new Set(trailIds);

    if (
      current.size !== next.size ||
      [...current].some((id) => !next.has(id))
    ) {
      throw new Error(
        `reorderTopicTrails expects a permutation of the existing trail list`,
      );
    }

    topic.trailIds = [...trailIds];
    topic.updatedAt = new Date().toISOString();
    this.saveTopics(data);

    return topic;
  }

  // ===== Query helpers =====

  /**
   * Find all topics that include a given trail.
   */
  async getTopicsForTrail(trailId: string): Promise<Topic[]> {
    const data = this.loadTopics();
    return data.topics.filter((t) => t.trailIds.includes(trailId));
  }
}
