import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { LucideAngularModule, Settings, Loader2, Play } from './lucide-icons';
import { TranslationMode } from './app';

@Component({
  selector: 'app-config-section',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bg-white rounded-2xl ring-1 ring-slate-900/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative transition-opacity duration-300"
             [class.opacity-50]="isProcessing" 
             [class.pointer-events-none]="isProcessing">
      <div class="min-h-[60px] px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 rounded-t-2xl">
        <h2 class="text-sm font-semibold text-slate-900 uppercase tracking-wider">2. Phong cách dịch</h2>
        <div class="flex items-center gap-3 ml-auto">
          <div class="relative group">
            <button (click)="openSettings.emit()" class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer flex items-center justify-center">
              <lucide-icon [img]="Settings" class="w-4.5 h-4.5" aria-hidden="true"></lucide-icon>
            </button>
            <div class="absolute bottom-full right-0 mb-2 px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded shadow-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
              Thay đổi phong cách mặc định.
              <div class="absolute top-full right-1.5 border-[5px] border-transparent border-t-slate-800"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="p-6 space-y-5">
        
        <!-- Mode Selection -->
        <div class="space-y-3">
          <fieldset class="space-y-2">
            <legend class="sr-only">Chọn phong cách dịch</legend>
            <label class="flex items-start gap-3 p-3 border rounded-xl transition-colors cursor-pointer hover:bg-slate-50"
                   [class.border-indigo-600]="modeControl.value === 'zero_math'"
                   [class.bg-indigo-50]="modeControl.value === 'zero_math'">
              <input type="radio" name="mode" value="zero_math" [formControl]="modeControl" class="mt-1 text-indigo-600 focus:ring-indigo-600" aria-describedby="desc-zero-math">
              <div>
                <div class="text-sm font-medium text-slate-900">Tài liệu khoa học xã hội</div>
                <div id="desc-zero-math" class="text-xs text-slate-600 mt-0.5">PDF -> HTML (VI). <strong>Không công thức toán. Không đồ thị toán</strong>.</div>
              </div>
            </label>

            <label class="flex items-start gap-3 p-3 border rounded-xl transition-colors cursor-pointer hover:bg-slate-50"
                   [class.border-indigo-600]="modeControl.value === 'zero_svg'"
                   [class.bg-indigo-50]="modeControl.value === 'zero_svg'">
              <input type="radio" name="mode" value="zero_svg" [formControl]="modeControl" class="mt-1 text-indigo-600 focus:ring-indigo-600" aria-describedby="desc-zero-svg">
              <div>
                <div class="text-sm font-medium text-slate-900">Tài liệu khoa học nói chung</div>
                <div id="desc-zero-svg" class="text-xs text-slate-600 mt-0.5">PDF -> HTML (VI). Có công thức toán nhưng không gồm đồ thị toán phức tạp. <strong>Đa phần các tài liệu khoa học nên chọn tùy chọn này</strong>.</div>
              </div>
            </label>

            <label class="flex items-start gap-3 p-3 border rounded-xl transition-colors cursor-pointer hover:bg-slate-50"
                   [class.border-indigo-600]="modeControl.value === 'normal'"
                   [class.bg-indigo-50]="modeControl.value === 'normal'">
              <input type="radio" name="mode" value="normal" [formControl]="modeControl" class="mt-1 text-indigo-600 focus:ring-indigo-600" aria-describedby="desc-normal">
              <div>
                <div class="text-sm font-medium text-slate-900">Tài liệu toán chuyên ngành</div>
                <div id="desc-normal" class="text-xs text-slate-600 mt-0.5">PDF -> HTML (VI). Có công thức toán và cả đồ thị toán.</div>
              </div>
            </label>
          </fieldset>
        </div>

        <!-- Action Button -->
        <button 
          (click)="processFile.emit()"
          [disabled]="!canProcess || hasResultHtml"
          class="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed cursor-pointer text-white rounded-2xl font-medium flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          @if (isProcessing) {
            <lucide-icon [img]="Loader2" class="w-5 h-5 animate-spin" aria-hidden="true"></lucide-icon>
            <span>Đang xử lý...</span>
          } @else {
            <lucide-icon [img]="Play" class="w-5 h-5" aria-hidden="true"></lucide-icon>
            <span>Bắt đầu ngay</span>
          }
        </button>

        @if (isProcessing) {
          <p class="text-center text-sm text-indigo-600 font-medium animate-pulse" aria-live="polite">
            {{ progressMessage }}
          </p>
        }
      </div>
    </section>
  `
})
export class ConfigSectionComponent {
  readonly Settings = Settings;
  readonly Loader2 = Loader2;
  readonly Play = Play;

  @Input() modeControl!: FormControl<TranslationMode>;
  @Input() isProcessing = false;
  @Input() canProcess = false;
  @Input() hasResultHtml = false;
  @Input() progressMessage = '';

  @Output() openSettings = new EventEmitter<void>();
  @Output() processFile = new EventEmitter<void>();
}
