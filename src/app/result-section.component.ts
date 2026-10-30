import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, ElementRef, viewChild, effect, signal, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Download, Maximize, Minimize, Loader2, Clock, FileText } from 'lucide-angular';
import { GeminiService } from './gemini.service';
import { ImageProcessorService } from './image-processor.service';
import { TranslationState } from './translation.state';

@Component({
  selector: 'app-result-section',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bg-white ring-1 ring-slate-900/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col overflow-hidden transition-all duration-300"
             [class.fixed]="isFullscreen" [class.inset-0]="isFullscreen" [class.z-50]="isFullscreen" [class.rounded-none]="isFullscreen"
             [class.relative]="!isFullscreen" [class.rounded-2xl]="!isFullscreen" [class.h-full]="!isFullscreen" [class.min-h-[600px]]="!isFullscreen" [class.lg:min-h-0]="!isFullscreen">
      
      <!-- Result Header -->
      <div class="min-h-[60px] px-4 py-3 border-b border-slate-100 bg-white/80 backdrop-blur-md flex items-center justify-between shrink-0 z-10 sticky top-0">
        <h2 class="text-sm font-semibold text-slate-900 uppercase tracking-wider">Bản dịch • Đọc tốt nhất trên màn hình lớn</h2>
        
        @if (resultHtml) {
          <div class="flex items-center">
            <div class="relative group">
              <button (click)="onDownloadClick()" class="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 rounded-md transition-colors flex items-center gap-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                <lucide-icon [img]="DownloadIcon" class="w-3.5 h-3.5" aria-hidden="true"></lucide-icon>
                Download
              </button>
              <div class="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded shadow-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                Tải về bản dịch.
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-b-slate-800"></div>
              </div>
            </div>

            <!-- Balanced Divider -->
            <div class="w-px h-4 bg-slate-200 ml-2.5 mr-1 shrink-0" aria-hidden="true"></div>

            <div class="relative group flex items-center">
              <button (click)="toggleFullscreen.emit()" class="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer" [attr.aria-label]="isFullscreen ? 'Thu nhỏ.' : 'Đọc toàn màn hình.'">
                @if (isFullscreen) {
                  <lucide-icon [img]="MinimizeIcon" class="w-4 h-4" aria-hidden="true"></lucide-icon>
                } @else {
                  <lucide-icon [img]="MaximizeIcon" class="w-4 h-4" aria-hidden="true"></lucide-icon>
                }
              </button>
              <div class="absolute top-full right-0 mt-2 px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded shadow-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                {{ isFullscreen ? 'Thu nhỏ.' : 'Đọc toàn màn hình.' }}
                <div class="absolute bottom-full right-2 border-[5px] border-transparent border-b-slate-800"></div>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Result Content -->
      <div class="flex-1 relative bg-slate-50/50">
        @if (isProcessing) {
          <div class="absolute inset-0 bg-white z-10 flex flex-col overflow-hidden">
            <!-- Overlay with spinner (flat, same layer) -->
            <div class="absolute inset-0 flex flex-col items-center justify-center bg-white/75 backdrop-blur-[2px] z-20 px-6 text-center">
              <lucide-icon [img]="Loader2Icon" class="w-10 h-10 text-indigo-600 animate-spin mb-4" aria-hidden="true"></lucide-icon>
              <p class="text-slate-900 font-medium text-base">{{ progressMessage }}</p>
              <div class="mt-3 px-4 py-1.5 bg-white/90 border border-slate-200 rounded-full shadow-xs flex items-center gap-2 text-indigo-600 font-mono font-medium text-sm">
                <lucide-icon [img]="ClockIcon" class="w-4 h-4" aria-hidden="true"></lucide-icon>
                {{ formattedTime }}
              </div>
              <p class="text-slate-500 text-sm mt-4 max-w-md text-center leading-relaxed">
                Thời gian thao tác sẽ cần từ 5 cho đến khoảng 20 phút, tùy thuộc vào độ dài và mức độ phức tạp của nội dung.<br>Hãy giữ kết nối internet của bạn không bị gián đoạn.
              </p>
            </div>
            <!-- Full-height Document Skeleton UI -->
            <div class="p-8 space-y-7 animate-pulse h-full overflow-hidden select-none pointer-events-none">
              <!-- Title & Author Metadata -->
              <div class="space-y-3">
                <div class="h-7 bg-slate-200/80 rounded-lg w-4/5"></div>
                <div class="h-5 bg-slate-200/60 rounded-lg w-1/2"></div>
              </div>

              <!-- Paragraph 1 -->
              <div class="space-y-3 pt-1">
                <div class="h-3.5 bg-slate-200/70 rounded w-full"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-11/12"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-full"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-4/5"></div>
              </div>

              <!-- Diagram / Figure Placeholder -->
              <div class="h-36 bg-slate-100/90 rounded-xl border border-slate-200/60 flex flex-col items-center justify-center gap-2 p-4">
                <div class="w-1/3 h-3 bg-slate-200/70 rounded"></div>
                <div class="w-1/4 h-2.5 bg-slate-200/50 rounded"></div>
              </div>

              <!-- Section Subheading & Paragraph 2 -->
              <div class="space-y-3 pt-1">
                <div class="h-5 bg-slate-200/80 rounded-md w-2/5 mb-2"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-full"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-full"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-10/12"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-full"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-3/4"></div>
              </div>

              <!-- Two-column / Table Placeholder -->
              <div class="grid grid-cols-2 gap-4 pt-1">
                <div class="h-24 bg-slate-100/90 rounded-xl border border-slate-200/60"></div>
                <div class="h-24 bg-slate-100/90 rounded-xl border border-slate-200/60"></div>
              </div>

              <!-- Paragraph 3 (extends to bottom of tall viewports) -->
              <div class="space-y-3 pt-1">
                <div class="h-5 bg-slate-200/80 rounded-md w-1/3 mb-2"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-full"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-11/12"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-full"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-5/6"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-full"></div>
                <div class="h-3.5 bg-slate-200/70 rounded w-2/3"></div>
              </div>
            </div>
          </div>
        }

        @if (!resultHtml && !isProcessing) {
          <div class="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            <div class="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-6 shadow-sm ring-1 ring-indigo-100/50">
              <lucide-icon [img]="FileTextIcon" class="w-12 h-12 text-indigo-300" aria-hidden="true"></lucide-icon>
            </div>
            <h3 class="text-lg font-semibold text-slate-700 mb-2">Khu vực hiển thị kết quả</h3>
            <p class="text-sm text-slate-500 max-w-md">Bản dịch của bạn sẽ xuất hiện tại đây. Bạn có thể tải về để lưu trữ sau khi hoàn tất... Ngoài ra công cụ tự động lưu trữ 10 bản dịch gần nhất ở mục "Lịch sử dịch".</p>
          </div>
        }

        @if (resultHtml) {
          <div class="absolute inset-0 overflow-hidden">
            <iframe #previewIframe id="preview-iframe" class="w-full h-full border-0 bg-white" sandbox="allow-scripts allow-same-origin" title="Bản xem trước tài liệu đã dịch"></iframe>
          </div>
        }
      </div>
    </section>
  `
})
export class ResultSectionComponent {
  readonly DownloadIcon = Download;
  readonly MaximizeIcon = Maximize;
  readonly MinimizeIcon = Minimize;
  readonly Loader2Icon = Loader2;
  readonly ClockIcon = Clock;
  readonly FileTextIcon = FileText;

  @Input() isFullscreen = false;
  @Input() isProcessing = false;
  @Input() progressMessage = '';
  @Input() formattedTime = '';
  @Input() selectedModel = 'gemini-4-argon';

  @Output() downloadHtml = new EventEmitter<void>();
  @Output() toggleFullscreen = new EventEmitter<void>();

  previewIframe = viewChild<ElementRef<HTMLIFrameElement>>('previewIframe');

  private htmlSignal = signal<string | null>(null);
  
  private geminiService = inject(GeminiService);
  private imageProcessorService = inject(ImageProcessorService);
  private translationState = inject(TranslationState);

  private skipNextIframeReload = false;

  @Input({ required: true })
  set resultHtml(val: string | null) {
    this.htmlSignal.set(val);
  }
  get resultHtml(): string | null {
    return this.htmlSignal();
  }

  private async persistUpdatesWithoutReload(
    updates: Array<{ imgId?: string | null; imgIndex?: number; src?: string | null; translatedHtml: string }>
  ) {
    if (!updates || updates.length === 0) return;
    this.skipNextIframeReload = true;
    const changed = await this.translationState.syncImageTranslations(updates);
    if (!changed) {
      this.skipNextIframeReload = false;
    }
  }

  async onDownloadClick() {
    try {
      const iframeDoc = this.previewIframe()?.nativeElement?.contentDocument;
      if (iframeDoc) {
        const imgs = Array.from(iframeDoc.querySelectorAll('img'));
        const updates: Array<{ imgId?: string | null; imgIndex?: number; src?: string | null; translatedHtml: string }> = [];

        imgs.forEach((img, index) => {
          let rawHtml: string | null = null;
          const encodedAttr = img.getAttribute('data-translated-html');
          if (encodedAttr) {
            try {
              rawHtml = decodeURIComponent(encodedAttr);
            } catch {
              rawHtml = null;
            }
          }

          if (!rawHtml && img.parentElement?.classList.contains('interactive-img-wrapper')) {
            const wrapper = img.parentElement as HTMLElement;
            if (wrapper.dataset['translatedHtmlRaw']) {
              rawHtml = wrapper.dataset['translatedHtmlRaw'];
            } else {
              const rec = wrapper.querySelector('.reconstructed-wrapper');
              if (rec?.shadowRoot?.innerHTML) {
                rawHtml = rec.shadowRoot.innerHTML;
              }
            }
          }

          if (rawHtml) {
            updates.push({
              imgId: img.getAttribute('data-sila-img-id') || `sila_img_${index}`,
              imgIndex: index,
              src: img.getAttribute('src'),
              translatedHtml: rawHtml
            });
          }
        });

        if (updates.length > 0) {
          await this.persistUpdatesWithoutReload(updates);
        }
      }
    } catch (err) {
      console.warn('Không thể đồng bộ trực tiếp từ iframe trước khi tải về:', err);
    }

    this.downloadHtml.emit();
  }

  @HostListener('window:message', ['$event'])
  async onMessage(event: MessageEvent) {
    if (!event.data) return;

    if (event.data.type === 'PERSIST_TRANSLATED_IMAGE') {
      const { src, imgId, imgIndex, translatedHtml } = event.data;
      if (translatedHtml) {
        await this.persistUpdatesWithoutReload([{ src, imgId, imgIndex, translatedHtml }]);
      }
      return;
    }

    // Check if the message is from our iframe
    if (event.data.type === 'TRANSLATE_IMAGE') {
      const { src, reqId, imgId, imgIndex } = event.data;
      if (!src) return;
      
      try {
         const translatedText = await this.geminiService.translateSingleImageToHtml(src, this.selectedModel, this.translationState.thinkingLevel());
         if (translatedText.trim() === '[REJECT]') {
            this.sendToIframe({ type: 'IMAGE_TRANSLATED', reqId, success: false, message: 'Ảnh này không phải sơ đồ/biểu đồ nên không thể tái tạo.' });
         } else {
            // Success
            const cleanHtml = this.imageProcessorService.extractHtml(translatedText);
            await this.persistUpdatesWithoutReload([{ src, imgId, imgIndex, translatedHtml: cleanHtml }]);
            this.sendToIframe({ type: 'IMAGE_TRANSLATED', reqId, success: true, html: cleanHtml });
         }
      } catch (error: unknown) {
         const message = error instanceof Error ? error.message : 'Lỗi không xác định.';
         this.sendToIframe({ type: 'IMAGE_TRANSLATED', reqId, success: false, message });
      }
    }
  }
  
  private sendToIframe(data: unknown) {
    const iframe = this.previewIframe();
    if (iframe?.nativeElement?.contentWindow) {
      iframe.nativeElement.contentWindow.postMessage(data, '*');
    }
  }

  constructor() {
    effect(() => {
      const html = this.htmlSignal();
      const iframe = this.previewIframe();
      
      if (html && iframe?.nativeElement) {
         if (this.skipNextIframeReload) {
           this.skipNextIframeReload = false;
           return;
         }
         // Using a timeout just to make sure the view is updated
         setTimeout(() => {
           if (iframe?.nativeElement) {
             iframe.nativeElement.srcdoc = this.imageProcessorService.attachInteractiveScript(html);
           }
         }, 50);
      }
    });
  }
}
