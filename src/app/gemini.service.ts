import { Injectable } from '@angular/core';

export interface TranslationResult {
  text: string;
  usageMetadata?: any;
}

interface ServerGenerateResponse {
  text?: string;
  candidates?: { finishReason?: string }[];
  usageMetadata?: any;
  error?: { message?: string };
}

interface InteractionApiResponse {
  id: string;
  status: string;
  output_text?: string;
  usageMetadata?: any;
  error?: { message?: string } | string;
}

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private readonly MODEL_NAME_ARGON = 'gemini-4-argon';
  private readonly MODEL_NAME_FLASH = 'gemini-flash-latest';
  private readonly MODEL_NAME_FLASH_LITE = 'gemini-flash-lite-latest';
  private readonly MAX_OUTPUT_TOKENS = 256000;

  private getUserApiKey(): string {
    if (typeof localStorage !== 'undefined') {
      const userKey = localStorage.getItem('sila_pdf_translator_user_api_key');
      if (userKey && userKey.trim() !== '') {
        return userKey.trim();
      }
    }
    throw new Error('Vui lòng thiết lập "API Key cá nhân" trong phần "Nhập API Key" (nằm ngay dưới logo) để sử dụng ứng dụng.');
  }

  private serverProxyAvailable: boolean | null = null;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('sila_server_proxy_available');
      if (saved === 'false') {
        this.serverProxyAvailable = false;
      } else if (saved === 'true') {
        this.serverProxyAvailable = true;
      }
    }
  }

  private markServerProxyUnavailable(): void {
    this.serverProxyAvailable = false;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('sila_server_proxy_available', 'false');
      } catch (e: unknown) {
        console.warn('Cannot write to localStorage', e);
      }
    }
  }

  private markServerProxyAvailable(): void {
    this.serverProxyAvailable = true;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('sila_server_proxy_available', 'true');
      } catch (e: unknown) {
        console.warn('Cannot write to localStorage', e);
      }
    }
  }

  private async safeFetchServer(url: string, payload: any): Promise<any | null> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      // If endpoint doesn't exist (e.g. static hosting on Cloudflare/Vercel/S3)
      if (response.status === 404 || response.status === 405) {
        this.markServerProxyUnavailable();
        return null;
      }

      const rawText = await response.text();
      if (!rawText || rawText.trim() === '') {
        this.markServerProxyUnavailable();
        return null;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // Received non-JSON (like an HTML 404 error page from static host)
        this.markServerProxyUnavailable();
        return null;
      }

      if (!response.ok) {
        throw new Error(parsed?.error?.message || `HTTP ${response.status}: Lỗi máy chủ`);
      }

      this.markServerProxyAvailable();
      return parsed;
    } catch (e: unknown) {
      if (this.serverProxyAvailable === false) {
        return null;
      }
      if (e instanceof Error && !e.message.includes('fetch') && !e.message.includes('NetworkError')) {
        throw e;
      }
      this.markServerProxyUnavailable();
      return null;
    }
  }

  private parseInteractionRawResult(raw: any): InteractionApiResponse {
    let fullOutput = '';
    if (Array.isArray(raw?.steps)) {
      for (const step of raw.steps) {
        if (step?.type === 'model_output' && Array.isArray(step.content)) {
          for (const c of step.content) {
            if (c?.type === 'text' && c.text) {
              fullOutput += c.text;
            }
          }
        }
      }
    }
    if (!fullOutput && typeof raw?.output_text === 'string') {
      fullOutput = raw.output_text;
    }

    const usage = raw?.usage || raw?.usageMetadata;
    const usageMetadata = usage
      ? {
          promptTokenCount: usage.input_tokens ?? usage.promptTokenCount,
          candidatesTokenCount: usage.output_tokens ?? usage.candidatesTokenCount,
          totalTokenCount: usage.total_tokens ?? usage.totalTokenCount,
        }
      : undefined;

    return {
      id: raw?.id || '',
      status: raw?.status || '',
      output_text: fullOutput,
      usageMetadata,
      error: raw?.error,
    };
  }

  private async directCreateInteraction(payload: {
    model: string;
    input: any;
    systemInstruction?: string;
    useGoogleSearch?: boolean;
    maxOutputTokens?: number;
    thinkingLevel?: string;
    background?: boolean;
    userApiKey: string;
  }): Promise<InteractionApiResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${payload.userApiKey}`;
    const body: Record<string, any> = {
      model: payload.model.startsWith('models/') ? payload.model : `models/${payload.model}`,
      input: payload.input,
      background: payload.background ?? true,
      generation_config: {
        max_output_tokens: payload.maxOutputTokens ?? this.MAX_OUTPUT_TOKENS,
        thinking_level: (payload.thinkingLevel || 'medium').toLowerCase(),
      },
    };

    if (payload.systemInstruction) {
      body['system_instruction'] = payload.systemInstruction;
    }

    if (payload.useGoogleSearch) {
      body['tools'] = [{ type: 'google_search' }];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    let data: any = {};
    try {
      if (rawText && rawText.trim() !== '') {
        data = JSON.parse(rawText);
      }
    } catch {
      throw new Error(`Phản hồi không hợp lệ từ Google Interactions API (HTTP ${response.status})`);
    }

    if (!response.ok) {
      throw new Error(data?.error?.message || `Lỗi từ Google Interactions API (HTTP ${response.status})`);
    }

    return this.parseInteractionRawResult(data);
  }

  private async directGetInteraction(interactionId: string, userApiKey: string): Promise<InteractionApiResponse> {
    const cleanId = interactionId.replace(/^interactions\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/interactions/${cleanId}?key=${userApiKey}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const rawText = await response.text();
    let data: any = {};
    try {
      if (rawText && rawText.trim() !== '') {
        data = JSON.parse(rawText);
      }
    } catch {
      throw new Error(`Phản hồi không hợp lệ khi kiểm tra trạng thái Interaction (HTTP ${response.status})`);
    }

    if (!response.ok) {
      throw new Error(data?.error?.message || `Lỗi khi kiểm tra Interaction (HTTP ${response.status})`);
    }

    return this.parseInteractionRawResult(data);
  }

  private async runInteractionWithPolling(payload: {
    model: string;
    input: any;
    systemInstruction?: string;
    useGoogleSearch?: boolean;
    maxOutputTokens?: number;
    thinkingLevel?: string;
    background?: boolean;
    userApiKey: string;
  }): Promise<TranslationResult> {
    let initial: InteractionApiResponse | null = null;

    if (this.serverProxyAvailable !== false) {
      const serverRes = await this.safeFetchServer('/api/gemini/interactions/create', payload);
      if (serverRes !== null) {
        initial = this.parseInteractionRawResult(serverRes);
      }
    }

    if (!initial) {
      initial = await this.directCreateInteraction(payload);
    }

    if (initial.status === 'completed') {
      if (!initial.output_text) {
        throw new Error('Gemini không trả về kết quả (có thể do lỗi hệ thống hoặc bộ lọc). Vui lòng thử lại.');
      }
      return {
        text: initial.output_text,
        usageMetadata: initial.usageMetadata,
      };
    }

    if (initial.status === 'failed' || initial.status === 'cancelled') {
      const errMsg = typeof initial.error === 'string' ? initial.error : initial.error?.message;
      throw new Error(errMsg || `Tiến trình dịch thất bại (${initial.status}).`);
    }

    const interactionId = initial.id;
    if (!interactionId) {
      throw new Error('Không nhận được mã tiến trình (interaction.id) từ máy chủ AI.');
    }

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 10000));

      let pollResult: InteractionApiResponse | null = null;
      if (this.serverProxyAvailable !== false) {
        const serverPoll = await this.safeFetchServer('/api/gemini/interactions/get', {
          interactionId,
          userApiKey: payload.userApiKey,
        });
        if (serverPoll !== null) {
          pollResult = this.parseInteractionRawResult(serverPoll);
        }
      }

      if (!pollResult) {
        pollResult = await this.directGetInteraction(interactionId, payload.userApiKey);
      }

      if (pollResult.status === 'completed') {
        if (!pollResult.output_text) {
          throw new Error('Gemini hoàn tất nhưng không trả về văn bản kết quả. Vui lòng thử lại.');
        }
        return {
          text: pollResult.output_text,
          usageMetadata: pollResult.usageMetadata,
        };
      } else if (pollResult.status === 'failed' || pollResult.status === 'cancelled') {
        const errMsg = typeof pollResult.error === 'string' ? pollResult.error : pollResult.error?.message;
        throw new Error(errMsg || 'Tiến trình dịch trên máy chủ AI đã thất bại.');
      }
    }
  }

  private async directGenerate(payload: {
    model: string;
    parts: any[];
    systemInstruction?: string;
    useGoogleSearch?: boolean;
    thinkingLevel?: string;
    maxOutputTokens?: number;
    userApiKey: string;
  }): Promise<ServerGenerateResponse> {
    const cleanModel = payload.model.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${payload.userApiKey}`;

    const body: Record<string, any> = {
      contents: [
        {
          parts: payload.parts
        }
      ],
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ]
    };

    if (payload.systemInstruction) {
      body['systemInstruction'] = {
        parts: [{ text: payload.systemInstruction }]
      };
    }

    const generationConfig: Record<string, any> = {};
    if (payload.thinkingLevel) {
      generationConfig['thinkingConfig'] = {
        thinkingLevel: payload.thinkingLevel
      };
    }
    if (payload.maxOutputTokens) {
      generationConfig['maxOutputTokens'] = payload.maxOutputTokens;
    }
    if (Object.keys(generationConfig).length > 0) {
      body['generationConfig'] = generationConfig;
    }

    if (payload.useGoogleSearch) {
      body['tools'] = [{ googleSearch: {} }];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const rawText = await response.text();
    let data: any = {};
    try {
      if (rawText && rawText.trim() !== '') {
        data = JSON.parse(rawText);
      }
    } catch {
      throw new Error(`Phản hồi không hợp lệ từ Google Gemini API (HTTP ${response.status})`);
    }

    if (!response.ok) {
      throw new Error(data?.error?.message || `Lỗi từ Google Gemini API (HTTP ${response.status})`);
    }

    const candidate = data.candidates?.[0];
    let extractedText = '';
    if (candidate?.content?.parts) {
      extractedText = candidate.content.parts
        .map((p: any) => p.text || '')
        .join('');
    }

    return {
      text: extractedText,
      candidates: data.candidates?.map((c: any) => ({ finishReason: c.finishReason })),
      usageMetadata: data.usageMetadata
    };
  }

  private async directCountTokens(fileData: string, mimeType: string, userApiKey: string): Promise<number> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:countTokens?key=${userApiKey}`;
    const cleanFileData = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const contentParts =
      mimeType === 'text/html'
        ? [{ text: fileData }]
        : [
            {
              inlineData: {
                data: cleanFileData,
                mimeType: mimeType
              }
            }
          ];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: contentParts
          }
        ]
      })
    });

    const rawText = await response.text();
    let data: any = {};
    try {
      if (rawText && rawText.trim() !== '') {
        data = JSON.parse(rawText);
      }
    } catch {
      throw new Error(`Phản hồi không hợp lệ từ Google Gemini API (HTTP ${response.status})`);
    }

    if (!response.ok) {
      throw new Error(data?.error?.message || `Lỗi khi tính số token (HTTP ${response.status})`);
    }

    return data.totalTokens || 0;
  }

  private async callGenerateEndpoint(payload: {
    model: string;
    parts: any[];
    systemInstruction?: string;
    useGoogleSearch?: boolean;
    thinkingLevel?: string;
    maxOutputTokens?: number;
    userApiKey: string;
  }): Promise<ServerGenerateResponse> {
    if (this.serverProxyAvailable !== false) {
      const serverResult = await this.safeFetchServer('/api/gemini/generate', payload);
      if (serverResult !== null) {
        return serverResult;
      }
    }

    return await this.directGenerate(payload);
  }

  async countTokens(fileData: string, mimeType: string): Promise<number> {
    const userApiKey = this.getUserApiKey();

    if (this.serverProxyAvailable !== false) {
      const serverResult = await this.safeFetchServer('/api/gemini/count-tokens', {
        fileData,
        mimeType,
        userApiKey
      });
      if (serverResult !== null && typeof serverResult.totalTokens === 'number') {
        return serverResult.totalTokens;
      }
    }

    return await this.directCountTokens(fileData, mimeType, userApiKey);
  }

  async translate(
    fileData: string,
    mimeType: string,
    prompt: string,
    systemInstruction: string,
    useGoogleSearch = false,
    modelName: string = this.MODEL_NAME_ARGON,
    images: {id: string, dataUrl: string}[] = [],
    thinkingLevel: 'medium' | 'high' = 'medium'
  ): Promise<TranslationResult> {
    const userApiKey = this.getUserApiKey();
    const interactionInput: any[] = [];
    
    // Add the main PDF document
    const cleanFileData = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    interactionInput.push({
      type: 'document',
      data: cleanFileData,
      mime_type: mimeType
    });

    // Add extracted images
    for (const img of images) {
      if (img.dataUrl.includes(',')) {
        const mime = img.dataUrl.split(';')[0].split(':')[1];
        const data = img.dataUrl.split(',')[1];
        interactionInput.push({
          type: 'image',
          data: data,
          mime_type: mime
        });
        interactionInput.push({
          type: 'text',
          text: `(This image has ID: ${img.id})`
        });
      }
    }

    // Add the user prompt
    interactionInput.push({
      type: 'text',
      text: prompt
    });

    try {
      return await this.runInteractionWithPolling({
        model: modelName || this.MODEL_NAME_ARGON,
        input: interactionInput,
        systemInstruction,
        useGoogleSearch,
        maxOutputTokens: this.MAX_OUTPUT_TOKENS,
        thinkingLevel,
        background: true,
        userApiKey
      });
    } catch (e: unknown) {
      if (e instanceof Error) {
        throw new Error(e.message);
      }
      throw new Error('Lỗi không xác định khi dịch tài liệu');
    }
  }

  async translateSingleImageToHtml(
    dataUrl: string,
    modelName: string = this.MODEL_NAME_ARGON,
    thinkingLevel: 'medium' | 'high' = 'medium'
  ): Promise<string> {
    const userApiKey = this.getUserApiKey();
    const systemInstruction = `Bạn là một chuyên gia thiết kế web, UI/UX và phiên dịch.
