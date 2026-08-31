import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("report endpoint accepts JSON submissions larger than the global 1MB API limit", async () => {
  const port = 43000 + Math.floor(Math.random() * 1000);
  const databasePath = join(tmpdir(), `notc-large-report-${randomUUID()}.sqlite`);
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: join(import.meta.dirname, ".."),
    env: { ...process.env, PORT: String(port), CRUSADE_DB_PATH: databasePath, NODE_ENV: "test" },
    stdio: "ignore",
    windowsHide: true,
  });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (response.ok) { ready = true; break; }
      } catch { /* server is still starting */ }
      if (server.exitCode != null) break;
      await delay(100);
    }
    assert.equal(ready, true, "test server did not start");

    const payload = {
      organization_type: "network",
      network_name: "TNI",
      network_type: "predefined",
      contact_name: "Test Reporter",
      contact_email: "reporter@example.com",
      phone_country_code: "+234",
      phone_number: "8012345678",
      kingschat_username: "testreporter",
      crusades: Array.from({ length: 4999 }, (_, index) => ({
        format: "physical",
        event_type: "cellular",
        event_name: `Large Submission Crusade ${index + 1}`,
        country: "Nigeria",
        city: "Lagos",
        event_date: "2026-08-28",
        attendance: 25,
        minister_name: "Pastor Test",
        venue: `Registered Venue ${index + 1}`,
      })),
    };
    const requestBody = JSON.stringify(payload);
    assert.ok(Buffer.byteLength(requestBody) > 1024 * 1024, "fixture must reproduce a request larger than 1MB");

    const response = await fetch(`http://127.0.0.1:${port}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });
    assert.equal(response.status, 201, "4,999-crusade report should submit instead of failing with HTTP 413");
    const body = await response.json();
    assert.ok(body.id);
  } finally {
    server.kill();
  }
});
