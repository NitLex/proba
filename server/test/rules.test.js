import test from "node:test";
import assert from "node:assert/strict";
import { matchCondition, pickFirstMatchingRule } from "../src/lib/rules.js";

test("matchCondition supports eq/neq/contains/in", () => {
  const ctx = {
    country: "RU",
    device: "mobile",
    os: "Android",
    browser: "Chrome",
    is_bot: 0,
    language: "ru",
    ip: "1.2.3.4",
    token1: "fb",
    token2: "",
    token3: "",
    token4: "",
    token5: "",
  };

  assert.equal(matchCondition({ field: "country", operator: "eq", value: "RU" }, ctx), true);
  assert.equal(matchCondition({ field: "country", operator: "neq", value: "US" }, ctx), true);
  assert.equal(matchCondition({ field: "browser", operator: "contains", value: "Chr" }, ctx), true);
  assert.equal(matchCondition({ field: "country", operator: "in", value: "US,RU,DE" }, ctx), true);
  assert.equal(matchCondition({ field: "country", operator: "not_in", value: "US,DE" }, ctx), true);
  assert.equal(matchCondition({ field: "token1", operator: "starts", value: "f" }, ctx), true);
  assert.equal(matchCondition({ field: "bot", operator: "eq", value: "0" }, ctx), true);
});

test("pickFirstMatchingRule returns first matching enabled rule path", () => {
  const rules = [
    {
      id: 1,
      enabled: 1,
      path_id: 10,
      conditions: [{ field: "country", operator: "eq", value: "US" }],
    },
    {
      id: 2,
      enabled: 1,
      path_id: 20,
      conditions: [{ field: "country", operator: "eq", value: "RU" }],
    },
  ];
  const hit = pickFirstMatchingRule(rules, {
    country: "RU",
    device: "desktop",
    os: "Windows",
    browser: "Chrome",
    is_bot: 0,
    language: "ru",
    ip: "8.8.8.8",
    token1: "",
    token2: "",
    token3: "",
    token4: "",
    token5: "",
  });
  assert.equal(hit.path_id, 20);
});
