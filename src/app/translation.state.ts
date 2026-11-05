import { Injectable, signal, computed, inject } from '@angular/core';
import { GeminiService } from './gemini.service';
import { ToastService } from './toast.service';
import { PdfService } from './pdf.service';
import { DbService } from './db.service';
import { StorageService, TranslatedDoc } from './storage.service';
import { PromptService } from './prompt.service';
import { ImageProcessorService, ExtractedImage } from './image-processor.service';

export type TranslationMode = 'zero_math' | 'zero_svg' | 'normal';
export type SearchModel = 'gemini-flash-lite-latest' | 'gemini-flash-latest';
export type ThinkingLevelOption = 'medium' | 'high';

@Injectable({
  providedIn: 'root'
})
export class TranslationState {
  private geminiService = inject(GeminiService);
  private toastService = inject(ToastService);
  private pdfService = inject(PdfService);
  private dbService = inject(DbService);
  private storageService = inject(StorageService);
  private promptService = inject(PromptService);
  private imageProcessorService = inject(ImageProcessorService);

  private lastTranslationUsageMetadata: any = null;

  readonly MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB
  readonly MAX_PDF_TOKENS = 100000;

  selectedModel = signal<string>('gemini-4-argon');
  selectedFile = signal<File | null>(null);
  fileBase64 = signal<string | null>(null);
  mimeType = signal<string>('');
  
  hasUserApiKey = signal<boolean>(false);
  thinkingLevel = signal<ThinkingLevelOption>('medium');
  mode = signal<TranslationMode>('zero_svg');
  useGoogleSearch = signal<boolean>(false);
  searchModel = signal<SearchModel>('gemini-flash-lite-latest');
  
  isProcessing = signal<boolean>(false);
  isSearchingKeyword = signal<boolean>(false);
  isBusy = computed(() => this.isProcessing() || this.isSearchingKeyword());
  progressMessage = signal<string>('');
  error = signal<string | null>(null);
  
  resultHtml = signal<string | null>(null);
  tokenCount = signal<number>(0);
  isCountingTokens = signal<boolean>(false);
  
  pdfTotalPages = signal<number>(0);
  pdfStartPage = signal<number>(1);
  pdfEndPage = signal<number>(1);
  croppedFile = signal<File | null>(null);
  pdfHash = signal<string | null>(null);
  
  elapsedTime = signal<number>(0);
  isLoadedFromHistory = signal<boolean>(false);
  activeHistoryItemId = signal<number | null>(null);
  historyItems = signal<TranslatedDoc[]>([]);
  rawOriginalFileBlob = signal<Blob | null>(null);

  currentMaxTokens = computed(() => this.MAX_PDF_TOKENS);
  hasFile = computed(() => this.selectedFile() !== null);
  hasOriginalFile = computed(() => {
    const file = this.selectedFile();
    if (file && file.size > 0) return true;
    return !!this.rawOriginalFileBlob();
  });
  canProcess = computed(() => this.hasFile() && !this.isBusy() && !this.isCountingTokens() && this.tokenCount() <= this.currentMaxTokens());
  tokenPercentage = computed(() => Math.min((this.tokenCount() / this.currentMaxTokens()) * 100, 100));
  
  formattedTime = computed(() => {
    const totalSeconds = this.elapsedTime();
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  });

  private timerInterval: ReturnType<typeof setInterval> | undefined;

  showToast(type: 'error' | 'info' | 'success', message: string) {
    this.toastService.show(type, message);
  }

