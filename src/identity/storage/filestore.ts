import { promises as fs } from "fs";
import { IKeyValueStore } from "./ikeystore";
import * as path from "path";

// Helper functions to handle serialization of binary data to JSON
function replacer(_key: string, value: any) {
  if (value instanceof Uint8Array) {
    return { __dataType: "Uint8Array", data: Array.from(value) };
  }
  if (value instanceof ArrayBuffer) {
    const base64 = Buffer.from(value).toString("base64");
    return { __dataType: "ArrayBuffer", data: base64 };
  }
  return value;
}

function reviver(_key: string, value: any) {
  if (value && typeof value === "object") {
    if (value.__dataType === "Uint8Array") {
      return new Uint8Array(value.data);
    }
    if (value.__dataType === "ArrayBuffer") {
      const buffer = Buffer.from(value.data, "base64");
      // Return ArrayBuffer
      return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      );
    }
  }
  return value;
}

/**
 * An implementation of IKeyValueStore that uses a local JSON file as a backend.
 * This is the default storage provider for Node.js environments.
 */
export class FileStore implements IKeyValueStore {
  private filePath: string;
  private inMemoryCache: Map<string, any> = new Map();
  private isLoaded = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      if (!data.trim()) {
        this.inMemoryCache = new Map();
        return;
      }
      try {
        const parsed = JSON.parse(data, reviver);
        this.inMemoryCache = new Map(Object.entries(parsed));
      } catch (e) {
        // If not valid JSON, reset the file and cache
        await fs.writeFile(this.filePath, "", "utf-8");
        this.inMemoryCache = new Map();
        console.warn(`[FileStore] Corrupted identity file detected and reset: ${this.filePath}`);
      }
    } catch (error: any) {
      // If the file doesn't exist, that's fine. We'll create it on the first `set`.
      if (error.code !== "ENOENT") {
        throw error;
      }
      this.inMemoryCache = new Map();
    }
  }

  private async save(): Promise<void> {
    const data =
      this.inMemoryCache.size > 0
        ? JSON.stringify(Object.fromEntries(this.inMemoryCache), replacer)
        : "";

    const dir = path.dirname(this.filePath);
    console.log(`[FileStore] Attempting to create directory: ${dir}`);
    await fs.mkdir(dir, { recursive: true });
    console.log(`[FileStore] Directory created or already exists: ${dir}`);

    const tempPath = this.filePath + ".tmp";
    console.log(`[FileStore] Writing to temporary file: ${tempPath}`);
    await fs.writeFile(tempPath, data, "utf-8");
    console.log(`[FileStore] Renaming ${tempPath} to ${this.filePath}`);
    await fs.rename(tempPath, this.filePath);
    console.log(`[FileStore] Save successful to: ${this.filePath}`);
  }

  public async get<T>(key: string): Promise<T | undefined> {
    await this.load();
    return this.inMemoryCache.get(key) as T | undefined;
  }

  public async set<T>(key: string, value: T): Promise<void> {
    await this.load();
    this.inMemoryCache.set(key, value);
    await this.save();
  }

  public async del(key: string): Promise<void> {
    await this.load();
    this.inMemoryCache.delete(key);
    await this.save();
  }

  public async keys(): Promise<string[]> {
    await this.load();
    return Array.from(this.inMemoryCache.keys());
  }

  public async clear(): Promise<void> {
    this.inMemoryCache.clear();
    await this.save();
  }

  public async setMany(entries: Record<string, any>): Promise<void> {
    await this.load();
    for (const [key, value] of Object.entries(entries)) {
      this.inMemoryCache.set(key, value);
    }
    await this.save();
  }
} 