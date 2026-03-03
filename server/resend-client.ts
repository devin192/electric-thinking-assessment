import { Resend } from "resend";

export async function getUncachableResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable not set");
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || "hello@electricthinking.ai";

  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}