  async handlePdfFile(file: File) {
    if (file.type !== 'application/pdf') {
      this.showToast('error', 'Vui lòng tải lên tệp PDF.');
      this.resetFileState();
      return;
    }
    
    if (file.size > this.MAX_FILE_SIZE) {
      this.showToast('error', 'Lỗi: Tệp tải lên vượt quá giới hạn 30MB.');
      this.resetFileState();
      return;
    }

    this.resetPartialState(file);
    this.isCountingTokens.set(true);

    try {
      const pages = await this.pdfService.getPageCount(file);
      this.pdfTotalPages.set(pages);
      this.pdfStartPage.set(1);
      this.pdfEndPage.set(pages);
      await this.processPdfCrop();
    } catch (e) {
      console.error('Error reading PDF:', e);
      this.showToast('error', 'Lỗi khi đọc file PDF.');
      this.isCountingTokens.set(false);
    }
  }

  async processPdfCrop() {
    this.isCountingTokens.set(true);
    this.pdfHash.set(null);
    try {
      const file = this.selectedFile();
      if (!file) return;

      const start = Math.max(1, this.pdfStartPage());
      const end = Math.min(this.pdfTotalPages(), this.pdfEndPage());

      if (start > end) {
        this.showToast('error', 'Trang bắt đầu không được lớn hơn trang kết thúc.');
        this.isCountingTokens.set(false);
        return;
      }

      const result = await this.pdfService.cropPdf(file, start, end, this.pdfTotalPages());
      this.croppedFile.set(result.croppedFile);
      this.fileBase64.set(result.fileBase64);
      await this.checkTokenLimit(result.fileBase64, file.type);

      // Extract images from the cropped PDF
      try {
        const hash = await this.pdfService.hashFile(result.croppedFile);
        this.pdfHash.set(hash);
        const extractedImages = await this.pdfService.extractImagesFromPDF(result.croppedFile, hash);
        
        // Save images to IndexedDB
        await this.dbService.clearImagesByPdf(hash);
        for (const img of extractedImages) {
           await this.dbService.saveImage(img.id, hash, img.dataUrl);
        }
      } catch (err) {
        console.warn('Lỗi khi trích xuất hình ảnh từ PDF:', err);
      }
    } catch (error) {
      console.error('Error cropping PDF:', error);
      this.showToast('error', 'Lỗi khi cắt PDF.');
      this.isCountingTokens.set(false);
    }
  }

  private resetFileState() {
    this.selectedFile.set(null);
    this.fileBase64.set(null);
    this.rawOriginalFileBlob.set(null);
  }

  private resetPartialState(file: File) {
    this.error.set(null);
    this.selectedFile.set(file);
    this.mimeType.set(file.type);
    this.resultHtml.set(null);
    this.croppedFile.set(null);
    this.pdfTotalPages.set(0);
    this.rawOriginalFileBlob.set(file);
  }

  private async checkTokenLimit(base64String: string, mimeType: string) {
    this.isCountingTokens.set(true);
    try {
      const tokens = await this.geminiService.countTokens(base64String, mimeType);
      this.tokenCount.set(tokens);
      const maxTokens = this.currentMaxTokens();
      if (tokens > maxTokens) {
        this.showToast('error', `Lỗi: Nội dung vượt quá giới hạn ${maxTokens.toLocaleString()} tokens (${tokens.toLocaleString()} tokens). Vui lòng cắt bớt trang hoặc giảm dung lượng.`);
      }
    } catch (e: unknown) {
      const parsedError = this.geminiService.parseGeminiError(e);
      this.showToast('error', `Lỗi khi kiểm tra dung lượng tài liệu: ${parsedError}`);
    } finally {
      this.isCountingTokens.set(false);
    }
  }

  async loadPrompt(filename: string): Promise<string> {
    return this.promptService.loadPrompt(filename);
  }

