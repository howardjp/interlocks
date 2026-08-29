import { campaigns, getCampaign, renderCampaignPrompt } from "../prealpha/catalog.mjs";

function usage() {
  return `Usage:
  npm run prealpha:list
  npm run prealpha:prompt -- <campaign-id> [--url http://localhost:3000] [--run-id ID]

Example:
  npm run --silent prealpha:prompt -- hostile-member-tenant-boundary --run-id tenant-001`;
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} requires a value`);
  return args[index + 1];
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage());
  process.exit(0);
}

if (args.includes("--list")) {
  for (const campaign of campaigns) console.log(`${campaign.id}\t${campaign.title}\t${campaign.featureTags.join(",")}`);
  process.exit(0);
}

const campaignId = args.find((arg) => !arg.startsWith("--") && ![option(args, "--url", null), option(args, "--run-id", null)].includes(arg));
if (!campaignId) {
  console.error(usage());
  process.exit(1);
}

const campaign = getCampaign(campaignId);
if (!campaign) {
  console.error(`Unknown campaign: ${campaignId}\n\nAvailable campaigns:`);
  for (const item of campaigns) console.error(`  ${item.id}`);
  process.exit(1);
}

console.log(renderCampaignPrompt(campaign, {
  baseUrl: option(args, "--url", "http://localhost:3000"),
  runId: option(args, "--run-id", `${campaign.id}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`),
}));
