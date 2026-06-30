import { describe, expect, test } from "@jest/globals";

import { namespaceKey, parseNamespaceKey } from "../src/serviceWorker/registerPelicanSw";

describe("namespaceKey / parseNamespaceKey", () => {
  test("round-trips an origin host and a slashed namespace prefix", () => {
    const host = "origin.example.org";
    const prefix = "/ospool/ap40";
    const key = namespaceKey(host, prefix);

    // The separator is ':', and the prefix's slashes must be encoded so they don't
    // collide with the separator or the host.
    expect(key).toBe("origin.example.org:%2Fospool%2Fap40");
    expect(parseNamespaceKey(key)).toEqual({ host, prefix });
  });

  test("survives hosts that contain a port (a colon)", () => {
    // An Origin's data endpoint lives on a non-default port; the host portion can carry one.
    const host = "origin.example.org:8443";
    const prefix = "/data";
    const key = namespaceKey(host, prefix);

    expect(parseNamespaceKey(key)).toEqual({ host, prefix });
  });

  test("distinct namespaces produce distinct keys", () => {
    const a = namespaceKey("origin.example.org", "/ns/a");
    const b = namespaceKey("origin.example.org", "/ns/b");
    expect(a).not.toBe(b);
  });
});
