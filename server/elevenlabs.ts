import { storage } from "./storage";

export async function getConversationSignedUrl(): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }

  const agentId = await storage.getSystemConfig("elevenlabs_agent_id");
  if (!agentId) {
    throw new Error("ElevenLabs agent ID not configured. Set 'elevenlabs_agent_id' in system config.");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
    {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("ElevenLabs signed URL error:", response.status, errorText);
    throw new Error(`ElevenLabs API error: ${response.status}`);
  }

  const data = await response.json();
  return data.signed_url;
}
