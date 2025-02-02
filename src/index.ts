import {randomUUID} from "crypto";
import {
  generateFakeSentinelToken,
  simulateBypassHeaders,
  solveSentinelChallenge,
} from "./utils/utils";

export class ChatGPTReversed {
  public static csrfToken: string | undefined = undefined;
  private static initialized: boolean = false;

  constructor() {
    if (ChatGPTReversed.initialized) throw new Error("ChatGPTReversed has already been initialized.");

    this.initialize();
  }

  private async initialize(): Promise<void> {
    ChatGPTReversed.initialized = true;
  }

  public async rotateSessionData(): Promise<{
    uuid: string;
    csrf: string;
    sentinel: {
      token: string;
      proof: string;
      oaiSc: string;
    };
  }> {
    const uuid = randomUUID();
    const csrfToken = await this.getCSRFToken(uuid);
    const sentinelToken = await this.getSentinelToken(uuid, csrfToken);

    ChatGPTReversed.csrfToken = csrfToken;

    return {
      uuid,
      csrf: csrfToken,
      sentinel: sentinelToken,
    };
  }

  private async getCSRFToken(uuid: string): Promise<string> {
    if (ChatGPTReversed.csrfToken !== undefined) {
      return ChatGPTReversed.csrfToken;
    }

    const headers = await simulateBypassHeaders({
      spoofAddress: true,
      preOaiUUID: uuid,
      accept: "application/json",
    });

    const response = await fetch("https://chatgpt.com/api/auth/csrf", {
      method: "GET",
      headers: headers,
    });

    const data = await response.json();

    if (data.csrfToken === undefined) {
      throw new Error("Failed to fetch required CSRF token");
    }

    return data.csrfToken;
  }

  private async getSentinelToken(
    uuid: string,
    csrf: string
  ): Promise<{
    token: string;
    proof: string;
    oaiSc: string;
  }> {
    const headers = await simulateBypassHeaders({
      spoofAddress: true,
      preOaiUUID: uuid,
      accept: "application/json",
    });

    const test = await generateFakeSentinelToken();

    const response = await fetch("https://chatgpt.com/backend-anon/sentinel/chat-requirements", {
      body: JSON.stringify({
        p: test,
      }),
      headers: {
        ...headers,
        Cookie: `__Host-next-auth.csrf-token=${csrf}; oai-did=${uuid}; oai-nav-state=1;`,
      },
      method: "POST",
    });

    const data = await response.json();

    if (data.token === undefined || data.proofofwork === undefined) {
      throw new Error("Failed to fetch required required sentinel token");
    }

    const oaiSc = response.headers.get("set-cookie")?.split("oai-sc=")[1]?.split(";")[0] || "";

    if (!oaiSc) {
      throw new Error("Failed to fetch required oai-sc token");
    }

    const challengeToken = await solveSentinelChallenge(data.proofofwork.seed, data.proofofwork.difficulty);

    return {
      token: data.token,
      proof: challengeToken,
      oaiSc: oaiSc,
    };
  }

  public async complete(message: string): Promise<string> {
    const sessionData = await this.rotateSessionData();

    if (!ChatGPTReversed.initialized) {
      throw new Error(
        "ChatGPTReversed has not been initialized. Please initialize the instance before calling this method."
      );
    }

    const headers = await simulateBypassHeaders({
      accept: "text/event-stream",
      spoofAddress: true,
      preOaiUUID: sessionData.uuid,
    });

    const response = await fetch("https://chatgpt.com/backend-anon/conversation", {
      headers: {
        ...headers,
        Cookie: `__Host-next-auth.csrf-token=${sessionData.csrf}; oai-did=${sessionData.uuid}; oai-nav-state=1; oai-sc=${sessionData.sentinel.oaiSc};`,
        "openai-sentinel-chat-requirements-token": sessionData.sentinel.token,
        "openai-sentinel-proof-token": sessionData.sentinel.proof,
      },
      body: JSON.stringify({
        action: "next",
        messages: [
          {
            id: randomUUID(),
            author: {
              role: "user",
            },
            content: {
              content_type: "text",
              parts: [message],
            },
            metadata: {},
          },
        ],
        parent_message_id: randomUUID(),
        model: "auto",
        timezone_offset_min: -120,
        suggestions: [],
        history_and_training_disabled: false,
        conversation_mode: {
          kind: "primary_assistant",
          plugin_ids: null,
        },
        force_paragen: false,
        force_paragen_model_slug: "",
        force_nulligen: false,
        force_rate_limit: false,
        reset_rate_limits: false,
        websocket_request_id: randomUUID(),
        force_use_sse: true,
      }),
      method: "POST",
    });

    if (response.body === null) {
      throw new Error("Failed to receive response body. Please check your sessionToken and try again.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    let buffer: any = "";

    while (true) {
      const {done, value} = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, {stream: true});
      let lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith("data:")) {
          try {
            const json = JSON.parse(line.replace("data:", "").trim());
            if (json.message?.content?.parts && json.message.status === "finished_successfully") {
              result = json.message.content.parts[0];
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }
      if (result) break;
    }

    if (!result && buffer.startsWith("data:")) {
      try {
        const json = JSON.parse(buffer.replace("data:", "").trim());
        if (json.message?.content?.parts && json.message.status === "finished_successfully") {
          result = json.message.content.parts[0];
        }
      } catch (e) {}
    }

    return result;
  }
}
