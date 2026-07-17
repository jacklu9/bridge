import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, isPrivateIp } from "../scripts/lib.mjs";

test("private IPv4 ranges are blocked", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254"]) assert.equal(isPrivateIp(ip), true);
  assert.equal(isPrivateIp("8.8.8.8"), false);
});

test("private IPv6 ranges are blocked", () => {
  assert.equal(isPrivateIp("::1"), true);
  assert.equal(isPrivateIp("fd00::1"), true);
  assert.equal(isPrivateIp("2606:4700:4700::1111"), false);
});

test("HTML is escaped", () => assert.equal(escapeHtml('<a "x">'), "&lt;a &quot;x&quot;&gt;"));
