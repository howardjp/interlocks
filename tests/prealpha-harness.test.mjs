import assert from "node:assert/strict";
import test from "node:test";

import { campaigns, evidenceContract, getCampaign, renderCampaignPrompt } from "../prealpha/catalog.mjs";

test("pre-alpha catalog contains a broad adversarial cohort", () => {
  assert.ok(campaigns.length >= 16);
  assert.equal(new Set(campaigns.map((campaign) => campaign.id)).size, campaigns.length);
});

for (const campaign of campaigns) {
  test(`pre-alpha campaign ${campaign.id} has a complete persona contract`, () => {
    assert.match(campaign.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(campaign.title.length >= 10);
    assert.ok(campaign.persona.length >= 80);
    assert.ok(campaign.startingIdentity.length >= 3);
    assert.match(campaign.viewport, /(desktop|laptop|mobile)/i);
    assert.ok(campaign.featureTags.length >= 4);
    assert.ok(campaign.objectives.length >= 3);
    assert.ok(campaign.provocations.length >= 3);
    assert.equal(getCampaign(campaign.id), campaign);
  });

  test(`pre-alpha prompt ${campaign.id} preserves black-box and evidence boundaries`, () => {
    const prompt = renderCampaignPrompt(campaign, { baseUrl:"http://127.0.0.1:4444/", runId:"test-run" });
    assert.match(prompt, /http:\/\/127\.0\.0\.1:4444/);
    assert.doesNotMatch(prompt, /http:\/\/127\.0\.0\.1:4444\//);
    assert.match(prompt, /Run ID: test-run/);
    assert.match(prompt, /Use the browser only/);
    assert.match(prompt, /Do not read the Interlocks repository/);
    assert.match(prompt, /Never enter real client/);
    assert.match(prompt, /Do not claim success unless you observed it/);
    assert.match(prompt, /A privacy or tenant-boundary exposure is a critical finding/);
    assert.match(prompt, /Do not reset the demo until all evidence/);
    for (const section of evidenceContract.requiredSections) assert.match(prompt, new RegExp(`- ${section}`));
    for (const field of evidenceContract.issueFields) assert.match(prompt, new RegExp(`- ${field}`));
  });
}

test("pre-alpha catalog covers every high-risk product boundary", () => {
  const tags = new Set(campaigns.flatMap((campaign) => campaign.featureTags));
  for (const required of [
    "checks", "policy", "jurisdiction", "family", "consent", "privacy", "ledger", "review",
    "documents", "controls", "administration", "roles", "tenancy", "authorization", "imports",
    "transactions", "accessibility", "mobile", "state", "audit", "matching",
  ]) assert.ok(tags.has(required), `missing pre-alpha coverage for ${required}`);
});

test("unknown pre-alpha campaign lookup fails closed", () => {
  assert.equal(getCampaign("not-a-campaign"), null);
  assert.throws(() => renderCampaignPrompt(null), /required/);
});

test("prompt renderer uses a stable default application boundary", () => {
  const prompt = renderCampaignPrompt(campaigns[0], { runId:"default-url" });
  assert.match(prompt, /Application: http:\/\/localhost:3000/);
  assert.match(prompt, /Open http:\/\/localhost:3000/);
});
