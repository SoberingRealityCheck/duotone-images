// ============================================================================
// SVG filters — the DOM side. One hidden <svg> holds one <filter> per image look.
// ============================================================================
//
// A filter is never edited after it's made. A new look gets a new id, and old ids
// get swept. That way images always pick up changes, even if the browser caches a filter.
// ============================================================================

import { FilterParams } from './duotone';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
	const el = document.createElementNS(NS, name);
	for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
	return el;
}

export class FilterHost {
	private svg: SVGSVGElement;
	private filters: Map<string, SVGElement> = new Map();
	private counter = 0;

	constructor() {
		this.svg = document.createElementNS(NS, 'svg');
		// Not display:none. Some browsers skip filters that live in a hidden svg.
		this.svg.setAttribute('width', '0');
		this.svg.setAttribute('height', '0');
		this.svg.setAttribute('aria-hidden', 'true');
		this.svg.style.position = 'absolute';
		this.svg.style.pointerEvents = 'none';
		document.body.appendChild(this.svg);
	}

	/** Make a filter and return its id. Use it as `filter: url(#id)`. */
	create(params: FilterParams): string {
		const id = `duotone-${++this.counter}`;
		const filter = svgEl('filter', {
			id,
			// Without this the filter works in linear light and the colors come out wrong.
			'color-interpolation-filters': 'sRGB',
			x: '0',
			y: '0',
			width: '1',
			height: '1',
		});

		filter.appendChild(svgEl('feColorMatrix', {
			type: 'matrix',
			values: params.matrix.join(' '),
			result: 'grey',
		}));

		const transfer = svgEl('feComponentTransfer', { in: 'grey', result: 'duo' });
		for (const [name, table] of [['feFuncR', params.ramp.r], ['feFuncG', params.ramp.g], ['feFuncB', params.ramp.b]] as const) {
			transfer.appendChild(svgEl(name, { type: 'table', tableValues: table.map((v) => v.toFixed(4)).join(' ') }));
		}
		filter.appendChild(transfer);

		// mix * duotone + (1 - mix) * original
		filter.appendChild(svgEl('feComposite', {
			in: 'duo',
			in2: 'SourceGraphic',
			operator: 'arithmetic',
			k1: '0',
			k2: String(params.mix),
			k3: String(1 - params.mix),
			k4: '0',
		}));

		this.svg.appendChild(filter);
		this.filters.set(id, filter);
		return id;
	}

	/** Remove every filter whose id isn't in `keep`. */
	sweep(keep: ReadonlySet<string>): void {
		for (const [id, filter] of this.filters) {
			if (!keep.has(id)) {
				filter.remove();
				this.filters.delete(id);
			}
		}
	}

	destroy(): void {
		this.svg.remove();
		this.filters.clear();
	}
}
