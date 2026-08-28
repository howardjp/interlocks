export const ACTIONS = Object.freeze({
  READ_WORKSPACE: "workspace.read",
  MANAGE_WORKSPACE: "workspace.manage",
  REVIEW: "review.perform",
  MANAGE_MEMBERS: "membership.manage",
  READ_PERSONAL_LEDGER: "ledger.read.personal",
  SHARE_PERSONAL_LEDGER: "ledger.share.personal",
  PLATFORM_ADMIN: "platform.admin",
  EXPORT: "data.export",
  VIEW_DOCUMENT: "document.view",
});

const MEMBER_ACTIONS = new Set([ACTIONS.READ_WORKSPACE, ACTIONS.VIEW_DOCUMENT]);
const REVIEWER_ACTIONS = new Set([...MEMBER_ACTIONS, ACTIONS.REVIEW]);
const FIRMADMIN_ACTIONS = new Set([...MEMBER_ACTIONS, ACTIONS.MANAGE_WORKSPACE, ACTIONS.MANAGE_MEMBERS, ACTIONS.EXPORT]);

export class AuthorizationService {
  can(actor, action, { workspaceId = null, ownerPersonId = null } = {}) {
    if (!actor || actor.accountStatus !== "ACTIVE") return false;
    if ([ACTIONS.READ_PERSONAL_LEDGER, ACTIONS.SHARE_PERSONAL_LEDGER].includes(action)) {
      return Boolean(ownerPersonId) && actor.personId === ownerPersonId;
    }
    if (actor.platformRole === "SUPERADMIN") return true;
    if (!workspaceId) return false;
    const membership = actor.memberships?.find((item) => item.workspaceId === workspaceId && item.status === "ACTIVE");
    if (!membership) return false;
    return membership.roles.some((role) => {
      if (role === "MEMBER") return MEMBER_ACTIONS.has(action);
      if (role === "REVIEWER") return REVIEWER_ACTIONS.has(action);
      if (role === "FIRMADMIN") return FIRMADMIN_ACTIONS.has(action);
      return false;
    });
  }

  require(actor, action, context = {}) {
    if (!this.can(actor, action, context)) {
      const error = new Error("You are not authorized to perform this action");
      error.code = "FORBIDDEN";
      throw error;
    }
  }
}
