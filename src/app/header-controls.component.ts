import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, FileText, Key } from './lucide-icons';
import { SearchBarComponent } from './search-bar.component';

@Component({
  selector: 'app-header-controls',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, SearchBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bg-white border-b border-slate-200 relative z-40">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-0 lg:h-16 flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap items-center sm:justify-center lg:justify-between gap-3 sm:gap-4 lg:gap-0">
        
        <!-- Left side: Logo + API Key -->
        <div class="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 w-full lg:w-auto">
          
          <!-- Logo and Title -->
          <div class="flex items-center gap-2">
            <div 
              (click)="onLogoClick()"
              (keydown.enter)="onLogoClick()"
              (keydown.space)="onLogoClick(); $event.preventDefault()"
              [attr.role]="!isProcessing ? 'button' : null"
              [attr.tabindex]="!isProcessing ? 0 : -1"
              [attr.aria-disabled]="isProcessing ? 'true' : null"
              [title]="isProcessing ? 'Đang trong tiến trình xử lý, không thể làm mới' : 'Về trang chính / Tải tài liệu mới'"
              class="bg-indigo-600 text-white p-1.5 rounded-lg shrink-0 shadow-sm transition-all select-none flex items-center justify-center"
              [class.cursor-pointer]="!isProcessing"
              [class.hover:bg-indigo-700]="!isProcessing"
              [class.hover:scale-105]="!isProcessing"
              [class.active:scale-95]="!isProcessing"
              [class.cursor-not-allowed]="isProcessing"
              [class.opacity-60]="isProcessing"
            >
              <lucide-icon [img]="FileText" class="w-5 h-5" aria-hidden="true"></lucide-icon>
            </div>
            <div class="block">
              <h1 
                (click)="onLogoClick()"
                (keydown.enter)="onLogoClick()"
                (keydown.space)="onLogoClick(); $event.preventDefault()"
                [attr.role]="!isProcessing ? 'button' : null"
                [attr.tabindex]="!isProcessing ? 0 : -1"
                [attr.aria-disabled]="isProcessing ? 'true' : null"
                [title]="isProcessing ? 'Đang trong tiến trình xử lý, không thể làm mới' : 'Về trang chính / Tải tài liệu mới'"
                class="text-lg sm:text-xl font-bold font-display tracking-tight text-slate-900 leading-tight transition-colors select-none"
                [class.cursor-pointer]="!isProcessing"
                [class.hover:text-indigo-600]="!isProcessing"
                [class.cursor-not-allowed]="isProcessing"
                [class.opacity-60]="isProcessing"
              >
                PDF dragonTranslator
              </h1>
              <button 
                type="button"
                [disabled]="isProcessing"
                (click)="onOpenApiKeyModal()"
                title="{{ isProcessing ? 'Không thể cấu hình khi đang xử lý' : (hasUserApiKey ? 'Sửa API Key của bạn' : 'Cấu hình API Key của bạn') }}"
                class="flex items-center gap-1.5 text-[11px] font-medium mt-0.5 transition-colors focus:outline-none text-left"
                [class.cursor-not-allowed]="isProcessing"
                [class.cursor-pointer]="!isProcessing"
                [class.text-emerald-600]="hasUserApiKey"
                [class.hover:text-emerald-700]="hasUserApiKey"
                [class.text-slate-400]="!hasUserApiKey && isProcessing"
                [class.text-slate-500]="!hasUserApiKey && !isProcessing"
                [class.hover:text-indigo-600]="!hasUserApiKey && !isProcessing"
              >
                <lucide-icon 
                  [img]="Key" 
                  class="w-3 h-3 shrink-0 transition-transform duration-200 origin-center -translate-y-[1px]"
                  [class.rotate-[15deg]]="hasUserApiKey"
                  [class.rotate-[75deg]]="!hasUserApiKey"
                ></lucide-icon>
                <span class="sm:hidden">{{ hasUserApiKey ? 'Đang dùng key của bạn' : 'Nhập API Key' }}</span>
                <span class="hidden sm:inline">{{ hasUserApiKey ? 'Đang dùng key của bạn' : 'Nhập (cấu hình) API Key' }}</span>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Search Bar -->
        <div class="w-full lg:w-auto flex justify-center lg:justify-end mt-2 lg:mt-0">
          <app-search-bar [isProcessing]="isProcessing" class="w-full lg:w-auto"></app-search-bar>
        </div>
      </div>
    </header>
  `
})
export class HeaderControlsComponent {
  readonly FileText = FileText;
  readonly Key = Key;

  @Input() isProcessing = false;
  @Input() hasUserApiKey = false;
  
  @Output() openApiKeyModal = new EventEmitter<void>();
  @Output() logoClick = new EventEmitter<void>();

  onLogoClick() {
    if (this.isProcessing) return;
    this.logoClick.emit();
  }

  onOpenApiKeyModal() {
    this.openApiKeyModal.emit();
  }
}
