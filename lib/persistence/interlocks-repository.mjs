/**
 * Persistence contract for the application layer.
 *
 * SQLite is the prototype adapter. A hosted database can replace it without
 * changing route handlers or UI code as long as this contract is preserved.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
export class InterlocksRepository {
  getSnapshot(_accountId, _workspaceId, _options) {
    throw new Error("getSnapshot() is not implemented");
  }

  createDisclosure(_input, _accountId, _workspaceId) {
    throw new Error("createDisclosure() is not implemented");
  }

  recordCaseAction(_caseId, _action, _accountId) {
    throw new Error("recordCaseAction() is not implemented");
  }

  completeControl(_controlId, _accountId) {
    throw new Error("completeControl() is not implemented");
  }

  exportData(_accountId, _workspaceId, _kind, _resourceId) {
    throw new Error("exportData() is not implemented");
  }

  resetDemo(_accountId) {
    throw new Error("resetDemo() is not implemented");
  }

  createConflictCheck(_accountId, _workspaceId, _input) { throw new Error("createConflictCheck() is not implemented"); }
  createAssertion(_accountId, _workspaceId, _input) { throw new Error("createAssertion() is not implemented"); }
  createInference(_accountId, _workspaceId, _input) { throw new Error("createInference() is not implemented"); }
  uploadDocument(_accountId, _workspaceId, _input) { throw new Error("uploadDocument() is not implemented"); }
  createConsent(_accountId, _caseId, _input) { throw new Error("createConsent() is not implemented"); }
  createScreen(_accountId, _caseId, _input) { throw new Error("createScreen() is not implemented"); }
}
