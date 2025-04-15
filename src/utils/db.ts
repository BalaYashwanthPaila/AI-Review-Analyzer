import path from "path";
const SimpleJsonDB = require("simple-json-db");

interface ContextItem {
  id: string;
  source: string;
  content: string;
  title?: string;
  url?: string;
  embedding?: number[];
  createdAt: string;
  similarity?: number;
}

// Enhanced singleton with similarity search capabilities
class DatabaseSingleton {
  private static instance: DatabaseSingleton;
  private db: any;

  private constructor() {
    const dbPath = path.join(process.cwd(), "data/context-db.json");
    this.db = new SimpleJsonDB(dbPath, {
      asyncWrite: true,
      jsonSpaces: 2,
    });

    // Initialize context array if it doesn't exist
    if (!this.db.has("context")) {
      this.db.set("context", []);
    }
  }

  public static getInstance(): DatabaseSingleton {
    if (!DatabaseSingleton.instance) {
      DatabaseSingleton.instance = new DatabaseSingleton();
    }
    return DatabaseSingleton.instance;
  }

  // Get data from the DB
  public get(key: string): any {
    return this.db.get(key);
  }

  // Set data in the DB
  public set(key: string, value: any): void {
    this.db.set(key, value);
  }

  // Check if a key exists
  public has(key: string): boolean {
    return this.db.has(key);
  }

  // Delete a key
  public delete(key: string): void {
    this.db.delete(key);
  }

  // Find similar context items using cosine similarity
  public findSimilarContexts(
    queryEmbedding: number[],
    limit: number = 3
  ): ContextItem[] {
    const contexts = this.get("context") as ContextItem[];

    if (!contexts || contexts.length === 0) {
      return [];
    }

    // Calculate cosine similarity for each context item that has embeddings
    const withSimilarity = contexts
      .filter((item) => item.embedding && item.embedding.length > 0)
      .map((item) => {
        const similarity = this.cosineSimilarity(
          queryEmbedding,
          item.embedding as number[]
        );
        return { ...item, similarity };
      });

    // Sort by similarity (descending) and take top results
    return withSimilarity
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  // Calculate cosine similarity between two vectors
  private cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// Export a single instance with enhanced functionality
const dbInstance = DatabaseSingleton.getInstance();

export default dbInstance;
