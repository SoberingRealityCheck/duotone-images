// ============================================================================
// Duotone Images — the dishonest part. Vault, DOM, settings.
// ============================================================================
//
// Every image Obsidian shows gets an SVG filter that maps black to one color and white to another.
// Nothing is written to the vault. Original files are never touched.
// Open an image in its own tab to get a panel of controls for that one image.
// Changes show up everywhere the image is used, right away.
//
// How images are found: we watch the page for <img> tags, look each src up against
// the vault's image files, and set `style.filter` on the matches. A hack, but it covers
// reading view, live preview, hover previews and the image tab with one code path.
// An <img> that already had its own inline filter gets overwritten while we're active.
// ============================================================================

import { App, FileView, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, debounce } from 'obsidian';
import {
	Adjust,
	DuotoneConfig,
	buildFilterParams,
	isImageExtension,
	normalizeUrl,
	resolveAdjust,
} from './duotone';
import { FilterHost } from './filters';
import { buildPanel } from './panel';

const DEFAULT_SETTINGS: DuotoneConfig = {
	darkColor: '#12070a',
	lightColor: '#ff6f7d',
	applyToAll: true,
	images: {},
};

export default class DuotonePlugin extends Plugin {
	settings: DuotoneConfig = DEFAULT_SETTINGS;

	private host: FilterHost | null = null;
	private observer: MutationObserver | null = null;
	private scanQueued = false;

	/** Filter id for each image path, at its current look. Deleting an entry makes the next scan rebuild it. */
	private filterIds: Map<string, string> = new Map();
	/** Image URL (without query) -> file. Rebuilt when image files come and go. */
	private urlToFile: Map<string, TFile> | null = null;

	async onload(): Promise<void> {
		const saved = (await this.loadData()) as Partial<DuotoneConfig> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...saved, images: { ...(saved?.images ?? {}) } };

		this.host = new FilterHost();
		this.addSettingTab(new DuotoneSettingTab(this.app, this));

