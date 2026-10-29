import { Component, ChangeDetectionStrategy, signal, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormControl } from '@angular/forms';
import { LucideAngularModule, UploadCloud, FileText, Settings, Play, Download, CheckCircle2, AlertCircle, Loader2, ArrowDown, RefreshCw, Maximize, Minimize, Clock, Info, X, Search, ExternalLink, Scissors, FileEdit, User, Copy, Key, Eye, EyeOff, Trash2, LayoutGrid } from 'lucide-angular';
import { SettingsModalComponent } from './settings-modal.component';
import { ApiKeyModalComponent } from './api-key-modal.component';
import { ToastsComponent } from './toasts.component';
import { HeaderControlsComponent } from './header-controls.component';
import { UploadZoneComponent } from './upload-zone.component';
import { ConfigSectionComponent } from './config-section.component';
import { ResultSectionComponent } from './result-section.component';
import { HistoryModalComponent } from './history-modal.component';
import { AppsModalComponent } from './apps-modal.component';
import { ToastService } from './toast.service';
import { TranslationState } from './translation.state';
import { TranslatedDoc } from './storage.service';
import { TranslationMode, SearchModel, ThinkingLevelOption } from './translation.state';
export type { TranslationMode } from './translation.state';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, LucideAngularModule, SettingsModalComponent, ApiKeyModalComponent, ToastsComponent, HeaderControlsComponent, UploadZoneComponent, ConfigSectionComponent, ResultSectionComponent, HistoryModalComponent, AppsModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private destroyRef = inject(DestroyRef);
  private toastService = inject(ToastService);
  private translationState = inject(TranslationState);

  // Icons
  readonly UploadCloud = UploadCloud;
  readonly FileText = FileText;
  readonly Settings = Settings;
  readonly Play = Play;
  readonly Download = Download;
  readonly CheckCircle2 = CheckCircle2;
  readonly AlertCircle = AlertCircle;
  readonly Loader2 = Loader2;
  readonly ArrowDown = ArrowDown;
  readonly RefreshCw = RefreshCw;
  readonly Maximize = Maximize;
  readonly Minimize = Minimize;
  readonly Clock = Clock;
  readonly Info = Info;
  readonly X = X;
  readonly Search = Search;
  readonly ExternalLink = ExternalLink;
  readonly Scissors = Scissors;
  readonly FileEdit = FileEdit;
  readonly User = User;
  readonly Copy = Copy;
  readonly Key = Key;
  readonly Eye = Eye;
  readonly EyeOff = EyeOff;
  readonly Trash2 = Trash2;
  readonly LayoutGrid = LayoutGrid;

  // Form Controls
  modeControl = new FormControl<TranslationMode>('zero_svg', { nonNullable: true });
  defaultModeControl = new FormControl<TranslationMode>('zero_svg', { nonNullable: true });
  defaultSearchModelControl = new FormControl<SearchModel>('gemini-flash-lite-latest', { nonNullable: true });
  useGoogleSearchControl = new FormControl<boolean>(false, { nonNullable: true });
  
  // UI States
  showSettingsModal = signal<boolean>(false);
  showApiKeyModal = signal<boolean>(false);
  tempApiKey = signal<string>('');
  tempThinkingLevel = signal<ThinkingLevelOption>('medium');
  showKeyPlain = signal<boolean>(false);
  showHistoryModal = signal<boolean>(false);
  showAppsModal = signal<boolean>(false);
  isFullscreen = signal<boolean>(false);

  // Expose store state to view
  selectedModel = this.translationState.selectedModel;
  selectedFile = this.translationState.selectedFile;
  hasFile = this.translationState.hasFile;
  hasOriginalFile = this.translationState.hasOriginalFile;
  isLoadedFromHistory = this.translationState.isLoadedFromHistory;
  resultHtml = this.translationState.resultHtml;
  pdfTotalPages = this.translationState.pdfTotalPages;
  pdfStartPage = this.translationState.pdfStartPage;
  pdfEndPage = this.translationState.pdfEndPage;
  tokenCount = this.translationState.tokenCount;
  isCountingTokens = this.translationState.isCountingTokens;
  currentMaxTokens = this.translationState.currentMaxTokens;
  tokenPercentage = this.translationState.tokenPercentage;
  error = this.translationState.error;
  isProcessing = this.translationState.isProcessing;
  isBusy = this.translationState.isBusy;
  progressMessage = this.translationState.progressMessage;
  formattedTime = this.translationState.formattedTime;
  userApiKey = this.translationState.userApiKey;
  historyItems = this.translationState.historyItems;
  activeHistoryItemId = this.translationState.activeHistoryItemId;
  mode = this.translationState.mode;
  useGoogleSearch = this.translationState.useGoogleSearch;
  canProcess = this.translationState.canProcess;

  private cropTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.toastService.clearAll();
      this.translationState.cancelTimer();
      if (this.cropTimeout) clearTimeout(this.cropTimeout);
    });

    this.modeControl.valueChanges.subscribe(val => {
      this.translationState.mode.set(val);
    });
    this.useGoogleSearchControl.valueChanges.subscribe(val => this.translationState.useGoogleSearch.set(val));

    // Handle initial mode load
    if (typeof localStorage !== 'undefined') {
      const savedMode = localStorage.getItem('sila_pdf_translator_default_mode');
      if (savedMode === 'zero_math' || savedMode === 'zero_svg' || savedMode === 'normal') {
        this.modeControl.setValue(savedMode);
        this.translationState.mode.set(savedMode);
      }
      
      const savedSearchModel = localStorage.getItem('sila_pdf_translator_search_model') as SearchModel;
      if (savedSearchModel) {
        this.translationState.searchModel.set(savedSearchModel);
      }

      // Load saved user API Key
      const savedKey = localStorage.getItem('sila_pdf_translator_user_api_key');
      if (savedKey) {
        this.translationState.userApiKey.set(savedKey);
      }

      // Load saved Thinking Level
      const savedThinking = localStorage.getItem('sila_pdf_translator_thinking_level');
      if (savedThinking === 'medium' || savedThinking === 'high') {
        this.translationState.thinkingLevel.set(savedThinking);
      }
    }
  }

  showToast(type: 'error' | 'info' | 'success', message: string) {
    this.toastService.show(type, message);
  }

  openSettings() {
    let savedMode: string | null = null;
    let savedSearchModel: SearchModel | null = null;
    if (typeof localStorage !== 'undefined') {
      savedMode = localStorage.getItem('sila_pdf_translator_default_mode');
      savedSearchModel = localStorage.getItem('sila_pdf_translator_search_model') as SearchModel;
    }
    const validSavedMode: TranslationMode = (savedMode === 'zero_math' || savedMode === 'zero_svg' || savedMode === 'normal') ? savedMode : 'zero_svg';
    this.defaultModeControl.setValue(validSavedMode);
    this.defaultSearchModelControl.setValue(savedSearchModel || 'gemini-flash-lite-latest');
    this.showSettingsModal.set(true);
  }

  closeSettings() {
    this.showSettingsModal.set(false);
  }

  onSettingsSave(settings: {mode: TranslationMode, searchModel: SearchModel}) {
    if (settings) {
      this.defaultModeControl.setValue(settings.mode);
      this.defaultSearchModelControl.setValue(settings.searchModel);
    }
    this.saveSettings();
  }
  saveSettings() {
    const selectedDefaultMode = this.defaultModeControl.value;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sila_pdf_translator_default_mode', selectedDefaultMode);
      localStorage.setItem('sila_pdf_translator_search_model', this.defaultSearchModelControl.value);
    }
    this.modeControl.setValue(selectedDefaultMode);
    this.translationState.searchModel.set(this.defaultSearchModelControl.value);
    this.showSettingsModal.set(false);
    this.showToast('success', 'Đã lưu cấu hình mặc định!');
  }

  openApiKeyModal() {
    if (this.isBusy()) return;
    if (typeof localStorage !== 'undefined') {
      const savedKey = localStorage.getItem('sila_pdf_translator_user_api_key') || '';
      this.tempApiKey.set(savedKey);
      const savedThinking = localStorage.getItem('sila_pdf_translator_thinking_level');
      this.tempThinkingLevel.set((savedThinking === 'medium' || savedThinking === 'high') ? savedThinking : this.translationState.thinkingLevel());
    } else {
      this.tempApiKey.set('');
      this.tempThinkingLevel.set(this.translationState.thinkingLevel());
    }
    this.showKeyPlain.set(false);
    this.showApiKeyModal.set(true);
  }

  closeApiKeyModal() {
    this.showApiKeyModal.set(false);
  }

  saveApiKey(config?: { apiKey: string; thinkingLevel: ThinkingLevelOption }) {
    if (config) {
      this.tempApiKey.set(config.apiKey);
      this.tempThinkingLevel.set(config.thinkingLevel);
    }
    const keyVal = this.tempApiKey().trim();
    const thinkingVal = this.tempThinkingLevel();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sila_pdf_translator_user_api_key', keyVal);
      localStorage.setItem('sila_pdf_translator_thinking_level', thinkingVal);
    }
    this.translationState.userApiKey.set(keyVal);
    this.translationState.thinkingLevel.set(thinkingVal);
    this.showApiKeyModal.set(false);
    if (keyVal) {
      this.showToast('success', 'Đã lưu cấu hình API Key và Thinking level!');
    } else {
      this.showToast('info', 'Đã lưu Thinking level (bạn chưa nhập API Key).');
    }
  }

  clearApiKey() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('sila_pdf_translator_user_api_key');
    }
    this.translationState.userApiKey.set('');
    this.tempApiKey.set('');
    this.showApiKeyModal.set(false);
    this.showToast('info', 'Đã xóa cấu hình API Key. Hãy cấu hình lại để tiếp tục sử dụng.');
  }

  toggleShowKeyPlain() {
    this.showKeyPlain.update(v => !v);
  }

  onFileSelected(file: File) {
    this.translationState.isLoadedFromHistory.set(false);
    if (file.type === 'application/pdf') {
       this.translationState.handlePdfFile(file);
    } else {
       this.showToast('error', 'Vui lòng tải lên tệp PDF.');
    }
  }

  onPageChange() {
    if (this.cropTimeout) clearTimeout(this.cropTimeout);
    this.cropTimeout = setTimeout(() => {
      this.translationState.processPdfCrop();
    }, 500);
  }

  processFile() {
    this.translationState.processFile();
  }

  downloadOriginalFile() {
    this.translationState.downloadOriginalFile();
  }

  resetToHome() {
    if (this.isBusy()) return;
    this.translationState.resetSession();
    this.isFullscreen.set(false);
    let defaultMode: TranslationMode = this.defaultModeControl.value || 'zero_svg';
    if (typeof localStorage !== 'undefined') {
      const savedMode = localStorage.getItem('sila_pdf_translator_default_mode');
      if (savedMode === 'zero_math' || savedMode === 'zero_svg' || savedMode === 'normal') {
        defaultMode = savedMode;
      }
    }
    this.modeControl.setValue(defaultMode);
    this.showToast('info', 'Đã quay về màn hình chính.');
  }

  downloadHtml() {
    const htmlText = this.resultHtml();
    if (htmlText) {
      const blob = new Blob([htmlText], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const file = this.selectedFile();
      
      const baseName = file?.name.replace(/\.[^/.]+$/, "") || 'document';

      a.download = `${baseName}_Translated.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showToast('success', 'Đã tải bản dịch xuống máy. Định dạng HTML (web), có thể mở bằng bất cứ trình duyệt nào.');
    }
  }

  async openHistory() {
    await this.translationState.fetchHistory();
    this.showHistoryModal.set(true);
  }

  closeHistory() {
    this.showHistoryModal.set(false);
  }

  openApps() {
    this.showAppsModal.set(true);
  }

  closeApps() {
    this.showAppsModal.set(false);
  }

  deleteHistoryItem(id: number) {
    this.translationState.deleteHistoryItem(id);
  }

  selectHistoryItem(doc: TranslatedDoc) {
    this.translationState.restoreFromHistory(doc);
    this.modeControl.setValue(this.translationState.mode());
    this.showHistoryModal.set(false);
    this.showToast('success', 'Đã khôi phục thành công bản dịch từ lịch sử dịch!');
  }
}
