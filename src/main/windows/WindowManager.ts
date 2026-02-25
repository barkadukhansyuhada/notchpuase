import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { REMINDER_RESIZE_DURATION_MS } from '../../shared/overlayLayout';
import type { OverlayDisplayMetrics, OverlaySettings, OverlayState } from '../../shared/types';
import {
  EXPANDED_FALLBACK_HEIGHT,
  normalizeExpandedMeasuredHeight,
  shouldApplyExpandedMeasuredHeight,
} from './overlaySizing';

const EXPANDED_SIZE = { width: 320, height: EXPANDED_FALLBACK_HEIGHT };
const OVERLAY_ANIMATION_DURATION_MS = 220;
const OVERLAY_ANIMATION_INTERVAL_MS = 1000 / 60;
const NOTCH_MENU_BAR_THRESHOLD_PX = 32;

interface WindowManagerOptions {
  preloadPath: string;
  overlayUrl: string;
  settingsUrl: string;
  initialOverlaySettings: OverlaySettings;
}

export class WindowManager {
  private readonly preloadPath: string;
  private readonly overlayUrl: string;
  private readonly settingsUrl: string;
  private overlaySettings: OverlaySettings;

  private overlayWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private overlayState: OverlayState = 'hidden';

  private stateListeners = new Set<(state: OverlayState) => void>();
  private followMouseInterval: NodeJS.Timeout | null = null;
  private boundsAnimationInterval: NodeJS.Timeout | null = null;
  private isBoundsAnimating = false;
  private expandedMeasuredHeight: number | null = null;
  private currentDisplayId: number | null = null;
  private reminderPromptActive = false;

  constructor(options: WindowManagerOptions) {
    this.preloadPath = options.preloadPath;
    this.overlayUrl = options.overlayUrl;
    this.settingsUrl = options.settingsUrl;
    this.overlaySettings = options.initialOverlaySettings;

    screen.on('display-added', () => this.repositionOverlay());
    screen.on('display-removed', () => this.repositionOverlay());
    screen.on('display-metrics-changed', () => this.repositionOverlay());
  }

