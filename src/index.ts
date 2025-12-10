import {randomUUID} from "crypto";
import {generateFakeSentinelToken, simulateBypassHeaders, solveSentinelChallenge} from "./utils/utils";

interface CompleteOptionsProfile {
  stream?: boolean;
}

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

  public async complete(
    message: string,
    options: {stream: true}
  ): Promise<AsyncGenerator<{text: string; metadata: any}>>;

  public async complete(message: string, options?: {stream?: false}): Promise<string>;

  public async complete(
    message: string,
    options?: CompleteOptionsProfile
  ): Promise<string | AsyncGenerator<{text: string; metadata: any}>> {
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

    const messageID = randomUUID();

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
            id: messageID,
            author: {
              role: "user",
            },
            create_time: Date.now(),
            content: {
              content_type: "text",
              parts: [message],
            },
            metadata: {
              selected_all_github_repos: false,
              selected_github_repos: [],
              serialization_metadata: {
                custom_symbol_offsets: [],
              },
              dictation: false,
            },
          },
        ],
        paragen_cot_summary_display_override: "allow",
        parent_message_id: "client-created-root",
        model: "auto",
        timezone_offset_min: -60,
        timezone: "Europe/Berlin",
        suggestions: [],
        history_and_training_disabled: true,
        conversation_mode: {
          kind: "primary_assistant",
        },
        system_hints: [],
        supports_buffering: true,
        supported_encodings: ["v1"],
        client_contextual_info: {
          is_dark_mode: true,
          time_since_loaded: 7,
          page_height: 911,
          page_width: 1080,
          pixel_ratio: 1,
          screen_height: 1080,
          screen_width: 1920,
          app_name: "chatgpt.com",
        },
      }),
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
    }

    if (response.body === null) {
      throw new Error("Failed to receive response body. Please check your sessionToken and try again.");
    }

    if (options?.stream) {
      return this.streamResponse(response);
    }

    return this.collectFullResponse(response);
  }

  private async collectFullResponse(response: Response): Promise<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    let result = "";
    let buffer = "";
    let finished = false;

    while (true) {
      const {done, value} = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, {stream: true});
      let lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const dataStr = line.replace("data:", "").trim();
        if (!dataStr || dataStr === "[DONE]") continue;

        try {
          const json = JSON.parse(dataStr);

          if (json.message) {
            if (json.message.content && json.message.content.parts) {
              result = json.message.content.parts[0];
            }
            if (json.message.status === "finished_successfully") {
              finished = true;
              break;
            }
          } else if (json.o === "append" && json.p === "/message/content/parts/0") {
            result += json.v;
          } else if (Array.isArray(json.v)) {
            for (const op of json.v) {
              if (op.o === "append" && op.p === "/message/content/parts/0") {
                result += op.v;
              }
              if (op.p === "/message/status" && op.o === "replace" && op.v === "finished_successfully") {
                finished = true;
              }
            }
          }
        } catch {
          continue;
        }
      }

      if (finished) break;
    }

    if (!finished && buffer.startsWith("data:")) {
      try {
        const json = JSON.parse(buffer.replace("data:", "").trim());
        if (json.message && json.message.content && json.message.content.parts) {
          result = json.message.content.parts[0];
        }
      } catch {
      }
    }

    return result;
  }

  private async *streamResponse(response: Response): AsyncGenerator<{text: string; metadata: any}> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let fullText = "";
    let finished = false;

    while (!finished) {
      const {done, value} = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, {stream: true});
      let lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;

        const dataStr = line.slice("data:".length).trim();
        if (!dataStr || dataStr === "[DONE]") continue;

        let json: any;
        try {
          json = JSON.parse(dataStr);
        } catch {
          continue;
        }

        let deltaText = "";
        let metadata: any = undefined;

        if (json.message) {
          const parts = json.message.content?.parts;
          metadata = json.message.metadata ?? json.metadata;

          if (Array.isArray(parts) && typeof parts[0] === "string") {
            const current = parts[0];
            if (current.startsWith(fullText)) {
              deltaText = current.slice(fullText.length);
            } else {
              deltaText = current;
            }
            fullText = current;
          }

          if (json.message.status === "finished_successfully") {
            finished = true;
          }
        }

        if (json.o === "append" && json.p === "/message/content/parts/0") {
          deltaText += json.v;
          fullText += json.v;
        }

        if (Array.isArray(json.v)) {
          for (const op of json.v) {
            if (op.o === "append" && op.p === "/message/content/parts/0") {
              deltaText += op.v;
              fullText += op.v;
            }
            if (op.p === "/message/status" && op.o === "replace" && op.v === "finished_successfully") {
              finished = true;
            }
          }
        }

        if (json.type === "message_stream_complete") {
          finished = true;
        }

        if (deltaText) {
          yield {
            text: deltaText,
            metadata: metadata ?? json.metadata ?? {},
          };
        }

        if (finished) break;
      }
    }
  }
}
