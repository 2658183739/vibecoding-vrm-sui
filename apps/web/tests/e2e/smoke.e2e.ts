import { expect, test } from "@playwright/test";

function smokeUrl(path: string): string {
  return `/?smoke=1#${path}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.removeItem("stableflow.smoke.store");
    localStorage.removeItem("stableflow.tx.history");
    localStorage.removeItem("stableflow.smoke.enabled");
    localStorage.removeItem("stableflow.agent.timeline.v1");
    localStorage.removeItem("stableflow.agent.history.markdown.v1");
  });
});

test("Mint+Pay core flow", async ({ page }) => {
  await page.goto(smokeUrl("/merchant"));

  await page.getByLabel("商品标题").fill("演示商品A");
  await page.getByLabel("商品价格").fill("120");
  await page.getByTestId("merchant-create-product-btn").click();

  await page.getByTestId("merchant-create-invoice-btn").click();
  await expect(page.getByTestId("merchant-invoice-item").first()).toBeVisible();

  await page.getByRole("link", { name: "去支付页" }).first().click();
  await expect(page).toHaveURL(/#\/pay\//);

  await page.getByTestId("pay-mint-btn").click();
  await expect(page.getByText("状态：success").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "打开区块浏览器查看" }).first()).toBeVisible();
  await expect(page.getByTestId("recent-tx-history-card")).toBeVisible();
});

test("Burn flow", async ({ page }) => {
  await page.goto(smokeUrl("/redeem"));
  const burnAllButton = page.getByTestId("redeem-burn-all-btn");
  await expect(burnAllButton).toBeEnabled();
  await burnAllButton.click();
  await expect(page.getByText("状态：success").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "打开区块浏览器查看" }).first()).toBeVisible();
});

test("Claim flow", async ({ page }) => {
  await page.goto(smokeUrl("/merchant/claim"));
  await page.getByTestId("claim-submit-btn").click();
  await expect(page.getByText("状态：success").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "打开区块浏览器查看" }).first()).toBeVisible();
});

test("Agent drawer action flow", async ({ page }) => {
  await page.goto(smokeUrl("/merchant"));

  await page.getByLabel("商品标题").fill("Agent商品");
  await page.getByLabel("商品价格").fill("88");
  await page.getByTestId("merchant-create-product-btn").click();
  await page.getByTestId("merchant-create-invoice-btn").click();
  await page.getByRole("link", { name: "去支付页" }).first().click();

  await page.getByRole("button", { name: "智能助手" }).click();
  await page.getByLabel("Agent输入").fill("帮我支付当前账单");
  await page.getByTestId("agent-send-btn").click();
  await page.getByRole("button", { name: "推荐动作" }).click();

  const payAction = page.getByTestId("agent-action-PAY_MINT_AND_PAY");
  await expect(payAction).toBeVisible();
  await payAction.click();

  await expect(page.getByText("状态：success").first()).toBeVisible();
});

test("Agent guide and timeline flow", async ({ page }) => {
  await page.goto(smokeUrl("/quickstart"));
  await page.getByRole("button", { name: "智能助手" }).click();

  await page.getByLabel("Agent输入").fill("这个项目有什么功能，怎么演示？");
  await page.getByTestId("agent-send-btn").click();
  await page.getByRole("button", { name: "推荐动作" }).click();
  await page.getByRole("button", { name: "时间线/历史" }).click();

  await expect(page.getByText("项目核心功能").first()).toBeVisible();
  await expect(page.getByText("步骤时间线（可折叠）")).toBeVisible();
  await expect(page.getByText("HELP ·").first()).toBeVisible();
});

test("Agent timeline persists after reload", async ({ page }) => {
  await page.goto(smokeUrl("/quickstart"));
  await page.getByRole("button", { name: "智能助手" }).click();

  await page.getByLabel("Agent输入").fill("这个项目有什么功能？");
  await page.getByTestId("agent-send-btn").click();
  await page.getByRole("button", { name: "时间线/历史" }).click();
  await expect(page.getByText("HELP ·").first()).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "智能助手" }).click();
  await page.getByRole("button", { name: "时间线/历史" }).click();
  await expect(page.getByText("步骤时间线（可折叠）")).toBeVisible();
  await expect(page.getByText("HELP ·").first()).toBeVisible();
});

test("Agent one-click serial playbook", async ({ page }) => {
  await page.goto(smokeUrl("/quickstart"));
  await page.getByRole("button", { name: "智能助手" }).click();

  await page.getByLabel("Agent输入").fill("请一键连续执行剧本");
  await page.getByTestId("agent-send-btn").click();
  await page.getByRole("button", { name: "推荐动作" }).click();

  const playbookAction = page.getByTestId("agent-action-RUN_DEMO_PLAYBOOK");
  await expect(playbookAction).toBeVisible();
  await playbookAction.click();

  await expect(page.getByText("剧本执行完成。").first()).toBeVisible();
});

test("Local automation plan flow", async ({ page }) => {
  await page.goto("/#/automation");

  await page.getByRole("button", { name: "生成计划" }).click();
  await expect(page.getByText("守卫结论：")).toBeVisible();
  await expect(page.getByText("计划步骤").first()).toBeVisible();

  await page.getByRole("button", { name: "执行计划" }).click();
  await expect(page.getByText("执行结果").first()).toBeVisible();
  await expect(page.getByText("本地历史记录").first()).toBeVisible();
});
