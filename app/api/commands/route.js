import { resolveRequestActor } from "../../../lib/auth/request-actor.mjs";
import { getRepository } from "../../../lib/persistence/index.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  const repository = getRepository();
  try {
    const actor = await resolveRequestActor(request, repository);
    const body = await request.json();
    const workspaceId = body.workspaceId;
    const commands = {
      "workspace.create": () => repository.createWorkspace(actor.accountId, body.input),
      "invitation.create": () => repository.createInvitation(actor.accountId, workspaceId, body.input),
      "invitation.accept": () => repository.acceptInvitation(actor.accountId, body.input.token),
      "membership.update": () => repository.updateMembership(actor.accountId, workspaceId, body.resourceId, body.input),
      "entity.create": () => repository.createEntity(actor.accountId, workspaceId, body.input),
      "matter.create": () => repository.createMatter(actor.accountId, workspaceId, body.input),
      "assertion.create": () => repository.createAssertion(actor.accountId, workspaceId, body.input),
      "inference.create": () => repository.createInference(actor.accountId, workspaceId, body.input),
      "document.upload": () => repository.uploadDocument(actor.accountId, workspaceId, body.input),
      "check.create": () => repository.createConflictCheck(actor.accountId, workspaceId, body.input),
      "disclosure.create": () => repository.createDisclosure(body.input, actor.accountId, workspaceId),
      "case.action": () => repository.recordCaseAction(body.resourceId, body.input, actor.accountId),
      "consent.create": () => repository.createConsent(actor.accountId, body.resourceId, body.input),
      "screen.create": () => repository.createScreen(actor.accountId, body.resourceId, body.input),
      "control.complete": () => repository.completeControl(body.resourceId, actor.accountId),
      "associated.request": () => repository.createAssociatedPersonRequest(actor.accountId, workspaceId, body.input),
      "associated.respond": () => repository.respondAssociatedPerson(actor.accountId, body.resourceId, body.input),
      "family.association.create": () => repository.createPersonalAssociation(actor.accountId, body.input),
      "family.association.end": () => repository.endPersonalAssociation(actor.accountId, body.resourceId),
      "family.interest.create": () => repository.createAssociationInterest(actor.accountId, body.resourceId, body.input),
      "family.interest.revoke": () => repository.revokeAssociationInterest(actor.accountId, body.resourceId),
      "family.link.request": () => repository.requestFamilyAccountLink(actor.accountId, body.input),
      "family.link.respond": () => repository.respondFamilyAccountLink(actor.accountId, body.resourceId, body.input),
      "family.link.revoke": () => repository.revokeFamilyAccountLink(actor.accountId, body.resourceId),
      "import.preview": () => repository.previewImport(actor.accountId, workspaceId, body.input),
      "import.commit": () => repository.commitImport(actor.accountId, workspaceId, body.input),
      "demo.reset": () => repository.resetDemo(actor.accountId),
    };
    const execute = commands[body.command];
    if (!execute) throw new Error("Unsupported command");
    return Response.json({ result: execute() }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const { apiError } = await import("../../../lib/auth/request-actor.mjs");
    return apiError(error);
  }
}
