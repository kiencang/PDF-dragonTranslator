if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
  }
  (globalThis as unknown as Record<string, unknown>)['DOMMatrix'] = DOMMatrixPolyfill;
}

process.env['NG_ALLOWED_HOSTS'] = '*';
process.env['NG_TRUST_PROXY_HEADERS'] = 'true';

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder =
  [
    join(serverDistFolder, '../browser'),
    join(process.cwd(), 'browser'),
    join(process.cwd(), 'dist/browser'),
  ].find((folder) => existsSync(folder)) || join(process.cwd(), 'dist/browser');

const app = express();
app.set('trust proxy', true);

const angularApp = new AngularNodeAppEngine({
  allowedHosts: ['*'],
});

app.use(express.json({ limit: '100mb' }));

function getAiInstance(userApiKey?: string): GoogleGenAI {
  const apiKey = userApiKey?.trim() || process.env['GEMINI_API_KEY']?.trim();
  if (!apiKey) {
    throw new Error(
      'Vui lòng thiết lập "API Key cá nhân" trong phần "Nhập API Key" (nằm ngay dưới logo) để sử dụng ứng dụng.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatInteractionResult(interaction: Record<string, any>) {
  let fullOutput = '';
  if (Array.isArray(interaction['steps'])) {
    for (const step of interaction['steps']) {
      if (step?.type === 'model_output' && Array.isArray(step.content)) {
        for (const c of step.content) {
          if (c?.type === 'text' && c.text) {
            fullOutput += c.text;
          }
        }
      }
    }
  }
  if (!fullOutput && typeof interaction['output_text'] === 'string') {
    fullOutput = interaction['output_text'];
  }

  const usage = interaction['usage'];
  const usageMetadata = usage
    ? {
        promptTokenCount: usage.input_tokens ?? usage.promptTokenCount,
        candidatesTokenCount: usage.output_tokens ?? usage.candidatesTokenCount,
        totalTokenCount: usage.total_tokens ?? usage.totalTokenCount,
      }
    : undefined;

  return {
    id: interaction['id'],
    status: interaction['status'],
    output_text: fullOutput,
    usageMetadata,
    error: interaction['error'],
  };
}

app.post('/api/gemini/count-tokens', async (req, res) => {
  try {
    const { fileData, mimeType, userApiKey } = req.body as {
      fileData: string;
      mimeType: string;
      userApiKey?: string;
    };

    const ai = getAiInstance(userApiKey);
    const contentParts =
      mimeType === 'text/html'
        ? [{ text: fileData }]
        : [
            {
              inlineData: {
                data: fileData,
                mimeType: mimeType,
              },
            },
          ];

    const result = await ai.models.countTokens({
      model: 'gemini-flash-lite-latest',
      contents: [{ parts: contentParts as unknown as Record<string, unknown>[] }],
    });

    res.json({ totalTokens: result.totalTokens || 0 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Lỗi khi tính số token.';
    res.status(500).json({ error: { message } });
  }
});

app.post('/api/gemini/interactions/create', async (req, res) => {
  try {
    const {
      model,
      input,
      systemInstruction,
      useGoogleSearch,
      maxOutputTokens,
      thinkingLevel,
      background,
      userApiKey,
    } = req.body as {
      model?: string;
      input: unknown;
      systemInstruction?: string;
      useGoogleSearch?: boolean;
      maxOutputTokens?: number;
      thinkingLevel?: string;
      background?: boolean;
      userApiKey?: string;
    };

    const ai = getAiInstance(userApiKey);

    const generationConfig: Record<string, unknown> = {
      max_output_tokens: maxOutputTokens ?? 256000,
      thinking_level: (thinkingLevel || 'medium').toLowerCase(),
    };

    const createParams: Record<string, unknown> = {
      model: model || 'gemini-4-argon',
      input,
      background: background ?? true,
      generation_config: generationConfig,
    };

    if (systemInstruction) {
      createParams['system_instruction'] = systemInstruction;
    }

    if (useGoogleSearch) {
      createParams['tools'] = [{ type: 'google_search' }];
    }

    const interaction = await ai.interactions.create(
      createParams as unknown as Parameters<typeof ai.interactions.create>[0]
    );

    res.json(formatInteractionResult(interaction as unknown as Record<string, any>));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Lỗi không xác định khi khởi tạo tiến trình dịch (Interactions API)';
    res.status(500).json({ error: { message } });
  }
});

app.post('/api/gemini/interactions/get', async (req, res) => {
  try {
    const { interactionId, userApiKey } = req.body as {
      interactionId: string;
      userApiKey?: string;
    };

    const ai = getAiInstance(userApiKey);
    const result = await ai.interactions.get(interactionId);

    res.json(formatInteractionResult(result as unknown as Record<string, any>));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Lỗi khi kiểm tra trạng thái tiến trình dịch (Interactions API)';
    res.status(500).json({ error: { message } });
  }
});

app.post('/api/gemini/generate', async (req, res) => {
  try {
    const {
      model,
      parts,
      systemInstruction,
      useGoogleSearch,
      thinkingLevel,
      maxOutputTokens,
      userApiKey,
    } = req.body as {
      model: string;
      parts: Record<string, unknown>[];
      systemInstruction?: string;
      useGoogleSearch?: boolean;
      thinkingLevel?: string;
      maxOutputTokens?: number;
      userApiKey?: string;
    };

    const ai = getAiInstance(userApiKey);

    const config: Record<string, unknown> = {
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    };

    if (systemInstruction) {
      config['systemInstruction'] = { parts: [{ text: systemInstruction }] };
    }

    if (thinkingLevel) {
      config['thinkingConfig'] = { thinkingLevel };
    }

    if (maxOutputTokens) {
      config['maxOutputTokens'] = maxOutputTokens;
    }

    if (useGoogleSearch) {
      config['tools'] = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model,
      contents: [{ parts }],
      config,
    });

    res.json({
      text: response.text || '',
      candidates: response.candidates,
      usageMetadata: response.usageMetadata,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Lỗi không xác định khi gọi Gemini API';
    res.status(500).json({ error: { message } });
  }
});

if (existsSync(browserDistFolder)) {
  app.use(
    express.static(browserDistFolder, {
      maxAge: '1y',
      index: false,
      redirect: false,
    }),
  );
}

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 3000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
