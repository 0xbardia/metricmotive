import assert from "node:assert/strict";
import test from "node:test";
import { classifyReadError, nextPrivateReadStep } from "./private-read.ts";

test("classifies errors", () => {
  assert.equal(classifyReadError(new Error("Wallet authentication required")), "auth");
  assert.equal(classifyReadError(new Error("You do not control this Guard")), "denied");
  assert.equal(classifyReadError(new Error("Guard not found")), "not_found");
  assert.equal(classifyReadError(new Error("boom")), "other");
});

test("auth error + connected -> sign and retry", () => {
  assert.equal(nextPrivateReadStep({ errorKind: "auth", walletConnected: true, sessionSignedFor: false }), "sign-and-retry");
});
test("auth error + disconnected -> connect prompt", () => {
  assert.equal(nextPrivateReadStep({ errorKind: "auth", walletConnected: false, sessionSignedFor: false }), "connect");
});
test("denied only after a signed session", () => {
  assert.equal(nextPrivateReadStep({ errorKind: "denied", walletConnected: true, sessionSignedFor: true }), "no-access");
  assert.equal(nextPrivateReadStep({ errorKind: "denied", walletConnected: true, sessionSignedFor: false }), "sign-and-retry");
});
test("not found", () => {
  assert.equal(nextPrivateReadStep({ errorKind: "not_found", walletConnected: true, sessionSignedFor: true }), "not-found");
});
