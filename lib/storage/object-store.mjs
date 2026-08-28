import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export class ObjectStore {
  putImmutable(bytes) { void bytes; throw new Error("putImmutable() is not implemented"); }
  get(storageKey) { void storageKey; throw new Error("get() is not implemented"); }
}

export class InMemoryObjectStore extends ObjectStore {
  constructor() {
    super();
    this.objects = new Map();
  }

  putImmutable(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? Buffer.from(bytes) : Buffer.from(bytes);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const storageKey = `memory/${sha256}/${randomUUID()}`;
    this.objects.set(storageKey, buffer);
    return { storageKey, sha256, size: buffer.length };
  }

  get(storageKey) {
    const bytes = this.objects.get(storageKey);
    if (!bytes) throw new Error("Document bytes not found");
    return Buffer.from(bytes);
  }
}

export class LocalFilesystemObjectStore extends ObjectStore {
  constructor(rootPath = ".data/documents") {
    super();
    this.rootPath = resolve(rootPath);
    mkdirSync(this.rootPath, { recursive: true });
  }

  putImmutable(bytes) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const storageKey = join(sha256.slice(0, 2), `${sha256}-${randomUUID()}`);
    const path = join(this.rootPath, storageKey);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buffer, { flag: "wx", mode: 0o600 });
    return { storageKey, sha256, size: buffer.length };
  }

  get(storageKey) {
    const path = resolve(this.rootPath, storageKey);
    if (!path.startsWith(`${this.rootPath}/`) || !existsSync(path)) throw new Error("Document bytes not found");
    return readFileSync(path);
  }
}
