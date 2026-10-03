// ============================================================================
// Controls panel shown on top of an image when you open it in its own tab.
// ============================================================================

import { Adjust } from './duotone';

export interface PanelHandlers {
	/** Current values for this image, with defaults filled in. */
	get: () => Required<Adjust>;
	/** Change some values. Updates every place the image is shown. */
	set: (change: Partial<Adjust>) => void;
	/** Throw away this image's changes. */
	reset: () => void;
}

const SLIDERS: { key: 'exposure' | 'contrast' | 'balance' | 'mix'; label: string; min: number; max: number; step: number; hint: string }[] = [
	{ key: 'exposure', label: 'Exposure', min: -1, max: 1, step: 0.01, hint: 'Darker / brighter' },
	{ key: 'contrast', label: 'Contrast', min: 0, max: 3, step: 0.05, hint: 'Flatter / harsher' },
	{ key: 'balance', label: 'Balance', min: -2, max: 2, step: 0.05, hint: 'More dark color / more light color' },
	{ key: 'mix', label: 'Color mix', min: 0, max: 1, step: 0.01, hint: 'Original / full duotone' },
];

export function buildPanel(parent: HTMLElement, path: string, handlers: PanelHandlers): HTMLElement {
	const current = handlers.get();

	const panel = parent.createDiv({ cls: 'duotone-panel' });
	panel.dataset.path = path;
	// Clicks and scrolls here shouldn't pan or zoom the image behind.
	for (const type of ['mousedown', 'wheel', 'dblclick']) {
		panel.addEventListener(type, (e) => e.stopPropagation());
	}

	const header = panel.createDiv({ cls: 'duotone-panel-header' });
	header.createSpan({ text: 'Duotone' });
	const collapse = header.createEl('button', { text: '–', cls: 'duotone-panel-collapse' });
	collapse.addEventListener('click', () => {
		const collapsed = panel.classList.toggle('is-collapsed');
		collapse.setText(collapsed ? '+' : '–');
	});

	const body = panel.createDiv({ cls: 'duotone-panel-body' });

	// Recolor on/off
	const enabledRow = body.createEl('label', { cls: 'duotone-row duotone-row-check' });
	const enabled = enabledRow.createEl('input', { type: 'checkbox' });
	enabled.checked = current.enabled;
	enabledRow.createSpan({ text: 'Recolor this image' });
	enabled.addEventListener('change', () => handlers.set({ enabled: enabled.checked }));

	// Sliders
	for (const def of SLIDERS) {
		const row = body.createDiv({ cls: 'duotone-row' });
		const top = row.createDiv({ cls: 'duotone-row-top' });
		top.createSpan({ text: def.label });
		const readout = top.createSpan({ cls: 'duotone-readout', text: current[def.key].toFixed(2) });

		const slider = row.createEl('input', { type: 'range' });
		slider.min = String(def.min);
		slider.max = String(def.max);
		slider.step = String(def.step);
		slider.value = String(current[def.key]);
		slider.title = def.hint;
		slider.addEventListener('input', () => {
			const value = parseFloat(slider.value);
			readout.setText(value.toFixed(2));
			handlers.set({ [def.key]: value });
		});
		row.createDiv({ cls: 'duotone-hint', text: def.hint });
	}

	// Invert
	const invertRow = body.createEl('label', { cls: 'duotone-row duotone-row-check' });
	const invert = invertRow.createEl('input', { type: 'checkbox' });
	invert.checked = current.invert;
	invertRow.createSpan({ text: 'Invert' });
	invert.addEventListener('change', () => handlers.set({ invert: invert.checked }));

	// Colors
	const colors = body.createDiv({ cls: 'duotone-row duotone-colors' });
	for (const [key, label] of [['dark', 'Black becomes'], ['light', 'White becomes']] as const) {
		const item = colors.createDiv({ cls: 'duotone-color' });
		item.createSpan({ text: label });
		const picker = item.createEl('input', { type: 'color' });
		picker.value = current[key];
		picker.addEventListener('input', () => handlers.set({ [key]: picker.value }));
	}

	const reset = body.createEl('button', { text: 'Reset this image', cls: 'duotone-reset' });
	reset.addEventListener('click', () => handlers.reset());

	return panel;
}
