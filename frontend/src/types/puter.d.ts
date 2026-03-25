type PuterChatStreamPart = {
  text?: string;
};

type PuterAi = {
  chat: (
    prompt: string,
    options?: {
      model?: string;
      stream?: boolean;
    }
  ) => Promise<string | AsyncIterable<PuterChatStreamPart>>;
};

type PuterGlobal = {
  ai: PuterAi;
};

declare global {
  interface Window {
    puter?: PuterGlobal;
  }
}

export {};
