import { describe, expect, it } from "vitest";
import {
  crmRoutes,
  newOpportunityPath,
  opportunityPath,
  parseCrmRoute,
  prospectPath,
} from "./crm-routes";

describe("CRM routes", () => {
  it("provides stable canonical list, create and detail URLs", () => {
    expect(crmRoutes.opportunities).toBe("/practice/crm/opportunities");
    expect(newOpportunityPath()).toBe("/practice/crm/opportunities/new");
    expect(newOpportunityPath("prospect/1")).toBe(
      "/practice/crm/opportunities/new?prospect=prospect%2F1",
    );
    expect(opportunityPath("opportunity/1")).toBe(
      "/practice/crm/opportunities/opportunity%2F1",
    );
    expect(prospectPath("prospect/1")).toBe(
      "/practice/crm/prospects/prospect%2F1",
    );
  });

  it("resolves direct and contextual deep links to the intended CRM mode", () => {
    expect(parseCrmRoute("/practice/crm/opportunities")).toEqual({
      view: "opportunities",
      mode: "list",
    });
    expect(
      parseCrmRoute(
        "/practice/crm/opportunities/new",
        "?prospect=prospect%2F1",
      ),
    ).toEqual({
      view: "opportunities",
      mode: "create",
      prospectId: "prospect/1",
    });
    expect(
      parseCrmRoute("/practice/crm/opportunities/opportunity%2F1"),
    ).toEqual({
      view: "opportunities",
      mode: "detail",
      id: "opportunity/1",
    });
    expect(parseCrmRoute("/practice/crm/prospects/prospect-1")).toEqual({
      view: "prospects",
      mode: "detail",
      id: "prospect-1",
    });
  });

  it("does not silently interpret unrelated or malformed descendants", () => {
    expect(parseCrmRoute("/practice/crm/opportunities/new/extra")).toBeUndefined();
    expect(parseCrmRoute("/practice/crm/opportunities/%E0%A4%A")).toBeUndefined();
    expect(parseCrmRoute("/practice/crm/prospects/prospect-1/history")).toBeUndefined();
  });
});
