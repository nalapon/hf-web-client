/**
 * An interface that defines a generic, asynchronous key-value storage mechanism.
 * This allows us to easily swap storage backends (e.g., IndexedDB for the browser,
 * filesystem for Node.js) without changing the core engine logic.
 */
export interface IKeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear?(): Promise<void>;
} 