		this.registerEvent(this.app.vault.on('create', (f) => this.onFilesChanged(f)));
		this.registerEvent(this.app.vault.on('delete', (f) => {
			delete this.settings.images[f.path];
			this.filterIds.delete(f.path);
			this.onFilesChanged(f);
			this.saveSoon();
		}));
		this.registerEvent(this.app.vault.on('rename', (f, oldPath) => {
			const moved = this.settings.images[oldPath];
			if (moved) {
				this.settings.images[f.path] = moved;
				delete this.settings.images[oldPath];
				this.saveSoon();
			}
			this.filterIds.delete(oldPath);
			this.onFilesChanged(f);
		}));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.queueScan()));
		this.registerEvent(this.app.workspace.on('layout-change', () => this.queueScan()));

		this.app.workspace.onLayoutReady(() => {
			this.observer = new MutationObserver(() => this.queueScan());
			this.observer.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ['src'], // not 'style', or our own changes would loop
			});
			this.queueScan();
		});
	}

	onunload(): void {
		this.observer?.disconnect();
		this.clearAll();
		this.host?.destroy();
		this.host = null;
	}

	// -----------------------------------------------------------------------
	// Settings
	// -----------------------------------------------------------------------

	private saveSoon = debounce(() => void this.saveData(this.settings), 400, true);

	/** Called by the settings tab when global colors or "recolor all" change. */
	globalChanged(): void {
		this.filterIds.clear();
		this.queueScan();
		this.saveSoon();
	}

	private updateImage(path: string, change: Partial<Adjust>): void {
		this.settings.images[path] = { ...this.settings.images[path], ...change };
		this.filterIds.delete(path);
		this.scan();
		this.saveSoon();
	}

	private resetImage(path: string): void {
		delete this.settings.images[path];
		this.filterIds.delete(path);
		this.scan(true);
		this.saveSoon();
	}

	// -----------------------------------------------------------------------
	// Finding images on the page
	// -----------------------------------------------------------------------

	private onFilesChanged(file: TAbstractFile): void {
		if (file instanceof TFile && isImageExtension(file.extension)) this.urlToFile = null;
		this.queueScan();
	}

	private getUrlMap(): Map<string, TFile> {
		if (!this.urlToFile) {
			this.urlToFile = new Map();
			for (const file of this.app.vault.getFiles()) {
				if (isImageExtension(file.extension)) {
					this.urlToFile.set(normalizeUrl(this.app.vault.getResourcePath(file)), file);
				}
			}
		}
		return this.urlToFile;
	}

	/** Many mutations can fire in one frame. Scan once. */
	private queueScan(): void {
		if (this.scanQueued) return;
		this.scanQueued = true;
		window.requestAnimationFrame(() => {
			this.scanQueued = false;
			this.scan();
		});
	}

	/** Put the right filter on every vault image on the page, and take it off the rest. */
	private scan(rebuildPanels = false): void {
		if (!this.host) return;
		const used = new Set<string>();
		const urls = this.getUrlMap();

		for (const img of Array.from(document.querySelectorAll('img'))) {
			const file = urls.get(normalizeUrl(img.currentSrc || img.src));
			const adjust = file ? resolveAdjust(this.settings, file.path) : null;

			if (!file || !adjust || !adjust.enabled) {
				if (img.dataset.duotone) {
					img.style.removeProperty('filter');
					delete img.dataset.duotone;
				}
				continue;
			}

			let id = this.filterIds.get(file.path);
			if (!id) {
				id = this.host.create(buildFilterParams(adjust));
				this.filterIds.set(file.path, id);
			}
			img.style.filter = `url(#${id})`;
			img.dataset.duotone = '1';
			used.add(id);
		}

		// Keep only filters that something still uses. Old looks go away here.
		this.host.sweep(used);
		for (const [path, id] of this.filterIds) {
			if (!used.has(id)) this.filterIds.delete(path);
		}

		this.ensurePanels(rebuildPanels);
	}

	private clearAll(): void {
		for (const img of Array.from(document.querySelectorAll('img[data-duotone]'))) {
			(img as HTMLImageElement).style.removeProperty('filter');
			delete (img as HTMLImageElement).dataset.duotone;
		}
		for (const panel of Array.from(document.querySelectorAll('.duotone-panel'))) panel.remove();
		for (const host of Array.from(document.querySelectorAll('.duotone-host'))) host.removeClass('duotone-host');
	}

	// -----------------------------------------------------------------------
	// Controls panel on image tabs
	// -----------------------------------------------------------------------

	/** Add a panel to every open image tab, and fix up the ones that show a different image now. */
	private ensurePanels(rebuild: boolean): void {
		for (const leaf of this.app.workspace.getLeavesOfType('image')) {
			const view = leaf.view;
			if (!(view instanceof FileView) || !view.file) continue;

			const path = view.file.path;
			const existing = view.contentEl.querySelector<HTMLElement>(':scope > .duotone-panel');
			if (existing && existing.dataset.path === path && !rebuild) continue;
			existing?.remove();

			// The tab becomes a column: controls bar on top, image fills the rest. See styles.css.
			view.contentEl.addClass('duotone-host');
			buildPanel(view.contentEl, path, {
				get: () => resolveAdjust(this.settings, path),
				set: (change) => this.updateImage(path, change),
				reset: () => this.resetImage(path),
			});
		}
	}
}

class DuotoneSettingTab extends PluginSettingTab {
	plugin: DuotonePlugin;

	constructor(app: App, plugin: DuotonePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('p', {
			text: 'Images are recolored on screen. Files in your vault are never changed. Open an image in its own tab to adjust that one image.',
			cls: 'setting-item-description',
		});

		// Shows the two colors as a ramp, so you can see what greys will turn into.
		const preview = containerEl.createDiv({ cls: 'duotone-ramp-preview' });
		const updatePreview = () => {
			preview.style.background = `linear-gradient(to right, ${this.plugin.settings.darkColor}, ${this.plugin.settings.lightColor})`;
		};
		updatePreview();

		new Setting(containerEl)
			.setName('Recolor all images')
			.setDesc('Off means only images you turn on in their own tab are recolored.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.applyToAll).onChange((value) => {
					this.plugin.settings.applyToAll = value;
					this.plugin.globalChanged();
				}),
			);

		new Setting(containerEl)
			.setName('Black becomes')
			.setDesc('Default color for the darkest pixels.')
			.addColorPicker((picker) =>
				picker.setValue(this.plugin.settings.darkColor).onChange((value) => {
					this.plugin.settings.darkColor = value;
					updatePreview();
					this.plugin.globalChanged();
				}),
			);

		new Setting(containerEl)
			.setName('White becomes')
			.setDesc('Default color for the lightest pixels.')
			.addColorPicker((picker) =>
				picker.setValue(this.plugin.settings.lightColor).onChange((value) => {
					this.plugin.settings.lightColor = value;
					updatePreview();
					this.plugin.globalChanged();
				}),
			);
	}
}
