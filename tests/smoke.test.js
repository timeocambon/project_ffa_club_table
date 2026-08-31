import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBaseUrl, runSmokeChecks } from "../scripts/smoke-test.js";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

test("normalise uniquement les adresses HTTP du contrôle de production", () => {
  assert.equal(normalizeBaseUrl("https://exemple.test/"), "https://exemple.test");
  assert.equal(normalizeBaseUrl("http://127.0.0.1:3001///"), "http://127.0.0.1:3001");
  assert.throws(() => normalizeBaseUrl("file:///tmp/index.html"), /http ou https/);
});

test("contrôle la santé, les ressources, la sécurité et l'API", async () => {
  const requestedPaths = [];
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    requestedPaths.push(path);

    if (path === "/healthz") return new Response("ok");
    if (path === "/") {
      return new Response("<title>Bilans Club</title>", {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": "default-src 'self'",
        },
      });
    }
    if (path === "/app.js") {
      return new Response("async function fetchData() {}", {
        headers: { "content-type": "text/javascript; charset=utf-8" },
      });
    }
    return jsonResponse({ error: "club invalide" }, { status: 400 });
  };

  const result = await runSmokeChecks({
    appUrl: "https://exemple.test/",
    fetchImpl,
    log: () => {},
  });

  assert.deepEqual(requestedPaths, ["/healthz", "/", "/app.js", "/api/bilans"]);
  assert.deepEqual(result, {
    baseUrl: "https://exemple.test",
    resultCount: null,
  });
});
