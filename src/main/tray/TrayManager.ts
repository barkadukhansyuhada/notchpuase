import { Menu, Tray, nativeImage } from 'electron';

interface TrayCallbacks {
  onToggleOverlay: () => void;
  onRefreshSchedule: () => void;
  onOpenSettings: () => void;
  onQuit: () => void;
}

export class TrayManager {
  private tray: Tray | null = null;
  private overlayEnabled = true;

  constructor(private readonly callbacks: TrayCallbacks) {}

  public create(): void {
    if (this.tray) {
      return;
    }

    const icon = this.createTrayIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('PuasaNotch');
    this.tray.on('double-click', () => this.callbacks.onToggleOverlay());
    this.refreshMenu();
  }

  public setOverlayEnabled(enabled: boolean): void {
    this.overlayEnabled = enabled;
    this.refreshMenu();
  }

  public destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private refreshMenu(): void {
    if (!this.tray) {
      return;
    }

    const menu = Menu.buildFromTemplate([
      {
        label: this.overlayEnabled ? 'Hide Overlay' : 'Show Overlay',
        click: () => this.callbacks.onToggleOverlay(),
      },
      {
        label: 'Refresh Schedule',
        click: () => this.callbacks.onRefreshSchedule(),
      },
      {
        label: 'Open Settings',
        click: () => this.callbacks.onOpenSettings(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => this.callbacks.onQuit(),
      },
    ]);

    this.tray.setContextMenu(menu);
  }

  private createTrayIcon() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="3" width="16" height="12" rx="6" fill="black"/>
        <rect x="5" y="8" width="8" height="2" rx="1" fill="white"/>
      </svg>
    `.trim();

    const image = nativeImage.createFromDataURL(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    );
    image.setTemplateImage(true);
    return image;
  }
}
