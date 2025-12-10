import {expect, test} from "vitest";
import {ChatGPTReversed} from "../src/index";

test("Retrieves stream answer from oai", async () => {
  const chatgpt = new ChatGPTReversed();

  const result = await chatgpt.complete("Hey, how are you?", {stream: true});

  let streamData = "";
  for await (const chunk of result) {
    streamData += chunk.text;
    console.log("Chunk: ", chunk.text);
  }
  console.log("Streamed Result: ", streamData);

  expect(streamData).toBeTypeOf("string");
});
