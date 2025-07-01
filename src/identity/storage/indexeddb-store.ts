import { get, set, del, keys, type UseStore } from "idb-keyval";
import type { IKeyValueStore } from "./ikeystore";

/**
 * An implementation of IKeyValueStore that uses IndexedDB as the backend.
 * This is the default storage provider for browser-based environments.
 */
export class IndexedDBStore implements IKeyValueStore {
  private customStore: UseStore;

  constructor() {
    // We can create a custom store if needed, but for now, we'll use the default.
    this.customStore = (tx, anies) => anies as any;
  }

  public async get<T>(key: string): Promise<T | undefined> {
    return get<T>(key, this.customStore);
  }

  public async set<T>(key: string, value: T): Promise<void> {
    return set(key, value, this.customStore);
  }

  public async del(key: string): Promise<void> {
    return del(key, this.customStore);
  }

  public async keys(): Promise<string[]> {
    return keys(this.customStore);
  }
} 