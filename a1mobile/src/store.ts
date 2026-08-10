import { EventEmitter } from "node:events";
import type { CoordinationCase } from "./types.js";

export type CaseListener = (coordinationCase: CoordinationCase) => void;

export class CaseStore {
  private readonly cases = new Map<string, CoordinationCase>();
  private readonly emitter = new EventEmitter();

  create(coordinationCase: CoordinationCase): CoordinationCase {
    if (this.cases.has(coordinationCase.id)) throw new Error(`Case already exists: ${coordinationCase.id}`);
    this.cases.set(coordinationCase.id, structuredClone(coordinationCase));
    return this.emit(coordinationCase.id);
  }

  get(id: string): CoordinationCase | undefined {
    const value = this.cases.get(id);
    return value ? structuredClone(value) : undefined;
  }

  list(): CoordinationCase[] {
    return [...this.cases.values()]
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((value) => structuredClone(value));
  }

  mutate(id: string, update: (coordinationCase: CoordinationCase) => void): CoordinationCase {
    const existing = this.cases.get(id);
    if (!existing) throw new Error(`Unknown coordination case: ${id}`);
    update(existing);
    existing.updatedAt = Date.now();
    return this.emit(id);
  }

  subscribe(id: string, listener: CaseListener): () => void {
    const eventName = `case:${id}`;
    this.emitter.on(eventName, listener);
    return () => this.emitter.off(eventName, listener);
  }

  private emit(id: string): CoordinationCase {
    const value = this.get(id);
    if (!value) throw new Error(`Unknown coordination case: ${id}`);
    this.emitter.emit(`case:${id}`, value);
    return value;
  }
}
