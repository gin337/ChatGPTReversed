# ChatGPTReversed - Educational project

Lets keep it simple, this is a educational project to learn to reverse complex API's and understand how they communicate with the frontend.
In this case we take a look at the ChatGPT frontend and reverse engineer the API used to communicate with the LLM.

OpenAi uses several techniques to prevent malicious use of their API, eg. rate limiting, token expiration, hashing, proof of work, continious calls, proxies, captchas, etc.

We take a look at the ChatGPT webapp as starting point and only use the chromium devtools to understand the process.

![step1](https://i.imgur.com/FbvbKML.png)
We start by opening the ChatGPT webapp and open the devtools to see the network requests.

![step2](https://i.imgur.com/SSXA50s.png)
`https://chatgpt.com/backend-api/conversation` endpoint is called with a POST request, we can see the payload and type of response. (In this case its a EventStream)

![step3](https://i.imgur.com/52qYDXC.png)
![step4](https://i.imgur.com/p3eRbQ8.png)
Several Identifing headers and cookies are used to prevent abuse, in this case:
`Authorization(JWT Token)`, `csrf-token(CSRF protection)`, `session-token (Same as the JWT token)`, `Requirements-Token & Proof Token`

![step5](https://i.imgur.com/CwCzpnV.png)
`https://chatgpt.com/backend-api/sentinel/chat-requirements` endpoint is called before the conversation starts, it passes in the token x and returns the token y.

```json
{
  "persona": "chatgpt-freeaccount",
  "token": "y",
  "arkose": {},
  "turnstile": {},
  "proofofwork": {
    "required": true,
    "seed": "0.81186133b2821174",
    "difficulty": "073682"
  }
}
```

To find out how x is retrieved we need to take a look at the minified source code of the frontend.

![step6](https://i.imgur.com/XuWosqk.png)
Token x in this case is variable e which is passed as callback from variable n which uses the function `getRequirementsToken` to retrieve the token.
![step7](https://i.imgur.com/hJfvHKS.png)
The function `getRequirementsToken` in this case returns the token x by checking if the value is already in a map called `answers`, if not it calls the function \_generateAnswer which returns the token x by using a hash function provided by the hashing library `hash-wasm`.

![step8](https://i.imgur.com/Ld0al4b.png)
We place a breakpoint right after the `getRequirementsToken` function is called and check the returned value which is the token x.

So we have the token x (Requirements token), we need to pass to the endpoint, we also have the token y (Required Requirements Token) which is returned by the endpoint. The last thing we need is the token z (Proof token) which as we find out is also generated with `_generateAnswer`.

`_generateAnswer` function is called with the seed and difficulty returned by the endpoint, it uses the seed and also multiple parameters retrieved by the `getConfig` such as screen size, timezone, cpu cores, etc. to generate a hash and satisfy the difficulty condition. If no hash is found it will increment the step and try again. It falls back to a specified value after multiple steps.

In this case the function `_generateAnswer` is called with the seed and difficulty returned by the endpoint and that returns the token z.

So we have all the required tokens to call the conversation endpoint and start a conversation with the LLM.
To recap:

- Session Token (JWT Token) is returned by `https://chatgpt.com/api/auth/session` in field `accessToken`

- CSRF Token is returned by `https://chatgpt.com/api/auth/csrf` in field `csrfToken`

- Requirements Token (Token x) is returned by `getRequirementsToken` function

- Required Requirements Token (Token y) is returned by the endpoint `https://chatgpt.com/backend-api/sentinel/chat-requirements`

- Proof Token (Token z) is returned by `_generateAnswer` function with the seed and difficulty returned by the `https://chatgpt.com/backend-api/sentinel/chat-requirements` endpoint

The rest is basic web communication knowledge.

## Documentation

```typescript
import {ChatGPTReversed} from "chatgptreversed"; // const {ChatGPTReversed} = require("chatgptreversed");

const chatgpt = new ChatGPTReversed({
  sessionToken: "Session Token",
  requirementsToken: "token x",
});

const result = await chatgpt.complete("Hello, how are you?");
console.log(result);

// Output: Hello! I'm here and ready to assist you. How can I help you today?
```

```typescript
import {ChatGPTReversed} from "chatgptreversed"; // const {ChatGPTReversed} = require("chatgptreversed");

const chatgpt = new ChatGPTReversed({
  sessionToken: "Session Token",
  requirementsToken: "token x",
});

async function main() {
  const result = await chatgpt.complete("Hello, how are you?");
  console.log(result);
}

main();

// Output: Hello! I'm here and ready to assist you. How can I help you today?
```
