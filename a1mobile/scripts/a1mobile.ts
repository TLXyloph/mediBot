import { getEnvironment } from "../src/env.js";
import { HackA1MobileProvider } from "../src/providers/hack.js";

function usage(): never {
  console.error(`Usage:
  npm run a1 -- info
  npm run a1 -- claim
  npm run a1 -- point [https://public.example/voice]
  npm run a1 -- unpoint
  npm run a1 -- request-verify +1NUMBER
  npm run a1 -- confirm-verify +1NUMBER 123456
  npm run a1 -- sms-webhook [https://public.example/sms]
  npm run a1 -- inbound-sms [sinceId]`);
  process.exit(1);
}

function safeNumberInfo(info: Awaited<ReturnType<HackA1MobileProvider["numberInfo"]>>): object {
  return {
    phoneNumber: info.phoneNumber ?? "unknown",
    sipUsername: info.sipUsername ?? "configured",
    wiringMode: info.wiringMode ?? "unknown",
    webhookUrl: info.webhookUrl ?? null,
  };
}

const environment = getEnvironment();
const client = new HackA1MobileProvider(environment);
const [command = "info", first, second] = process.argv.slice(2);

switch (command) {
  case "info":
    console.log(JSON.stringify(safeNumberInfo(await client.numberInfo()), null, 2));
    break;
  case "claim":
    console.log(JSON.stringify(safeNumberInfo(await client.claimNumber()), null, 2));
    break;
  case "point": {
    const url = first ?? environment.a1mobileVoiceWebhookUrl;
    if (!url) usage();
    console.log(JSON.stringify(safeNumberInfo(await client.pointNumber(url)), null, 2));
    break;
  }
  case "unpoint":
    console.log(JSON.stringify(safeNumberInfo(await client.unpointNumber()), null, 2));
    break;
  case "request-verify":
    if (!first) usage();
    await client.requestNumberVerification(first);
    console.log("Verification code requested.");
    break;
  case "confirm-verify":
    if (!first || !second) usage();
    await client.confirmNumberVerification(first, second);
    console.log("Number verified.");
    break;
  case "sms-webhook": {
    const url = first ?? environment.a1mobileSmsWebhookUrl;
    if (!url) usage();
    await client.setSmsWebhook(url);
    console.log("SMS webhook updated.");
    break;
  }
  case "inbound-sms": {
    const sinceId = first ? Number(first) : 0;
    const result = await client.inboundSms(sinceId);
    console.log(JSON.stringify(result, null, 2));
    break;
  }
  default:
    usage();
}
