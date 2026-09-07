import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { reset, state } from "./support/practice-platform.mjs";

// Execute the real HTTP route handlers with a controlled transaction boundary.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./platform-core.js" && context.parentURL?.endsWith("/src/practice-management.ts"))
      return { url: new URL("./support/practice-platform.mjs", import.meta.url).href, shortCircuit: true };
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith(".") && specifier.endsWith(".js")) return nextResolve(specifier.slice(0, -3) + ".ts", context);
      throw error;
    }
  },
});
const { handlePracticeManagementRoute } = await import("../src/practice-management.ts");
hooks.deregister();
const tenant = "11111111-1111-4111-8111-111111111111";
const work = "22222222-2222-4222-8222-222222222222";
const task = "33333333-3333-4333-8333-333333333333";
const reviewer = "44444444-4444-4444-8444-444444444444";
const request = (path: string, body?: object) => new Request("https://practice.test" + path, { method: body ? "POST" : "GET", headers: { "x-tenant-id": tenant, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const run = (path: string, body?: object) => handlePracticeManagementRoute(request(path, body), {} as never, "test-actor");

test("completion refuses unfinished mandatory tasks even without workflow stages", async () => {
  reset(sql => sql.startsWith("select * from work_item") ? [{ id: work, client_id: tenant, status: "in_progress" }]
    : sql.includes("from practice_task where") ? [{ exists: true }] : []);
  await assert.rejects(run(`/v1/practice/work/${work}/status`, { status: "completed" }), { code: "WORK_APPROVAL_GATES_NOT_MET" });
  assert.equal(state.committed, false);
  assert.equal(state.queries.some(query => query.sql.startsWith("update work_item")), false);
  assert.ok(state.permissions.includes("work.complete"));
  assert.ok(state.ended);
});

test("completion override still requires review.override permission", async () => {
  reset(sql => sql.startsWith("select * from work_item") ? [{ client_id: tenant, status: "in_progress" }] : sql.includes("from practice_task where") ? [{}] : []);
  state.deny = "review.override";
  await assert.rejects(run(`/v1/practice/work/${work}/status`, { status: "completed", overrideReason: "Approved exception" }), /PERMISSION_DENIED/);
  assert.equal(state.committed, false);
  assert.deepEqual(state.events, []);
});

test("closed work cannot receive new tasks", async () => {
  reset(sql => sql.includes("from work_item") ? [{ client_id: tenant, status: "completed" }] : []);
  await assert.rejects(run(`/v1/practice/work/${work}/tasks`, { title: "Late task", sequence: 1 }), { code: "WORK_CLOSED" });
  assert.equal(state.queries.some(query => query.sql.startsWith("insert into practice_task")), false);
});

test("review request rejects a task from different work before writing anything", async () => {
  reset(sql => sql.includes("from work_item") ? [{ client_id: tenant, status: "in_progress" }] : []);
  await assert.rejects(run("/v1/practice/reviews", { workItemId: work, taskId: task, reviewerMemberId: reviewer }), { code: "NOT_FOUND" });
  assert.equal(state.queries.some(query => query.sql.startsWith("insert into practice_review")), false);
});

test("review request creates the review, moves work to review, and audits both in one transaction", async () => {
  reset(sql => sql.includes("from work_item") ? [{ client_id: tenant, status: "in_progress" }]
    : sql.startsWith("select id from practice_task") ? [{ id: task }]
    : sql.startsWith("select id from tenant_member") ? [{ id: tenant }]
    : sql.startsWith("insert into practice_review") ? [{ id: reviewer, work_item_id: work, status: "requested" }] : []);
  const result = await run("/v1/practice/reviews", { workItemId: work, taskId: task, reviewerMemberId: reviewer });
  assert.equal(result?.status, 201);
  assert.equal((await result!.json()).item.work_item_id, work);
  assert.equal(state.committed, true);
  assert.ok(state.queries.some(query => query.sql.startsWith("update work_item set status='review'")));
  assert.deepEqual(state.events, ["REVIEW_REQUESTED", "WORK_STATUS_CHANGED"]);
  const insert = state.queries.find(query => query.sql.startsWith("insert into practice_review"));
  assert.equal(insert?.values[5], tenant, "current active member is the fallback preparer");
});

test("repeated review requests report the existing open review instead of creating duplicates", async () => {
  reset(sql => sql.includes("from work_item") ? [{ client_id: tenant, status: "review" }]
    : sql.startsWith("select id from practice_task") ? [{ id: task }]
    : sql.startsWith("select id from practice_review") ? [{ id: reviewer }] : []);
  await assert.rejects(run("/v1/practice/reviews", { workItemId: work, taskId: task, reviewerMemberId: reviewer }), { code: "REVIEW_ALREADY_OPEN" });
  assert.equal(state.queries.some(query => query.sql.startsWith("insert into practice_review")), false);
});

test("review listing returns flat record fields and preserves tenant filtering", async () => {
  reset((sql, values) => {
    if (sql.includes("from practice_review r")) {
      assert.match(sql, /^select r\.\*,/);
      assert.ok(values.includes(tenant));
      return [{ id: reviewer, work_item_id: work, status: "requested", work_title: "Delivery" }];
    }
    return [];
  });
  const result = await run("/v1/practice/reviews");
  assert.deepEqual((await result!.json()).items[0], { id: reviewer, work_item_id: work, status: "requested", work_title: "Delivery" });
});
