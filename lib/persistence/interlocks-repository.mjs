/**
 * Persistence contract for the application layer.
 *
 * SQLite is the prototype adapter. A hosted database can replace it without
 * changing route handlers or UI code as long as this contract is preserved.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
export class InterlocksRepository {
  getSnapshot() {
    throw new Error("getSnapshot() is not implemented");
  }

  createDisclosure(_input, _actor) {
    throw new Error("createDisclosure() is not implemented");
  }

  recordCaseAction(_caseId, _action, _actor) {
    throw new Error("recordCaseAction() is not implemented");
  }

  completeControl(_controlId, _actor) {
    throw new Error("completeControl() is not implemented");
  }

  exportData() {
    throw new Error("exportData() is not implemented");
  }

  resetDemo(_actor) {
    throw new Error("resetDemo() is not implemented");
  }
}
