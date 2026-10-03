// ============================================================================
// Duotone — the honest part. No io, no DOM. Values in, values out.
// ============================================================================
//
// The picture is drawn through an SVG filter. Two steps:
//   1. matrix: turn each pixel into one grey value, with contrast and exposure folded in.
//   2. ramp:   look that grey up in a table that runs from the dark color to the light color.
// This file works out the numbers for both. filters.ts builds the SVG from them.
// ============================================================================

export type Rgb = [number, number, number];

/** What the user can change per image. Missing fields fall back to NEUTRAL. */
export interface Adjust {
	/** Force the recolor on or off for this image. Missing means follow "recolor all images". */
	enabled?: boolean;
	/** -1 to 1. Added to the grey value. */
	exposure: number;
	/** 0 to 3. 1 = unchanged. Stretches greys away from mid-grey. */
	contrast: number;
	/** -2 to 2. Above 0 gives the light color more of the picture. Below 0 gives the dark color more. */
	balance: number;
	/** 0 to 1. 0 = the original picture, 1 = full duotone. */
	mix: number;
	/** Swap which end of the ramp black and white land on. */
	invert: boolean;
	/** Colors for this image only. Missing means use the global ones. */
	dark?: string;
	light?: string;
}

export const NEUTRAL: Omit<Adjust, 'enabled' | 'dark' | 'light'> = {
	exposure: 0,
	contrast: 1,
	balance: 0,
	mix: 1,
	invert: false,
};

/** The part of the plugin settings that decides how images look. */
export interface DuotoneConfig {
	darkColor: string;
	lightColor: string;
	applyToAll: boolean;
	/** Per-image changes, keyed by vault path. Only what differs from default is stored. */
	images: Record<string, Partial<Adjust>>;
}

/** The numbers an SVG filter needs. */
export interface FilterParams {
	/** 20 numbers for feColorMatrix. */
	matrix: number[];
	/** Table values for feFuncR / feFuncG / feFuncB, each 0..1. */
	ramp: { r: number[]; g: number[]; b: number[] };
	mix: number;
}

export const RAMP_STEPS = 65;

/** '#rrggbb' -> [r, g, b]. Bad input gives black. */
export function hexToRgb(hex: string): Rgb {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return [0, 0, 0];
	const n = parseInt(m[1]!, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Every setting for one image, with defaults filled in. */
export function resolveAdjust(config: DuotoneConfig, path: string): Required<Adjust> {
	const own = config.images[path] ?? {};
	return {
		enabled: own.enabled ?? config.applyToAll,
		exposure: own.exposure ?? NEUTRAL.exposure,
		contrast: own.contrast ?? NEUTRAL.contrast,
		balance: own.balance ?? NEUTRAL.balance,
		mix: own.mix ?? NEUTRAL.mix,
		invert: own.invert ?? NEUTRAL.invert,
		dark: own.dark ?? config.darkColor,
		light: own.light ?? config.lightColor,
	};
}

/**
 * Where a grey value (0 = black, 1 = white) ends up on the dark -> light line, before colors.
 * Contrast and exposure happen earlier, in the matrix.
 */
export function rampPosition(grey: number, balance: number, invert: boolean): number {
	const u = invert ? 1 - grey : grey;
	// Balance bends the curve. Above 0 pulls midtones toward the light end.
	return Math.pow(u, Math.pow(2, -balance));
}

/** Work out the filter numbers for one image. */
export function buildFilterParams(adjust: Required<Adjust>): FilterParams {
	// grey = 0.2126 R + 0.7152 G + 0.0722 B on raw sRGB values, no gamma step. Stylized, not color-accurate.
	// Contrast scales around 0.5. Exposure adds on top. The filter clamps to 0..1 for us.
	const k = adjust.contrast;
	const offset = 0.5 - 0.5 * k + adjust.exposure;
	const row = [0.2126 * k, 0.7152 * k, 0.0722 * k, 0, offset];
	const matrix = [...row, ...row, ...row, 0, 0, 0, 1, 0];

	const dark = hexToRgb(adjust.dark);
	const light = hexToRgb(adjust.light);
	const ramp = { r: [] as number[], g: [] as number[], b: [] as number[] };
	for (let i = 0; i < RAMP_STEPS; i++) {
		const t = rampPosition(i / (RAMP_STEPS - 1), adjust.balance, adjust.invert);
		ramp.r.push((dark[0] + (light[0] - dark[0]) * t) / 255);
		ramp.g.push((dark[1] + (light[1] - dark[1]) * t) / 255);
		ramp.b.push((dark[2] + (light[2] - dark[2]) * t) / 255);
	}

	return { matrix, ramp, mix: adjust.mix };
}

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif'];

/** True for formats we recolor. SVGs are skipped, since they're mostly icons. */
export function isImageExtension(ext: string): boolean {
	return IMAGE_EXTENSIONS.includes(ext.toLowerCase());
}

/** Drop the query string and hash, and undo %20 style escapes, so two URLs for one file compare equal. */
export function normalizeUrl(url: string): string {
	const bare = url.split('#')[0]!.split('?')[0]!;
	try {
		return decodeURIComponent(bare);
	} catch {
		return bare;
	}
}
