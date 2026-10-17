import { expect, test } from "@playwright/test";

test("public entry is readable on mobile and desktop without horizontal overflow", async ({
  page,
}) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page
        .getByRole("heading", { level: 1 })
        .or(page.getByRole("heading", { level: 2 }))
        .first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("login rejects malformed email before sending credentials", async ({
  page,
}) => {
  await page.goto("/login");
  const email = page.getByLabel("Email", { exact: true });
  test.skip(
    !(await email.isVisible()),
    "Authentication has not been configured in this environment.",
  );
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/login")) requests++;
  });
  await email.fill("invalid-email");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  expect(
    await email.evaluate((element: HTMLInputElement) => element.validity.valid),
  ).toBe(false);
  expect(requests).toBe(0);
});

test("BFF rejects mutation requests without an Origin and hides internal API", async ({
  request,
}) => {
  const rejected = await request.post("/api/v1/habits", {
    data: { title: "must not be created" },
  });
  expect(rejected.status()).toBe(403);
  expect((await rejected.json()).error.code).toBe("ORIGIN_REJECTED");
  expect(rejected.headers()["cache-control"]).toContain("no-store");
  const hidden = await request.get("/api/v1/internal/daily-summary/run");
  expect(hidden.status()).toBe(404);
});
