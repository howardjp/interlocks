import { SqliteInterlocksRepository } from "./sqlite-interlocks-repository.mjs";

const globalRepository = globalThis;

export function getRepository() {
  if (!globalRepository.__interlocksRepository) {
    globalRepository.__interlocksRepository = new SqliteInterlocksRepository();
  }
  return globalRepository.__interlocksRepository;
}
