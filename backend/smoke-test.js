const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const BASE_URL = process.env.API_BASE || "http://127.0.0.1:5000/api";

let sessionCookie = "";

function captureCookies(response) {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);

  sessionCookie = setCookies
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");

  if (!sessionCookie.includes("jobwork_session=")) {
    throw new Error("Login did not return a session cookie");
  }
}

async function login() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    throw new Error("ADMIN_PASSWORD missing for smoke test");
  }

  const response = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.user) {
    throw new Error(data.message || "Login failed for smoke test");
  }

  captureCookies(response);
  console.log("OK /login");
}

async function check(path, validate) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Cookie: sessionCookie,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${data.message || "Request failed"}`);
  }

  validate?.(data);
  console.log(`OK ${path}`);
  return data;
}

(async () => {
  await login();

  await check("/test-db", (data) => {
    if (!data.success) {
      throw new Error("Database check failed");
    }
  });

  await check("/state", (data) => {
    [
      "vendors",
      "customers",
      "productMasters",
      "bosGrns",
      "lots",
      "vendorEndGrns",
      "vendorProductions",
      "schedules",
      "sales",
    ].forEach((key) => {
      if (!Array.isArray(data[key])) {
        throw new Error(`State field ${key} is not an array`);
      }
    });
  });
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
