import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  consumeRegistrationLogin,
  stageRegistrationLogin,
} from "../src/utils/registrationLogin.ts";

afterEach(() => consumeRegistrationLogin());

test("registration credentials fill exactly one login visit, preserving password whitespace", () => {
  stageRegistrationLogin({ username: "  abc123  ", password: "  New123!  " });
  assert.deepEqual(consumeRegistrationLogin(), {
    username: "abc123",
    password: "  New123!  ",
  });
  assert.equal(consumeRegistrationLogin(), null);
});

test("a new registration replaces the old handoff and snapshots form values", () => {
  stageRegistrationLogin({ username: "first", password: "old" });
  const form = { username: "abc123", password: "new" };
  stageRegistrationLogin(form);
  form.username = "later edit";
  form.password = "later edit";
  assert.deepEqual(consumeRegistrationLogin(), { username: "abc123", password: "new" });
});

test("blank credentials cannot preserve an earlier registration handoff", () => {
  for (const values of [
    { username: "  ", password: "new" },
    { username: "abc123", password: "  " },
  ]) {
    stageRegistrationLogin({ username: "previous", password: "previous" });
    stageRegistrationLogin(values);
    assert.equal(consumeRegistrationLogin(), null);
  }
});

test("registration handoff works without reading or writing browser storage or history", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const browser = {};
  for (const key of ["localStorage", "sessionStorage", "history", "location"]) {
    Object.defineProperty(browser, key, {
      get() { throw new Error(`Registration handoff accessed ${key}`); },
    });
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  try {
    stageRegistrationLogin({ username: "abc123", password: "New123!" });
    assert.deepEqual(consumeRegistrationLogin(), { username: "abc123", password: "New123!" });
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  }
});

test("a new document module starts empty even when a previous document staged credentials", async () => {
  stageRegistrationLogin({ username: "abc123", password: "New123!" });
  const freshDocument = await import("../src/utils/registrationLogin.ts?new-document");
  assert.equal(freshDocument.consumeRegistrationLogin(), null);
});