  async processFile() {
    if (!this.canProcess() || !this.fileBase64()) return;

    this.isProcessing.set(true);
    this.error.set(null);
    this.resultHtml.set(null);
    this.elapsedTime.set(0);
    
    this.timerInterval = setInterval(() => {
      this.elapsedTime.update(v => v + 1);
    }, 1000);

    try {
      const base64 = this.fileBase64()!;
      const mime = this.mimeType();
      const currentMode = this.mode();
      
      let extractedImages: ExtractedImage[] = [];
      if (this.pdfHash()) {
        try {
          extractedImages = await this.dbService.getImagesByPdf(this.pdfHash()!);
        } catch (e) {
          console.warn('Không thể lấy ảnh từ DB', e);
        }
      }

      if (currentMode === 'zero_math') {
        this.progressMessage.set('Dịch file PDF sang tiếng Việt (Tài liệu khoa học xã hội)...');
        const [instruction, prompt] = await Promise.all([
          this.loadPrompt('zero_math_system_instructions.md'),
          this.loadPrompt('zero_math_prompt.md')
        ]);
        const result = await this.geminiService.translate(base64, mime, prompt, instruction, this.useGoogleSearch(), this.selectedModel(), extractedImages, this.thinkingLevel());
        this.lastTranslationUsageMetadata = result.usageMetadata;
        const rawHtml = this.imageProcessorService.extractHtml(result.text);
        this.resultHtml.set(this.imageProcessorService.postProcessHtml(rawHtml, extractedImages));
      }
      else if (currentMode === 'zero_svg') {
        this.progressMessage.set('Dịch file PDF sang tiếng Việt (Tài liệu khoa học nói chung)...');
        const [instruction, prompt] = await Promise.all([
          this.loadPrompt('zero_svg_system_instructions.md'),
          this.loadPrompt('zero_svg_prompt.md')
        ]);
        const result = await this.geminiService.translate(base64, mime, prompt, instruction, this.useGoogleSearch(), this.selectedModel(), extractedImages, this.thinkingLevel());
        this.lastTranslationUsageMetadata = result.usageMetadata;
        const rawHtml = this.imageProcessorService.extractHtml(result.text);
        this.resultHtml.set(this.imageProcessorService.postProcessHtml(rawHtml, extractedImages));
      }
      else if (currentMode === 'normal') {
        this.progressMessage.set('Dịch file PDF sang tiếng Việt (Tài liệu toán chuyên ngành)...');
        const [instruction, prompt] = await Promise.all([
          this.loadPrompt('math_system_instructions.md'),
          this.loadPrompt('math_prompt.md')
        ]);
        const result = await this.geminiService.translate(base64, mime, prompt, instruction, this.useGoogleSearch(), this.selectedModel(), extractedImages, this.thinkingLevel());
        this.lastTranslationUsageMetadata = result.usageMetadata;
        const rawHtml = this.imageProcessorService.extractHtml(result.text);
        this.resultHtml.set(this.imageProcessorService.postProcessHtml(rawHtml, extractedImages));
      }

      this.progressMessage.set('Done!');
      this.showToast('success', 'Quá trình dịch tài liệu hoàn tất!');

      await this.saveToHistory();
      
    } catch (e: unknown) {
      const parsedError = this.geminiService.parseGeminiError(e);
      
      if (parsedError.includes('429') || parsedError.toLowerCase().includes('quota')) {
        this.showToast('error', 'Lỗi: API Key của bạn đã vượt quá giới hạn (Quota exceeded). Sử dụng tài khoản khác để tiếp tục dùng ngay hoặc đợi đến ngày hôm sau dùng tiếp.');
      } 
      else if (parsedError.includes('503') || parsedError.toLowerCase().includes('overloaded')) {
        this.showToast('error', 'Lỗi: Máy chủ AI hiện đang bận (Overloaded). Vui lòng thử lại sau.');
      }
      else if (
        (parsedError.toLowerCase().includes('safety') || parsedError.toLowerCase().includes('blocked')) &&
        !parsedError.toLowerCase().includes('safety_settings') &&
        !parsedError.toLowerCase().includes('not supported')
      ) {
        this.showToast('error', 'Lỗi: Tài liệu bị từ chối do vi phạm chính sách an toàn của Google.');
      }
      else if (parsedError.includes('JSON.parse: unexpected character')) {
        this.showToast('error', 'Lỗi: Máy chủ nhận quá nhiều yêu cầu hoặc phản hồi lỗi. Vui lòng thử lại sau vài giây.');
      }
      else {
        this.showToast('error', `Lỗi: ${parsedError}`);
      }
    } finally {
      this.isProcessing.set(false);
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
      }
    }
  }

  private async saveToHistory() {
    const file = this.selectedFile();
    const content = this.resultHtml();
    const currentMode = this.mode();
    if (file && content) {
      let vietnameseTitle = file.name;
      const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1Match) {
        vietnameseTitle = h1Match[1].replace(/<[^>]*>/g, '').trim();
      } else {
        const h2Match = content.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
        if (h2Match) {
          vietnameseTitle = h2Match[1].replace(/<[^>]*>/g, '').trim();
        }
      }
      
      if (!vietnameseTitle || vietnameseTitle.length === 0) {
        vietnameseTitle = file.name;
      } else if (vietnameseTitle.length > 100) {
        vietnameseTitle = vietnameseTitle.substring(0, 97) + '...';
      }

      let fileBlobToSave: Blob | undefined = this.rawOriginalFileBlob() || undefined;
      if (!fileBlobToSave && file && file.size > 0) {
        fileBlobToSave = file;
      }

      const savedId = await this.storageService.saveTranslation({
        originalFileName: file?.name || 'tai_lieu_goc',
        vietnameseTitle: vietnameseTitle,
        mode: currentMode,
        model: this.selectedModel(),
        timestamp: Date.now(),
        content: content,
        pdfHash: this.pdfHash() || undefined,
        originalFileBlob: fileBlobToSave,
        originalFileMimeType: this.mimeType() || undefined,
        promptTokens: this.lastTranslationUsageMetadata?.promptTokenCount,
        candidatesTokens: this.lastTranslationUsageMetadata?.candidatesTokenCount,
        durationSeconds: this.elapsedTime(),
        thinkingLevel: this.thinkingLevel()
      }).catch(err => {
        console.error('Lỗi khi lưu lịch sử:', err);
        return undefined;
      });

      if (savedId) {
        this.activeHistoryItemId.set(savedId);
        await this.fetchHistory();
      }
    }
  }

  async syncImageTranslations(
    updates: Array<{ imgId?: string | null; imgIndex?: number; src?: string | null; translatedHtml: string }>
  ): Promise<boolean> {
    const currentHtml = this.resultHtml();
    if (!currentHtml || !updates || updates.length === 0) return false;

    let updatedHtml = currentHtml;

    if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(currentHtml, 'text/html');
        const imgs = Array.from(doc.querySelectorAll('img'));

        imgs.forEach((img, idx) => {
          if (!img.getAttribute('data-sila-img-id')) {
            img.setAttribute('data-sila-img-id', `sila_img_${idx}`);
          }
        });

        let modified = false;

        for (const item of updates) {
          if (!item.translatedHtml) continue;
          const encoded = encodeURIComponent(item.translatedHtml);

          let targetImg: HTMLImageElement | undefined;

          if (item.imgId) {
            targetImg = imgs.find(img => img.getAttribute('data-sila-img-id') === item.imgId);
          }

          if (!targetImg && typeof item.imgIndex === 'number' && item.imgIndex >= 0 && item.imgIndex < imgs.length) {
            targetImg = imgs[item.imgIndex];
          }

          if (!targetImg && item.src) {
            targetImg = imgs.find(img => {
              const srcAttr = img.getAttribute('src');
              return srcAttr === item.src || (item.src!.length > 20 && !!srcAttr && item.src!.includes(srcAttr));
            });
          }

          if (targetImg) {
            if (targetImg.getAttribute('data-translated-html') !== encoded) {
              targetImg.setAttribute('data-translated-html', encoded);
              modified = true;
            }
          }
        }

        if (modified) {
          const hasDoctype = /^\s*<!doctype\s+html/i.test(currentHtml);
          updatedHtml = (hasDoctype ? '<!DOCTYPE html>\n' : '') + doc.documentElement.outerHTML;
        }
      } catch (e) {
        console.warn('Lỗi khi parse HTML để cập nhật data-translated-html:', e);
      }
    }

    if (updatedHtml !== currentHtml) {
      this.resultHtml.set(updatedHtml);
      const activeId = this.activeHistoryItemId();
      if (activeId) {
        await this.storageService.updateTranslationContent(activeId, updatedHtml);
        await this.fetchHistory();
      }
      return true;
    }

    return false;
  }

  async updateImageTranslationInContent(
    imageSrc: string,
    translatedHtml: string,
    imgId?: string | null,
    imgIndex?: number
  ): Promise<boolean> {
    return this.syncImageTranslations([{ src: imageSrc, translatedHtml, imgId, imgIndex }]);
  }

  cancelTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  resetSession() {
    this.cancelTimer();
    this.selectedFile.set(null);
    this.isLoadedFromHistory.set(false);
    this.activeHistoryItemId.set(null);
    this.selectedModel.set('gemini-4-argon');
    this.fileBase64.set(null);
    this.rawOriginalFileBlob.set(null);
    this.mimeType.set('');
    this.resultHtml.set(null);
    this.error.set(null);
    this.tokenCount.set(0);
    this.progressMessage.set('');
    this.elapsedTime.set(0);
  }

  async fetchHistory() {
    try {
      const items = await this.storageService.getAll();
      this.historyItems.set(items);
    } catch (err) {
      console.error('Không thể tải lịch sử:', err);
      this.showToast('error', 'Không thể đọc dữ liệu lịch sử dịch.');
    }
  }

  async deleteHistoryItem(id: number) {
    try {
      const itemToDelete = this.historyItems().find(item => item.id === id);
      if (itemToDelete && itemToDelete.pdfHash) {
        try {
          await this.dbService.clearImagesByPdf(itemToDelete.pdfHash);
        } catch (err) {
          console.error('Lỗi khi xóa ảnh của tài liệu:', err);
        }
      }
      await this.storageService.delete(id);
      await this.fetchHistory();
      this.showToast('success', 'Đã xóa bản dịch khỏi lịch sử thành công.');
    } catch (err) {
      console.error('Không thể xóa item:', err);
      this.showToast('error', 'Không thể xóa bản dịch khỏi lịch sử.');
    }
  }

  restoreFromHistory(doc: TranslatedDoc) {
    const mime = doc.originalFileMimeType || 'application/pdf';
    const dummyFile = new File([], doc.originalFileName, { type: mime });
    
    this.selectedFile.set(dummyFile);
    this.isLoadedFromHistory.set(true);
    this.activeHistoryItemId.set(doc.id || null);
    this.mimeType.set(dummyFile.type);
    this.resultHtml.set(doc.content);
    const validMode: TranslationMode = (doc.mode === 'zero_math' || doc.mode === 'zero_svg' || doc.mode === 'normal') ? doc.mode : 'zero_svg';
    this.mode.set(validMode);
    this.rawOriginalFileBlob.set(doc.originalFileBlob || null);
    
    this.selectedModel.set('gemini-4-argon');
    
    this.tokenCount.set(0);
    this.error.set(null);
    this.progressMessage.set('Đã khôi phục từ lịch sử');
  }

  downloadOriginalFile() {
    const file = this.selectedFile();
    const blob = this.rawOriginalFileBlob();
    const fileName = file?.name || 'tai_lieu_goc.pdf';

    let targetBlob: Blob | null = null;

    if (file && file.size > 0) {
      targetBlob = file;
    } else if (blob) {
      targetBlob = blob;
    }

    if (targetBlob) {
      const url = URL.createObjectURL(targetBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      this.showToast('error', 'Không tìm thấy file gốc để tải về.');
    }
  }
}
