import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Key, X, ExternalLink, EyeOff, Eye, Trash2, Zap, Brain } from './lucide-icons';
import { ThinkingLevelOption } from './translation.state';

@Component({
  selector: 'app-api-key-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="api-key-title" (click)="closeModal.emit()">
      <div class="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-0 animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]" (click)="$event.stopPropagation()">
        <div class="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2.5">
            <lucide-icon 
              [img]="Key" 
              class="w-5 h-5 shrink-0 transition-all duration-300 origin-center"
              [class.text-emerald-600]="hasUserApiKey"
              [class.rotate-[15deg]]="hasUserApiKey"
              [class.text-slate-600]="!hasUserApiKey"
              [class.rotate-[75deg]]="!hasUserApiKey"
              aria-hidden="true"
            ></lucide-icon>
            <h3 id="api-key-title" class="text-lg font-bold text-slate-900">Cấu hình Gemini API Key</h3>
          </div>
          <button (click)="closeModal.emit()" class="text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors focus:outline-none rounded-full p-2 cursor-pointer flex items-center justify-center" aria-label="Đóng cấu hình">
            <lucide-icon [img]="XIcon" class="w-5 h-5" aria-hidden="true"></lucide-icon>
          </button>
        </div>
        <div class="p-6 overflow-y-auto flex-1">
          <p class="text-slate-500 text-sm mb-4 leading-relaxed">
            Để sử dụng công cụ dịch file PDF này bạn cần khóa API Key của Gemini. Bạn hãy vào link "Nơi lấy Gemini API Key" để thao tác. Key miễn phí (Free tier) hiện bị giới hạn sử dụng khá nhiều, không còn thoải mái như trước. Hiện chỉ Key trả phí mới tiện dùng ngay.
          </p>

          <div class="flex items-center justify-between gap-3 text-sm mt-3 bg-slate-50/50 px-3 py-2 rounded-xl border border-slate-100">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors shrink-0"
                  [class.bg-emerald-50]="hasUserApiKey"
                  [class.text-emerald-800]="hasUserApiKey"
                  [class.border-emerald-200]="hasUserApiKey"
                  [class.bg-slate-100]="!hasUserApiKey"
                  [class.text-slate-700]="!hasUserApiKey"
                  [class.border-slate-200]="!hasUserApiKey">
              <span class="w-1.5 h-1.5 rounded-full"
                    [class.bg-emerald-500]="hasUserApiKey"
                    [class.animate-pulse]="hasUserApiKey"
                    [class.bg-slate-400]="!hasUserApiKey"></span>
              {{ hasUserApiKey ? 'Đang dùng API Key của bạn' : 'Bạn chưa nhập API Key cho ứng dụng' }}
            </span>
            <a href="https://aistudio.google.com/app/api-keys" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium transition-colors cursor-pointer shrink-0 ml-auto">
              <lucide-icon [img]="ExternalLink" class="w-3.5 h-3.5" aria-hidden="true"></lucide-icon>
              <span>Nơi lấy Gemini API Key</span>
            </a>
          </div>

          <div class="mt-5">
            <label for="gemini-custom-api-key" class="text-xs uppercase text-slate-500 font-bold tracking-wider block mb-2">GEMINI API KEY CÁ NHÂN</label>
            <div class="relative">
              <input 
                id="gemini-custom-api-key"
                [type]="showKeyPlain() ? 'text' : 'password'"
                [(ngModel)]="tempApiKey"
                class="block w-full pl-3 pr-10 py-2.5 border border-slate-300 rounded-xl bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-mono tracking-wide"
                placeholder="Nhập AIzaSy..."
              >
              <button 
                type="button"
                (click)="toggleShowKeyPlain()"
                class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                aria-label="Hiện/Ẩn API Key"
              >
                <lucide-icon [img]="showKeyPlain() ? EyeOff : Eye" class="w-4 h-4"></lucide-icon>
              </button>
            </div>
            <p class="text-[11px] text-slate-500 mt-2.5 italic leading-relaxed">
              Khóa API của bạn được <strong class="text-slate-700 font-semibold">mã hóa phần cứng/trình duyệt bằng chuẩn AES-GCM 256-bit</strong> (<code class="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded text-indigo-600">Web Crypto API</code> + <code class="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded text-indigo-600">IndexedDB</code> với khóa không thể trích xuất <code class="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded text-emerald-700">extractable: false</code>), không lưu dạng văn bản thô trong <code class="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded text-slate-600">LocalStorage</code>.
            </p>
          </div>

          <div class="mt-6 pt-5 border-t border-slate-100">
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs uppercase text-slate-500 font-bold tracking-wider block">THINKING LEVEL (MỨC ĐỘ SUY LUẬN)</label>
              <span class="text-[11px] font-medium text-slate-400">Mặc định: Medium</span>
            </div>
            <p class="text-xs text-slate-500 mb-3 leading-relaxed">
              Áp dụng cho quá trình dịch toàn bộ file PDF và dịch sơ đồ/biểu đồ (không ảnh hưởng đến dịch từ khóa tìm kiếm).
            </p>
            <div class="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shadow-inner" role="radiogroup" aria-label="Thinking level">
              <button 
                type="button"
                role="radio"
                [attr.aria-checked]="tempThinkingLevel() === 'medium'"
                (click)="tempThinkingLevel.set('medium')"
                class="group relative flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
                [class.bg-white]="tempThinkingLevel() === 'medium'"
                [class.text-emerald-600]="tempThinkingLevel() === 'medium'"
                [class.shadow-sm]="tempThinkingLevel() === 'medium'"
                [class.ring-1]="tempThinkingLevel() === 'medium'"
                [class.ring-slate-900/5]="tempThinkingLevel() === 'medium'"
                [class.text-slate-500]="tempThinkingLevel() !== 'medium'"
                [class.hover:text-slate-700]="tempThinkingLevel() !== 'medium'"
                [class.hover:bg-slate-200/50]="tempThinkingLevel() !== 'medium'"
              >
                <lucide-icon [img]="Zap" class="w-3.5 h-3.5"></lucide-icon>
                <span>Medium</span>
              </button>
              <button 
                type="button"
                role="radio"
                [attr.aria-checked]="tempThinkingLevel() === 'high'"
                (click)="tempThinkingLevel.set('high')"
                class="group relative flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
                [class.bg-white]="tempThinkingLevel() === 'high'"
                [class.text-indigo-600]="tempThinkingLevel() === 'high'"
                [class.shadow-sm]="tempThinkingLevel() === 'high'"
                [class.ring-1]="tempThinkingLevel() === 'high'"
                [class.ring-slate-900/5]="tempThinkingLevel() === 'high'"
                [class.text-slate-500]="tempThinkingLevel() !== 'high'"
                [class.hover:text-slate-700]="tempThinkingLevel() !== 'high'"
                [class.hover:bg-slate-200/50]="tempThinkingLevel() !== 'high'"
              >
                <lucide-icon [img]="Brain" class="w-3.5 h-3.5"></lucide-icon>
                <span>High</span>
              </button>
            </div>
            <p class="text-[11px] text-slate-500 mt-2 leading-relaxed">
              @if (tempThinkingLevel() === 'medium') {
                <span class="font-semibold text-emerald-700">Medium:</span> Cân bằng tối ưu giữa tốc độ xử lý, lượng token tiêu thụ và độ chính xác (khuyên dùng cho đa số tài liệu).
              } @else {
                <span class="font-semibold text-indigo-700">High:</span> Suy luận chuyên sâu tối đa cho tài liệu học thuật/toán học có độ khó rất cao (tốn nhiều thời gian và token hơn).
              }
            </p>
          </div>
        </div>
        <div class="p-5 border-t border-slate-100 bg-slate-50/50 flex justify-between gap-3 shrink-0">
          <div>
            @if (hasUserApiKey) {
              <button 
                type="button" 
                (click)="onClearApiKey()" 
                class="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <lucide-icon [img]="Trash2" class="w-4 h-4" aria-hidden="true"></lucide-icon>
                <span>Xóa Key cá nhân</span>
              </button>
            }
          </div>
          <div class="flex gap-3">
            <button (click)="onSaveApiKey()" class="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm shadow-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-pointer">
              Lưu cấu hình
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ApiKeyModalComponent implements OnInit {
  readonly Key = Key;
  readonly XIcon = X;
  readonly ExternalLink = ExternalLink;
  readonly EyeOff = EyeOff;
  readonly Eye = Eye;
  readonly Trash2 = Trash2;
  readonly Zap = Zap;
  readonly Brain = Brain;

  @Input() initialApiKey = '';
  @Input() initialThinkingLevel: ThinkingLevelOption = 'medium';
  @Input() hasUserApiKey = false;
  
  @Output() save = new EventEmitter<{ apiKey: string; thinkingLevel: ThinkingLevelOption }>();
  @Output() clear = new EventEmitter<void>();
  @Output() closeModal = new EventEmitter<void>();

  tempApiKey = '';
  tempThinkingLevel = signal<ThinkingLevelOption>('medium');
  showKeyPlain = signal<boolean>(false);

  ngOnInit() {
    this.tempApiKey = this.initialApiKey;
    this.tempThinkingLevel.set(this.initialThinkingLevel || 'medium');
  }

  toggleShowKeyPlain() {
    this.showKeyPlain.update(v => !v);
  }

  onSaveApiKey() {
    this.save.emit({
      apiKey: this.tempApiKey,
      thinkingLevel: this.tempThinkingLevel()
    });
  }

  onClearApiKey() {
    this.tempApiKey = '';
    this.clear.emit();
  }
}
