export class IdentityProvider {
  async resolveIdentity(request) {
    void request;
    throw new Error("resolveIdentity() is not implemented");
  }
}

export class DevelopmentIdentityProvider extends IdentityProvider {
  constructor(defaultAccountId = "acct-alex") {
    super();
    this.defaultAccountId = defaultAccountId;
  }

  async resolveIdentity(request) {
    const cookie = request?.headers?.get?.("cookie") || "";
    const cookieAccount = cookie.match(/(?:^|;\s*)interlocks-dev-account=([^;]+)/)?.[1];
    return {
      provider: "development",
      issuer: "interlocks-local",
      providerSubject: request?.headers?.get?.("x-interlocks-account") || cookieAccount || this.defaultAccountId,
    };
  }
}

export class WorkOSIdentityProvider extends IdentityProvider {
  async resolveIdentity() {
    const { withAuth } = await import("@workos-inc/authkit-nextjs");
    const { user } = await withAuth({ ensureSignedIn: true });
    return {
      provider: "workos",
      issuer: "https://api.workos.com/user_management",
      providerSubject: user.id,
      email: user.email,
      displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
    };
  }
}