Người dùng gửi cho bạn một hình ảnh.
Nhiệm vụ 1: Đánh giá xem hình ảnh này có phải là sơ đồ, biểu đồ, hình vẽ kỹ thuật, hay bất kỳ hình thức nào chứa văn bản cần dịch không. Nếu đây là ảnh chụp thông thường (chân dung, phong cảnh, động vật, nhà cửa, v.v.) không chứa nội dung cần dịch, hãy trả về CHÍNH XÁC chuỗi: [REJECT].
Nhiệm vụ 2: Nếu hình ảnh hợp lệ, hãy tái tạo lại hình ảnh đó bằng HTML và CSS một cách chính xác và thẩm mỹ nhất. Dịch tất cả văn bản trong hình sang Tiếng Việt.
YÊU CẦU KỸ THUẬT QUAN TRỌNG:
1. Tính tương thích (Responsive): Cấu trúc tạo ra phải co giãn tốt. TUYỆT ĐỐI KHÔNG thiết lập chiều rộng cố định (như width: 800px) gây tràn khung. Dùng \`max-width: 100%\`, \`width: 100%\`, \`box-sizing: border-box\`, và các đơn vị tương đối (%, rem, em). Đảm bảo tuyệt đối KHÔNG xuất hiện thanh cuộn ngang.
2. Bố cục thông minh: Ưu tiên sử dụng Flexbox hoặc CSS Grid để xây dựng bố cục sơ đồ, biểu đồ mạch lạc. Tránh lạm dụng \`position: absolute\` trừ khi thực sự cần thiết (như chú thích điểm ảnh), giúp cấu trúc linh hoạt trên mọi kích thước màn hình.
3. Typography & UI: Sử dụng \`font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;\` để văn bản hiển thị hiện đại, chuyên nghiệp. Điều chỉnh \`font-size\`, \`line-height\` và \`padding\` linh hoạt sao cho nội dung tiếng Việt dễ đọc, không bị che khuất hoặc tràn khỏi container.
4. Màu sắc & Hình khối: Cố gắng mô phỏng trung thực (hoặc cải thiện để đẹp mắt hơn) màu sắc nền, độ tương phản chữ, border-radius, border, và shadow từ ảnh gốc để kết quả trông sắc nét và chuyên nghiệp.
Chỉ trả về mã HTML (được phép bao gồm thẻ <style> bên trong, không chứa markdown như \`\`\`html), không giải thích gì thêm.`;

    const mime = dataUrl.split(';')[0].split(':')[1];
    const data = dataUrl.split(',')[1];
    
    const interactionInput: any[] = [
      {
        type: 'image',
        data: data,
        mime_type: mime
      },
      {
        type: 'text',
        text: 'Hãy tái tạo và dịch hình ảnh này sang HTML/CSS. Nếu không phải hình cần dịch, trả về [REJECT].'
      }
    ];

    try {
      const result = await this.runInteractionWithPolling({
        model: modelName || this.MODEL_NAME_ARGON,
        input: interactionInput,
        systemInstruction,
        maxOutputTokens: this.MAX_OUTPUT_TOKENS,
        thinkingLevel,
        background: true,
        userApiKey
      });
      return result.text;
    } catch (e: unknown) {
      if (e instanceof Error) {
        throw new Error(e.message);
      }
      throw new Error('Lỗi khi dịch hình ảnh');
    }
  }

  async translateSearchQuery(query: string, searchModel: 'gemini-flash-lite-latest' | 'gemini-flash-latest' = 'gemini-flash-lite-latest'): Promise<string> {
    const userApiKey = this.getUserApiKey();
    const systemInstruction = `Bạn là một AI chuyên dịch truy vấn tìm kiếm (search queries) từ tiếng Việt sang Tiếng Anh. Nhiệm vụ DUY NHẤT của bạn là trả về MỘT (1) truy vấn tìm kiếm tiếng Anh hiệu quả nhất, dựa trên đánh giá của bạn về ý định (search intent) và cách tìm kiếm phổ biến nhất trong tiếng Anh.

QUY TẮC BẮT BUỘC TUÂN THỦ:
1.  **CHỈ MỘT KẾT QUẢ:** Luôn luôn và chỉ luôn trả về DUY NHẤT MỘT chuỗi văn bản là bản dịch truy vấn tốt nhất. KHÔNG được đưa ra nhiều lựa chọn.
2.  **CHỈ VĂN BẢN THUẦN TÚY:** Kết quả trả về CHỈ BAO GỒM văn bản tiếng Anh đã dịch. TUYỆT ĐỐI KHÔNG thêm bất kỳ lời chào, lời giải thích, ghi chú, dấu ngoặc kép bao quanh, định dạng markdown, hoặc bất kỳ ký tự/từ ngữ nào khác ngoài chính truy vấn đã dịch.
3.  **ƯU TIÊN HIỆU QUẢ TÌM KIẾM HỌC THUẬT:** Mục tiêu là tạo ra truy vấn mà các nhà nghiên cứu, sinh viên thực sự sẽ gõ vào máy tìm kiếm tài liệu khoa học (như Google Scholar). Ưu tiên thuật ngữ chuyên ngành (academic terminology), danh từ cốt lõi, và các từ khóa nghiên cứu phổ biến (ví dụ: impact of, efficacy, meta-analysis, case study, literature review, characteristics, v.v.). Tránh các từ giao tiếp thông thường.
4.  **ĐỘ CHÍNH XÁC VỀ Ý ĐỊNH:** Nắm bắt chính xác nhất ý định đằng sau truy vấn gốc tiếng Việt. Nếu mơ hồ, hãy chọn cách diễn giải phổ biến hoặc khả năng cao nhất.
5.  **ĐỊNH DẠNG ĐẦU RA:** Đảm bảo đầu ra là một chuỗi văn bản thuần túy (plain text string) duy nhất, sẵn sàng để sao chép và dán trực tiếp vào thanh tìm kiếm.`;

    const prompt = `Provide the single best English search query translation for the following Vietnamese query. Output ONLY the raw English text, nothing else: ${query}`;

    try {
      const response = await this.callGenerateEndpoint({
        model: searchModel,
        parts: [{ text: prompt }],
        systemInstruction,
        userApiKey
      });

      return (response.text || '').trim();
    } catch (e: unknown) {
      if (e instanceof Error) {
        throw new Error(e.message);
      }
      throw new Error('Lỗi khi dịch từ khóa');
    }
  }

  public parseGeminiError(e: unknown): string {
    const errorMessage = e instanceof Error ? e.message : String(e);
    if (!errorMessage) {
      return 'Lỗi không xác định';
    }

    try {
      if (errorMessage.includes('{') && errorMessage.includes('}')) {
        const startIdx = errorMessage.indexOf('{');
        const endIdx = errorMessage.lastIndexOf('}') + 1;
        const jsonPart = errorMessage.substring(startIdx, endIdx);
        const parsed = JSON.parse(jsonPart);
        if (parsed.error?.message) {
          return parsed.error.message;
        } else if (parsed.message) {
          return parsed.message;
        }
      }
    } catch {
      // Ignored
    }

    return errorMessage;
  }
}
