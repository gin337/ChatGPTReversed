import {ChatGPTReversedProfile} from "./interfaces/interfaces";
import {randomUUID} from "crypto";
import {randomIP, solveSentinelChallenge} from "./utils/utils";

export class ChatGPTReversed {
  private static sessionToken: string = "";
  private static csrfToken: string | undefined = undefined;
  private static requirementsToken: string = "";
  private static initialized: boolean = false;

  constructor(profile: ChatGPTReversedProfile) {
    if (ChatGPTReversed.initialized) throw new Error("ChatGPTReversed has already been initialized.");

    if (profile.sessionToken === undefined || profile.requirementsToken === undefined) {
      throw new Error(
        "Your sessionToken & requirementsToken must be provided. Check the documentation for how to obtain these tokens."
      );
    }

    ChatGPTReversed.sessionToken = profile.sessionToken;
    ChatGPTReversed.requirementsToken = profile.requirementsToken;

    if (profile.csrfToken !== undefined) {
      ChatGPTReversed.csrfToken = profile.csrfToken;
    }

    this.initialize();
  }

  private async initialize(): Promise<void> {
    ChatGPTReversed.initialized = true;
  }

  private async getCSRFToken(): Promise<string> {
    if (ChatGPTReversed.csrfToken !== undefined) {
      return ChatGPTReversed.csrfToken;
    }

    const response = await fetch("https://chatgpt.com/api/auth/csrf", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ChatGPTReversed.sessionToken}`,
        accept: "application/json",
        "Content-Type": "application/json",
        "cache-control": "no-cache",
        Referer: "https://chatgpt.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "content-type": "application/json",
        "oai-device-id": randomUUID(),
        "oai-echo-logs": "0,2620,1,1384,0,5111,1,12092,0,18165",
        "oai-language": "en-US",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
    });

    const data = await response.json();

    if (data.csrfToken === undefined) {
      throw new Error(
        "Failed to fetch required CSRF token. We did not receive the token from the server. Please check your sessionToken and try again."
      );
    }

    return data.csrfToken;
  }

  private async getSentinelToken(): Promise<{
    token: string;
    proof: string;
    ip: string;
  }> {
    const _randomUUID = randomUUID();
    const _randomIp = await randomIP();

    const response = await fetch("https://chatgpt.com/backend-anon/sentinel/chat-requirements", {
      body: JSON.stringify({
        p: `${ChatGPTReversed.requirementsToken}`,
      }),
      headers: {
        accept: "text/event-stream",
        "accept-language": "de",
        Authorization: `Bearer ${ChatGPTReversed.sessionToken}`,
        "cache-control": "no-cache",
        "content-type": "application/json",
        "oai-device-id": _randomUUID,
        "oai-echo-logs": "0,2620,1,1384,0,5111,1,12092,0,18165",
        "oai-language": "en-US",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        cookie: `__Host-next-auth.csrf-token=${ChatGPTReversed.csrfToken}; oai-did=${_randomUUID};`,
        Referer: "https://chatgpt.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Forwarded-For": _randomIp,
      },
      method: "POST",
    });

    const data = await response.json();

    if (data.token === undefined || data.proofofwork === undefined) {
      throw new Error(
        "Failed to fetch required required sentinel token. Please check your sessionToken and try again."
      );
    }

    const challengeToken = await solveSentinelChallenge(data.proofofwork.seed, data.proofofwork.difficulty);

    return {
      token: data.token,
      proof: challengeToken,
      ip: _randomIp,
    };
  }

  public async complete(message: string): Promise<string> {
    if (ChatGPTReversed.csrfToken === undefined) {
      ChatGPTReversed.csrfToken = await this.getCSRFToken();
    }

    if (!ChatGPTReversed.initialized) {
      throw new Error(
        "ChatGPTReversed has not been initialized. Please initialize the instance before calling this method."
      );
    }

    const {token, proof, ip} = await this.getSentinelToken();
    const _randomUUID = randomUUID();

    const response = await fetch("https://chatgpt.com/backend-anon/conversation", {
      headers: {
        accept: "text/event-stream",
        "accept-language": "de",
        authorization: `Bearer ${ChatGPTReversed.sessionToken}`,
        "cache-control": "no-cache",
        "content-type": "application/json",
        "oai-device-id": _randomUUID,
        "oai-echo-logs": "0,2620,1,1384,0,5111,1,12092,0,18165",
        "oai-language": "en-US",
        "openai-sentinel-chat-requirements-token": token,
        "openai-sentinel-proof-token": proof,
        "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        cookie: `__Host-next-auth.csrf-token=${ChatGPTReversed.csrfToken}; __Secure-next-auth.session-token=${ChatGPTReversed.sessionToken}; oai-did=${_randomUUID};`,
        Referer: "https://chatgpt.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Forwarded-For": ip,
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
