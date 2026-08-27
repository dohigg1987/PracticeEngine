import { beforeEach, describe, expect, it, vi } from "vitest";

const { token } = vi.hoisted(() => ({
  token: vi.fn(async () => "jwt-current"),
}));
vi.mock("./auth", () => ({
  freshAuthToken: token,
  demoMode: false,
  AuthRequiredError: class AuthRequiredError extends Error {},
}));

import { api, clearSessionRequestCache, sessionCacheTtlForPath } from "./api";

const fetchMock = vi.fn(
  async () =>
    new Response(JSON.stringify({ items: [], item: {}, created: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
);
const call = (index: number) => {
  const [url, init] = fetchMock.mock.calls[index] as unknown as [
    string,
    RequestInit,
  ];
  return {
    url,
    init,
    headers: init.headers as Record<string, string>,
    body:
      init.body instanceof FormData
        ? init.body
        : init.body
          ? JSON.parse(String(init.body))
          : undefined,
  };
};

describe("authenticated API boundary", () => {
  beforeEach(() => {
    clearSessionRequestCache();
    fetchMock.mockReset().mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [], item: {}, created: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    token.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("uses tenant-scoped session caching only for measured navigation and stable reference reads", () => {
    expect(sessionCacheTtlForPath("/v1/practice/resources")).toBe(300_000);
    expect(sessionCacheTtlForPath("/v1/platform/teams")).toBe(300_000);
    expect(sessionCacheTtlForPath("/v1/crm/prospects")).toBe(30_000);
    expect(sessionCacheTtlForPath("/v1/engagements/engagement-1/dashboard")).toBe(30_000);
    expect(sessionCacheTtlForPath("/v1/engagements/engagement-1/report")).toBe(0);
  });

  it("deduplicates repeated route-list reads for the same tenant without sharing across tenants", async () => {
    await Promise.all([
      api.resourceProfiles({ tenantId: "tenant-1" }),
      api.resourceProfiles({ tenantId: "tenant-1" }),
    ]);
    await api.resourceProfiles({ tenantId: "tenant-2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(call(0).headers["x-tenant-id"]).toBe("tenant-1");
    expect(call(1).headers["x-tenant-id"]).toBe("tenant-2");
  });

  it("does not restore stale protected data after an authorization failure", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    await api.resourceProfiles({ tenantId: "tenant-1" });
    now.mockReturnValue(301_001);
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 }));
    await api.resourceProfiles({ tenantId: "tenant-1" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await api.resourceProfiles({ tenantId: "tenant-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    now.mockRestore();
  });

  it("does not let an in-flight read repopulate cache after a tenant mutation", async () => {
    let completeRead!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { completeRead = resolve; }));
    const pendingRead = api.resourceProfiles({ tenantId: "tenant-1" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await api.updateResourceProfile({ tenantId: "tenant-1" }, "resource-1", { jobTitle: "Manager" });
    completeRead(new Response(JSON.stringify({ items: [{ id: "stale" }] }), { status: 200 }));
    await pendingRead;
    await api.resourceProfiles({ tenantId: "tenant-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("discovers tenants with a fresh bearer token and no tenant or actor header", async () => {
    await api.tenantMemberships();
    expect(token).toHaveBeenCalledOnce();
    expect(call(0).url).toBe("/v1/me/tenants");
    expect(call(0).headers.authorization).toBe("Bearer jwt-current");
    expect(call(0).headers["x-tenant-id"]).toBeUndefined();
    expect(call(0).headers["x-actor-id"]).toBeUndefined();
  });

  it("creates a first workspace through the actor-only onboarding endpoint", async () => {
    await api.createTenant("North Star Accounts");
    expect(call(0)).toMatchObject({
      url: "/v1/me/tenants",
      body: { name: "North Star Accounts" },
    });
    expect(call(0).init.method).toBe("POST");
    expect(call(0).headers["x-tenant-id"]).toBeUndefined();
  });

  it("loads only server-filtered reporting packs for the selected engagement", async () => {
    await api.reportingPacks({ tenantId: "tenant-1" }, "engagement/1");
    expect(call(0).url).toBe("/v1/engagements/engagement%2F1/reporting-packs");
    expect(call(0).init.method).toBeUndefined();
    expect(call(0).headers["x-tenant-id"]).toBe("tenant-1");
  });

  it("generates and retrieves HTML and PDF only through authenticated proxy routes", async () => {
    const context = { tenantId: "tenant-1" };
    await api.generateAccountsHtml(context, "engagement/1", "version/1");
    await api.accountsArtefactCapabilities(
      context,
      "engagement/1",
      "version/1",
    );
    await api.accountsHtmlBlob(
      context,
      "/v1/engagements/engagement%2F1/accounts-versions/version%2F1/artefacts/html?download=1",
    );
    await api.generateAccountsPdf(context, "engagement/1", "version/1");
    await api.accountsPdfBlob(
      context,
      "/v1/engagements/engagement%2F1/accounts-versions/version%2F1/artefacts/pdf?download=1",
    );
    expect(call(0).url).toBe(
      "/v1/engagements/engagement%2F1/accounts-versions/version%2F1/artefacts/html",
    );
    expect(call(0).init.method).toBe("POST");
    expect(call(0).init.body).toBeUndefined();
    expect(call(1).url).toContain("/artefacts/capabilities");
    expect(call(2).url).toContain("/artefacts/html?download=1");
    expect(call(2).headers.authorization).toBe("Bearer jwt-current");
    expect(call(2).headers["x-tenant-id"]).toBe("tenant-1");
    expect(call(3).url).toBe(
      "/v1/engagements/engagement%2F1/accounts-versions/version%2F1/artefacts/pdf",
    );
    expect(call(3).init.method).toBe("POST");
    expect(call(3).init.body).toBeUndefined();
    expect(call(4).url).toContain("/artefacts/pdf?download=1");
    expect(call(4).headers.authorization).toBe("Bearer jwt-current");
    expect(call(4).headers["x-tenant-id"]).toBe("tenant-1");
    await expect(
      api.accountsHtmlBlob(context, "https://untrusted.example/output.html"),
    ).rejects.toMatchObject({ code: "INVALID_ARTEFACT_PATH" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("checks and downloads the release evidence bundle through authenticated routes", async () => {
    const context = { tenantId: "tenant-1" };
    await api.evidenceBundleCapability(context, "engagement/1", "version/1");
    await api.evidenceBundleBlob(context, "engagement/1", "version/1");

    expect(call(0).url).toBe(
      "/v1/engagements/engagement%2F1/accounts-versions/version%2F1/evidence-bundle/capabilities",
    );
    expect(call(1).url).toBe(
      "/v1/engagements/engagement%2F1/accounts-versions/version%2F1/evidence-bundle.zip",
    );
    expect(call(1).headers.authorization).toBe("Bearer jwt-current");
    expect(call(1).headers["x-tenant-id"]).toBe("tenant-1");
  });

  it("preserves blocked evidence readiness details from the API contract", async () => {
    const capability = {
      available: false,
      code: "EVIDENCE_DEPENDENCIES_UNAVAILABLE",
      formatVersion: "accounts-evidence-bundle-v1",
      accountsVersion: {
        id: "version/1",
        version: 4,
        status: "FINAL",
        contentHash: "sha256:accounts",
      },
      dependencies: {
        complete: false,
        referencedObjectCount: 7,
        missing: [{ kind: "WORKING_PAPER_VERSION", dependency_id: "paper/2" }],
      },
      signoffs: {
        total: 3,
        active: 2,
        invalidated: 1,
        activeTypes: ["PREPARED", "REVIEWED"],
        preparedAndReviewed: true,
        clientAndPartnerApproved: false,
        filingAuthorised: false,
      },
      artefacts: {
        html: { generated: true },
        pdf: { generated: false },
      },
      auditEventCount: 12,
      maxSourceBytes: 20 * 1024 * 1024,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ capability }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await api.evidenceBundleCapability(
      { tenantId: "tenant-1" },
      "engagement/1",
      "version/1",
    );

    expect(result.capability).toEqual(capability);
    expect(result.capability.dependencies.missing).toEqual([
      { kind: "WORKING_PAPER_VERSION", dependency_id: "paper/2" },
    ]);
    expect(result.capability.signoffs).toMatchObject({
      active: 2,
      invalidated: 1,
      clientAndPartnerApproved: false,
      filingAuthorised: false,
    });
    expect(result.capability.artefacts.pdf.generated).toBe(false);
  });

  it("surfaces the stable readiness error when a blocked bundle is downloaded", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "EVIDENCE_DEPENDENCIES_UNAVAILABLE",
            message: "Evidence dependencies are unavailable",
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      api.evidenceBundleBlob(
        { tenantId: "tenant-1" },
        "engagement/1",
        "version/1",
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "EVIDENCE_DEPENDENCIES_UNAVAILABLE",
      message: "Evidence dependencies are unavailable",
    });
  });

  it("prepares and records manual filing attempt states without response decisions", async () => {
    const context = { tenantId: "tenant-1" };
    await api.createFilingAttempt(
      context,
      "engagement/1",
      "version/1",
      "COMPANIES_HOUSE",
    );
    await api.updateFilingAttempt(
      context,
      "engagement/1",
      "filing/1",
      "SUBMITTED",
    );
    expect(call(0)).toMatchObject({
      url: "/v1/engagements/engagement%2F1/filing-attempts",
      body: {
        accountsVersionId: "version/1",
        regulator: "COMPANIES_HOUSE",
      },
    });
    expect(call(0).init.method).toBe("POST");
    expect(call(1)).toMatchObject({
      url: "/v1/engagements/engagement%2F1/filing-attempts/filing%2F1",
      body: { status: "SUBMITTED" },
    });
    expect(call(1).init.method).toBe("PATCH");
    expect(call(1).headers["x-tenant-id"]).toBe("tenant-1");
  });

  it("uploads regulator decision evidence atomically as authenticated multipart", async () => {
    const file = new File(["accepted"], "regulator-response.txt", {
      type: "text/plain",
    });
    await api.uploadFilingEvidence(
      { tenantId: "tenant-1" },
      "engagement/1",
      "filing/1",
      file,
      "ACCEPTED",
      " CH-REF-1 ",
    );
    const request = call(0);
    expect(request.url).toBe(
      "/v1/engagements/engagement%2F1/filing-attempts/filing%2F1/evidence",
    );
    expect(request.init.method).toBe("POST");
    expect(request.headers.authorization).toBe("Bearer jwt-current");
    expect(request.headers["x-tenant-id"]).toBe("tenant-1");
    expect(request.headers["content-type"]).toBeUndefined();
    const body = request.body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("status")).toBe("ACCEPTED");
    expect(body.get("regulatorReference")).toBe("CH-REF-1");
    expect([...body.keys()]).toEqual(["file", "status", "regulatorReference"]);
  });

  it("keeps team management tenant-scoped and invitation acceptance actor-only", async () => {
    const context = { tenantId: "tenant-1" };
    await api.team(context);
    await api.createTeamInvitation(context, "MEMBER", 48);
    await api.revokeTeamInvitation(context, "invite/1");
    await api.acceptInvitation("base64url-secret");
    expect(call(0).url).toBe("/v1/team");
    expect(call(0).headers["x-tenant-id"]).toBe("tenant-1");
    expect(call(1)).toMatchObject({
      url: "/v1/team/invitations",
      body: { role: "MEMBER", expiresInHours: 48 },
    });
    expect(call(2).url).toBe("/v1/team/invitations/invite%2F1/revoke");
    expect(call(2).init.method).toBe("POST");
    expect(call(3)).toMatchObject({
      url: "/v1/me/invitations/accept",
      body: { token: "base64url-secret" },
    });
    expect(call(3).headers["x-tenant-id"]).toBeUndefined();
    expect(call(3).headers["x-actor-id"]).toBeUndefined();
  });

  it("sends exact lifecycle routes, methods, tenant headers and payloads", async () => {
    const context = { tenantId: "tenant-1" },
      engagement = "engagement/1",
      object = "paper/1";
    await api.createWorkingPaper(context, engagement, {
      code: "A1",
      title: "Cash",
      categoryCode: "ASSETS",
      objective: "Verify cash balances and presentation.",
      content: { narrative: "Evidence" },
    });
    await api.createWorkingPaperVersion(context, engagement, object, {
      narrative: "Updated",
    });
    await api.updateDisclosure(context, engagement, "disc/1", {
      applicability: "REQUIRED",
      status: "COMPLETE",
    });
    await api.createDisclosureVersion(context, engagement, "disc/1", {
      answer: "Yes",
      explanation: "Policy supplied",
    });
    await api.generateAccountsVersion(context, engagement, "FRS102-2026", 3);
    await api.transitionAccountsVersion(
      context,
      engagement,
      "version/1",
      "REVIEWED",
    );
    await api.signoffAccountsVersion(
      context,
      engagement,
      "version/1",
      2,
      "PREPARED",
    );
    await api.filingAttempts(context, engagement);

    expect(token).toHaveBeenCalledTimes(8);
    expect(
      fetchMock.mock.calls.every(
        (_, index) => call(index).headers["x-tenant-id"] === "tenant-1",
      ),
    ).toBe(true);
    expect(call(0)).toMatchObject({
      url: "/v1/engagements/engagement%2F1/working-papers",
      body: {
        code: "A1",
        title: "Cash",
        categoryCode: "ASSETS",
        objective: "Verify cash balances and presentation.",
        content: { narrative: "Evidence" },
      },
    });
    expect(call(1)).toMatchObject({
      url: "/v1/engagements/engagement%2F1/working-papers/paper%2F1/versions",
      body: { content: { narrative: "Updated" } },
    });
    expect(call(2).init.method).toBe("PATCH");
    expect(call(2).body).toEqual({
      applicability: "REQUIRED",
      status: "COMPLETE",
    });
    expect(call(3).body).toEqual({
      answer: { answer: "Yes", explanation: "Policy supplied" },
    });
    expect(call(4)).toMatchObject({
      url: "/v1/engagements/engagement%2F1/accounts-versions/generate",
      body: { frameworkPackId: "FRS102-2026", frameworkPackVersionNo: 3 },
    });
    expect(call(5).url).toContain("/accounts-versions/version%2F1/transitions");
    expect(call(6).body).toEqual({
      objectType: "ACCOUNTS_VERSION",
      objectId: "version/1",
      objectVersion: 2,
      signoffType: "PREPARED",
    });
    expect(call(7).url).toBe("/v1/engagements/engagement%2F1/filing-attempts");
  });

  it("creates a versioned disclosure through the engagement contract", async () => {
    await api.createDisclosure(
      { tenantId: "tenant-1" },
      "engagement/1",
      {
        disclosureCode: "SORP.INCOME_RECOGNITION",
        applicability: "REQUIRED",
        answer: { narrative: "Income recognition policy" },
      },
    );
    expect(call(0)).toMatchObject({
      url: "/v1/engagements/engagement%2F1/disclosures",
      body: {
        disclosureCode: "SORP.INCOME_RECOGNITION",
        applicability: "REQUIRED",
        answer: { narrative: "Income recognition policy" },
      },
    });
    expect(call(0).init.method).toBe("POST");
  });

  it("keeps working-paper governance and evidence behind authenticated tenant routes", async () => {
    const context = { tenantId: "tenant-1" };
    const engagement = "engagement/1";
    const paper = "paper/1";
    await api.workingPaperGovernanceCatalogue(context, engagement);
    await api.workingPaperGovernance(context, engagement, paper);
    await api.workingPaperRisks(context, engagement);
    await api.linkWorkingPaperReportLine(
      context,
      engagement,
      paper,
      "line/1",
      "SUPPORTING",
    );
    await api.linkWorkingPaperAssertion(
      context,
      engagement,
      paper,
      "COMPLETENESS",
    );
    await api.linkWorkingPaperRisk(context, engagement, paper, "risk/1");
    await api.linkWorkingPaperTheme(
      context,
      engagement,
      paper,
      "INTERNAL_CONTROLS",
      true,
    );
    await api.workingPaperAttachments(context, engagement, paper);
    const form = new FormData();
    form.append("file", new Blob(["evidence"], { type: "text/plain" }), "evidence.txt");
    form.append("workingPaperVersion", "2");
    form.append("evidenceType", "SOURCE_DOCUMENT");
    await api.uploadWorkingPaperAttachment(context, engagement, paper, form);
    await api.workingPaperAttachmentBlob(
      context,
      "/v1/engagements/engagement%2F1/working-papers/paper%2F1/attachments/attachment%2F1/content",
      true,
    );

    expect(call(0).url).toContain("/working-paper-governance/catalogue");
    expect(call(1).url).toContain("/paper%2F1/governance");
    expect(call(3)).toMatchObject({
      url: "/v1/engagements/engagement%2F1/working-papers/paper%2F1/report-line-links/line%2F1",
      body: { linkPurpose: "SUPPORTING" },
    });
    expect(call(4).body).toEqual({});
    expect(call(6).body).toEqual({ isPrimary: true });
    expect(call(8).init.body).toBe(form);
    expect(call(8).headers["content-type"]).toBeUndefined();
    expect(call(9).url).toContain("/content?download=1");
    expect(
      fetchMock.mock.calls.every(
        (_, index) => call(index).headers["x-tenant-id"] === "tenant-1",
      ),
    ).toBe(true);
  });

  it("replaces each working-paper governance link through an audited route", async () => {
    const context = { tenantId: "tenant-1" };
    const engagement = "engagement/1";
    const paper = "paper/1";
    await api.replaceWorkingPaperReportLine(
      context,
      engagement,
      paper,
      "line-link/1",
      "line/2",
      "Corrected statement classification",
    );
    await api.replaceWorkingPaperAssertion(
      context,
      engagement,
      paper,
      "assertion-link/1",
      "ACCURACY",
      "Corrected assertion",
    );
    await api.replaceWorkingPaperRisk(
      context,
      engagement,
      paper,
      "risk-link/1",
      "risk/2",
      "Linked to the applicable risk",
    );
    await api.replaceWorkingPaperTheme(
      context,
      engagement,
      paper,
      "theme-link/1",
      "GRANT_INCOME",
      "Corrected work theme",
    );

    expect(call(0)).toMatchObject({
      url: "/v1/engagements/engagement%2F1/working-papers/paper%2F1/report-line-links/line-link%2F1/replace",
      body: { reportLineId: "line/2", reason: "Corrected statement classification" },
    });
    expect(call(1).body).toEqual({ assertionCode: "ACCURACY", reason: "Corrected assertion" });
    expect(call(2).body).toEqual({ riskId: "risk/2", reason: "Linked to the applicable risk" });
    expect(call(3)).toMatchObject({
      url: "/v1/engagements/engagement%2F1/working-papers/paper%2F1/theme-links/theme-link%2F1/replace",
      body: { themeCode: "GRANT_INCOME", reason: "Corrected work theme" },
    });
    expect(fetchMock.mock.calls.every((_, index) => call(index).init.method === "POST")).toBe(true);
  });

  it("keeps commercial workspaces tenant scoped and preserves locked request bodies", async () => {
    const context = { tenantId: "tenant-1" };
    await api.createPortalContact(context, "engagement/1", {
      displayName: "Client Approver",
      email: "approver@example.org",
      accessRole: "CLIENT_APPROVER",
    });
    await api.reviewDocumentResponse(
      context,
      "engagement/1",
      "request/1",
      "response/1",
      "APPROVED",
      "Evidence agrees",
    );
    await api.createIntegration(context, "organisation/1", "Nominal template", {
      templateVersion: 1,
    });
    await api.markNotificationRead(context, "notification/1");
    await api.createExportRequest(context, {
      scope: "ENGAGEMENT",
      engagementId: "engagement/1",
      idempotencyKey: "export-key",
    });
    await api.updateTenantLifecycle(context, "SUSPENDED", "Seasonal closure");

    expect(call(0)).toMatchObject({
      url: "/v1/engagements/engagement%2F1/client-portal/contacts",
      body: {
        displayName: "Client Approver",
        email: "approver@example.org",
        accessRole: "CLIENT_APPROVER",
      },
    });
    expect(call(1)).toMatchObject({
      url: "/v1/engagements/engagement%2F1/client-portal/document-requests/request%2F1/review",
      body: {
        responseId: "response/1",
        decision: "APPROVED",
        reason: "Evidence agrees",
      },
    });
    expect(call(2)).toMatchObject({
      url: "/v1/integrations",
      body: {
        organisationId: "organisation/1",
        connectorCode: "CSV",
        displayName: "Nominal template",
        configuration: { templateVersion: 1 },
      },
    });
    expect(call(3).url).toBe("/v1/notifications/notification%2F1/read");
    expect(call(4).body).toEqual({
      scope: "ENGAGEMENT",
      engagementId: "engagement/1",
      idempotencyKey: "export-key",
    });
    expect(call(5).body).toEqual({
      status: "SUSPENDED",
      reason: "Seasonal closure",
    });
    expect(
      fetchMock.mock.calls.every(
        (_, index) => call(index).headers["x-tenant-id"] === "tenant-1",
      ),
    ).toBe(true);
  });

  it("loads a tenant-scoped organisation permanent file without exposing internal storage fields", async () => {
    await api.organisationPermanentFile(
      { tenantId: "tenant-1" },
      "organisation/1",
    );
    expect(call(0)).toMatchObject({
      url: "/v1/organisations/organisation%2F1/permanent-file",
      headers: { "x-tenant-id": "tenant-1" },
    });
    expect(call(0).init.method ?? "GET").toBe("GET");
  });

  it("passes comparative provenance separately when generating accounts", async () => {
    await api.generateAccountsVersion(
      { tenantId: "tenant-1" },
      "engagement/1",
      "CHARITIES-SORP-2026",
      2,
      "prior/version",
    );
    await api.accountsPresentation(
      { tenantId: "tenant-1" },
      "engagement/1",
      "current/version",
    );
    expect(call(0).body).toEqual({
      frameworkPackId: "CHARITIES-SORP-2026",
      frameworkPackVersionNo: 2,
      comparativeAccountsVersionId: "prior/version",
    });
    expect(call(1).url).toBe(
      "/v1/engagements/engagement%2F1/accounts-versions/current%2Fversion/presentation",
    );
  });

  it("keeps practice and portal collaboration on their distinct authenticated routes", async () => {
    const context = { tenantId: "tenant-1" };
    await api.clientRequests(context);
    await api.completeClientRequest(context, "request/1");
    await api.clientPortalRequests(context);
    await api.respondToClientRequest(context, "request/1", {
      responseType: "text",
      text: "The information is attached.",
      idempotencyKey: "response-key",
    });
    await api.clientPortalThreads(context);
    await api.sendClientPortalMessage(context, "thread/1", "Please confirm receipt.", "message-key");

    expect(call(0).url).toBe("/v1/client-requests");
    expect(call(1)).toMatchObject({ url: "/v1/client-requests/request%2F1/complete", body: {} });
    expect(call(2).url).toBe("/v1/portal/requests");
    expect(call(3)).toMatchObject({
      url: "/v1/portal/requests/request%2F1/responses",
      body: { responseType: "text", text: "The information is attached.", idempotencyKey: "response-key" },
    });
    expect(call(4).url).toBe("/v1/portal/messages");
    expect(call(5)).toMatchObject({
      url: "/v1/portal/messages/thread%2F1",
      body: { body: "Please confirm receipt.", idempotencyKey: "message-key" },
    });
    expect(fetchMock.mock.calls.every((_, index) => call(index).headers["x-tenant-id"] === "tenant-1")).toBe(true);
  });

  it("creates clients through the canonical Practice client command", async () => {
    await api.createOrganisation(
      { tenantId: "tenant-1" },
      {
        legalName: "North Star Accounts Ltd",
        legalForm: "PRIVATE_LIMITED_COMPANY",
        jurisdiction: "ENGLAND_AND_WALES",
      },
    );
    expect(call(0)).toMatchObject({
      url: "/v1/clients",
      body: {
        displayName: "North Star Accounts Ltd",
        legalName: "North Star Accounts Ltd",
        entityType: "COMPANY",
        legalForm: "PRIVATE_LIMITED_COMPANY",
        jurisdiction: "ENGLAND_AND_WALES",
      },
      headers: { "x-tenant-id": "tenant-1" },
    });
    expect(call(0).init.method).toBe("POST");
  });

  it("loads and updates prospect details through the audited prospect item route", async () => {
    const context = { tenantId: "tenant-1" };
    await api.crmProspect(context, "prospect/1");
    await api.updateCrmProspect(context, "prospect/1", {
      displayName: "Cedar Advisory Group",
      legalName: "Cedar Advisory Group Ltd",
      source: "Referral",
      status: "qualified",
      responsibleMemberId: "member-1",
      responsibleTeamId: "team-1",
    });

    expect(call(0)).toMatchObject({
      url: "/v1/crm/prospects/prospect%2F1",
      headers: { "x-tenant-id": "tenant-1" },
    });
    expect(call(1)).toMatchObject({
      url: "/v1/crm/prospects/prospect%2F1",
      body: {
        displayName: "Cedar Advisory Group",
        legalName: "Cedar Advisory Group Ltd",
        source: "Referral",
        status: "qualified",
        responsibleMemberId: "member-1",
        responsibleTeamId: "team-1",
      },
    });
    expect(call(1).init.method).toBe("PATCH");
  });

  it("uploads portal evidence as multipart without overriding its content type", async () => {
    const file = new File(["evidence"], "evidence.pdf", { type: "application/pdf" });
    await api.uploadClientRequestDocument({ tenantId: "tenant-1" }, "request/1", file, "upload-key");
    const request = call(0);
    expect(request.url).toBe("/v1/portal/requests/request%2F1/documents");
    expect(request.init.method).toBe("POST");
    expect(request.headers["content-type"]).toBeUndefined();
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("idempotencyKey")).toBe("upload-key");
    expect(((request.body as FormData).get("file") as File).name).toBe("evidence.pdf");
  });
});