  public createOverlayWindow(): BrowserWindow {
    if (this.overlayWindow) {
      return this.overlayWindow;
    }

    this.overlayWindow = new BrowserWindow({
      width: this.overlaySettings.collapsedWidth,
      height: this.overlaySettings.collapsedHeight,
      frame: false,
      transparent: true,
      resizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      hasShadow: false,
      alwaysOnTop: true,
      focusable: true,
      movable: false,
      roundedCorners: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.overlayWindow.setFullScreenable(false);
    this.overlayWindow.setHasShadow(false);
    this.overlayWindow.setWindowButtonVisibility(false);
    this.overlayWindow.setHiddenInMissionControl(true);
    this.overlayWindow.setContentProtection(true);

    this.overlayWindow.on('blur', () => {
      if (this.overlayState === 'expanded') {
        this.setOverlayState('collapsed');
      }
    });

    this.overlayWindow.on('closed', () => {
      this.stopBoundsAnimation();
      this.overlayWindow = null;
    });

    this.overlayWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    this.loadIntoWindow(this.overlayWindow, this.overlayUrl);
    this.updateFollowMouseLoop();

    return this.overlayWindow;
  }

  public createSettingsWindow(): BrowserWindow {
    if (this.settingsWindow) {
      return this.settingsWindow;
    }

    this.settingsWindow = new BrowserWindow({
      width: 500,
      height: 720,
      show: false,
      resizable: false,
      title: 'PuasaNotch Settings',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.settingsWindow.on('close', (event) => {
      event.preventDefault();
      this.settingsWindow?.hide();
    });
    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
    });

    this.loadIntoWindow(this.settingsWindow, this.settingsUrl);
    return this.settingsWindow;
  }

  public openSettingsWindow(): void {
    const window = this.createSettingsWindow();
    window.show();
    window.focus();
  }

  public getOverlayState(): OverlayState {
    return this.overlayState;
  }

  public getOverlaySettings(): OverlaySettings {
    return {
      ...this.overlaySettings,
    };
  }

  public hasOverlayWindow(): boolean {
    return this.overlayWindow !== null;
  }

  public getOverlayDisplayMetrics(): OverlayDisplayMetrics {
    const display = this.chooseDisplay();
    this.currentDisplayId = display.id;

    const menuBarHeightPx = Math.max(0, display.workArea.y - display.bounds.y);
    const isLikelyNotched = menuBarHeightPx >= NOTCH_MENU_BAR_THRESHOLD_PX;

    return {
      displayId: display.id,
      menuBarHeightPx: Math.round(menuBarHeightPx),
      safeTopInsetPx: Math.round(isLikelyNotched ? menuBarHeightPx : 0),
      isLikelyNotched,
    };
  }

  public setOverlaySettings(settings: OverlaySettings): void {
    this.overlaySettings = settings;
    this.updateFollowMouseLoop();

    if (this.overlayState !== 'hidden') {
      this.repositionOverlay();
    }
  }

  public onOverlayStateChanged(listener: (state: OverlayState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public toggleOverlayVisibility(): void {
    if (this.overlayState === 'hidden') {
      this.setOverlayState('collapsed');
      return;
    }

    this.setOverlayState('hidden');
  }

  public toggleOverlayExpanded(): void {
    if (this.overlayState === 'hidden') {
      this.setOverlayState('collapsed');
      return;
    }

    this.setOverlayState(this.overlayState === 'expanded' ? 'collapsed' : 'expanded');
  }

  public collapseOverlay(): void {
    if (this.overlayState === 'expanded') {
      this.setOverlayState('collapsed');
    }
  }

  public setExpandedMeasuredHeight(height: number): void {
    const nextHeight = normalizeExpandedMeasuredHeight(height);
    if (!shouldApplyExpandedMeasuredHeight(this.expandedMeasuredHeight, nextHeight)) {
      return;
    }

    this.expandedMeasuredHeight = nextHeight;

    if (!this.overlayWindow || this.overlayState !== 'expanded' || this.isBoundsAnimating) {
      return;
    }

    this.overlayWindow.setBounds(this.getTargetBoundsForState('expanded'), false);
    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  }

  public setReminderPromptActive(active: boolean): void {
    if (this.reminderPromptActive === active) {
      return;
    }

    this.reminderPromptActive = active;
    if (!this.overlayWindow || this.overlayState !== 'collapsed') {
      return;
    }

    const targetBounds = this.getTargetBoundsForState('collapsed');

    if (!this.overlayWindow.isVisible()) {
      this.overlayWindow.setBounds(targetBounds, false);
      this.overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      return;
    }

    this.animateOverlayBoundsTo(
      targetBounds,
      () => {
        this.overlayWindow?.setBounds(targetBounds, false);
        this.overlayWindow?.setAlwaysOnTop(true, 'screen-saver', 1);
      },
      REMINDER_RESIZE_DURATION_MS,
    );
  }

  public setOverlayState(nextState: OverlayState): void {
    this.createOverlayWindow();
    if (!this.overlayWindow) {
      return;
    }

    const previousState = this.overlayState;
    this.overlayState = nextState;

    if (nextState === 'hidden') {
      this.stopBoundsAnimation();
      this.overlayWindow.hide();
      this.emitState();
      this.updateFollowMouseLoop();
      return;
    }

    const targetBounds = this.getTargetBoundsForState(nextState);

    if (!this.overlayWindow.isVisible()) {
      this.overlayWindow.showInactive();
    }

    const shouldAnimateBounds =
      (previousState === 'collapsed' && nextState === 'expanded') ||
      (previousState === 'expanded' && nextState === 'collapsed');

    if (shouldAnimateBounds) {
      this.animateOverlayBoundsTo(targetBounds, () => {
        if (nextState === 'expanded') {
          this.overlayWindow?.setBounds(this.getTargetBoundsForState('expanded'), false);
        }
        if (nextState === 'expanded') {
          this.overlayWindow?.focus();
        }
      });
    } else {
      this.stopBoundsAnimation();
      this.overlayWindow.setBounds(targetBounds, false);
      if (nextState === 'expanded') {
        this.overlayWindow.focus();
      }
    }

    this.emitState();
    this.updateFollowMouseLoop();
  }

  public repositionOverlay(displayId?: number): void {
    if (!this.overlayWindow || this.overlayState === 'hidden' || this.isBoundsAnimating) {
      return;
    }

    this.overlayWindow.setBounds(this.getTargetBoundsForState(this.overlayState, displayId), false);
    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  }

  public sendToOverlay(channel: string, payload: unknown): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) {
      return;
    }

    this.overlayWindow.webContents.send(channel, payload);
  }

  public destroy(): void {
    this.stopBoundsAnimation();

    if (this.followMouseInterval) {
      clearInterval(this.followMouseInterval);
      this.followMouseInterval = null;
    }

    this.overlayWindow?.destroy();
    this.settingsWindow?.destroy();
  }

  private chooseDisplay(displayId?: number) {
    if (displayId !== undefined) {
      const explicit = screen.getAllDisplays().find((display) => display.id === displayId);
      if (explicit) {
        return explicit;
      }
    }

    if (this.overlaySettings.followMouseDisplay || this.currentDisplayId === null) {
      return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    }

    const remembered = screen.getAllDisplays().find((display) => display.id === this.currentDisplayId);
    return remembered ?? screen.getPrimaryDisplay();
  }

  private updateFollowMouseLoop(): void {
    const shouldTrackMouse = this.overlaySettings.followMouseDisplay && this.overlayState !== 'hidden';

    if (!shouldTrackMouse) {
      if (this.followMouseInterval) {
        clearInterval(this.followMouseInterval);
        this.followMouseInterval = null;
      }
      return;
    }

    if (this.followMouseInterval) {
      return;
    }

    this.followMouseInterval = setInterval(() => {
      this.repositionOverlay();
    }, 750);
  }

  private getSizeForState(state: OverlayState): { width: number; height: number } {
    if (state === 'collapsed' && this.reminderPromptActive) {
      return {
        width: this.overlaySettings.collapsedReminderWidth,
        height: this.overlaySettings.collapsedHeight,
      };
    }

    if (state === 'expanded') {
      return {
        width: EXPANDED_SIZE.width,
        height: this.expandedMeasuredHeight ?? EXPANDED_FALLBACK_HEIGHT,
      };
    }

    return {
      width: this.overlaySettings.collapsedWidth,
      height: this.overlaySettings.collapsedHeight,
    };
  }

  private getTargetBoundsForState(state: OverlayState, displayId?: number) {
    const display = this.chooseDisplay(displayId);
    this.currentDisplayId = display.id;
    const size = this.getSizeForState(state);
    const menuBarHeight = Math.max(0, display.workArea.y - display.bounds.y);
    const isLikelyNotchedDisplay = menuBarHeight >= NOTCH_MENU_BAR_THRESHOLD_PX;
    const baselineY = isLikelyNotchedDisplay ? display.bounds.y : display.workArea.y;
    const minY = display.bounds.y;
    const anchoredY = baselineY + this.overlaySettings.yOffset;
    const clampedY = Math.max(minY, anchoredY);

    return {
      x: Math.round(display.bounds.x + (display.bounds.width - size.width) / 2),
      y: Math.round(clampedY),
      width: size.width,
      height: size.height,
    };
  }

  private animateOverlayBoundsTo(
    targetBounds: { x: number; y: number; width: number; height: number },
    onComplete: () => void,
    durationMs: number = OVERLAY_ANIMATION_DURATION_MS,
  ): void {
    if (!this.overlayWindow) {
      onComplete();
      return;
    }

    const startBounds = this.overlayWindow.getBounds();
    const steps = Math.max(1, Math.round(durationMs / OVERLAY_ANIMATION_INTERVAL_MS));
    let step = 0;

    this.stopBoundsAnimation();
    this.isBoundsAnimating = true;

    this.boundsAnimationInterval = setInterval(() => {
      if (!this.overlayWindow || this.overlayWindow.isDestroyed()) {
        this.stopBoundsAnimation();
        onComplete();
        return;
      }

      step += 1;
      const t = Math.min(1, step / steps);
      const eased = 1 - Math.pow(1 - t, 3);

      const nextBounds = {
        x: Math.round(this.lerp(startBounds.x, targetBounds.x, eased)),
        y: Math.round(this.lerp(startBounds.y, targetBounds.y, eased)),
        width: Math.round(this.lerp(startBounds.width, targetBounds.width, eased)),
        height: Math.round(this.lerp(startBounds.height, targetBounds.height, eased)),
      };

      this.overlayWindow.setBounds(nextBounds, false);

      if (t >= 1) {
        this.stopBoundsAnimation();
        this.overlayWindow.setBounds(targetBounds, false);
        onComplete();
      }
    }, Math.round(OVERLAY_ANIMATION_INTERVAL_MS));
  }

  private stopBoundsAnimation(): void {
    if (this.boundsAnimationInterval) {
      clearInterval(this.boundsAnimationInterval);
      this.boundsAnimationInterval = null;
    }
    this.isBoundsAnimating = false;
  }

  private lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
  }

  private loadIntoWindow(window: BrowserWindow, target: string): void {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      void window.loadURL(target);
      return;
    }

    void window.loadFile(path.resolve(target));
  }

  private emitState(): void {
    for (const listener of this.stateListeners) {
      listener(this.overlayState);
    }
  }
}
