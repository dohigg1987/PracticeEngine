import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  freshAuthToken: vi.fn(),
  AuthRequiredError: class AuthRequiredError extends Error {},
}));
vi.mock("@fluentui/react-components", async () => {
  const { createRequire } = await vi.importActual<{ createRequire: (url: string) => (id: string) => Record<string, unknown> }>("node:module");
  return createRequire(import.meta.url)("@fluentui/react-components");
});

import { filterCrmProspects } from "./CrmOnboarding";
import type { CrmProspect } from "./api";

const prospects: CrmProspect[] = [
  { id: "p1", display_name: "Cedar Advisory", legal_name: "Cedar Advisory Limited", entity_type: "COMPANY", status: "qualified", source: "Referral", responsible_member_id: "r1", responsible_member_name: "Morgan Reed", primary_contact_name: "Alex Cedar", primary_contact_email: "alex@example.test" },
  { id: "p2", display_name: "Harbour Studio", entity_type: "COMPANY", status: "lost", responsible_team_id: "t1", responsible_team_name: "Advisory" },
  { id: "p3", display_name: "Northstar", entity_type: "CHARITY", status: "converted" },
];

describe("CRM list controls", () => {
  it("searches prospect, contact and source context", () => {
    expect(filterCrmProspects(prospects, "alex@", "all", "").map((item) => item.id)).toEqual(["p1"]);
    expect(filterCrmProspects(prospects, "referral", "all", "").map((item) => item.id)).toEqual(["p1"]);
  });

  it("keeps active, lifecycle and owner views predictable", () => {
    expect(filterCrmProspects(prospects, "", "active", "").map((item) => item.id)).toEqual(["p1"]);
    expect(filterCrmProspects(prospects, "", "lost", "t1").map((item) => item.id)).toEqual(["p2"]);
    expect(filterCrmProspects(prospects, "", "all", "unassigned").map((item) => item.id)).toEqual(["p3"]);
  });
});
