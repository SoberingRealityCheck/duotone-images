import assert from 'node:assert/strict';
import {
	RAMP_STEPS,
	buildFilterParams,
	hexToRgb,
	isImageExtension,
	normalizeUrl,
	rampPosition,
	resolveAdjust,
} from '../src/duotone.ts';
import type { DuotoneConfig } from '../src/duotone.ts';

const config: DuotoneConfig = { darkColor: '#0a141e', lightColor: '#d2dce6', applyToAll: true, images: {} };

// colors
assert.deepEqual(hexToRgb('#ff8000'), [255, 128, 0]);
assert.deepEqual(hexToRgb('nonsense'), [0, 0, 0]);

// defaults come from the global config, per-image values win
assert.equal(resolveAdjust(config, 'a.png').dark, '#0a141e');
assert.equal(resolveAdjust(config, 'a.png').enabled, true);
const custom: DuotoneConfig = { ...config, images: { 'a.png': { contrast: 2, enabled: false, light: '#ffffff' } } };
assert.equal(resolveAdjust(custom, 'a.png').contrast, 2);
assert.equal(resolveAdjust(custom, 'a.png').enabled, false);
assert.equal(resolveAdjust(custom, 'a.png').light, '#ffffff');
assert.equal(resolveAdjust(custom, 'b.png').contrast, 1); // other images unaffected
assert.equal(resolveAdjust({ ...config, applyToAll: false }, 'a.png').enabled, false);

// default look: black -> dark color, white -> light color
const neutral = buildFilterParams(resolveAdjust(config, 'a.png'));
assert.equal(neutral.ramp.r.length, RAMP_STEPS);
assert.ok(Math.abs(neutral.ramp.r[0]! - 10 / 255) < 1e-9);
assert.ok(Math.abs(neutral.ramp.b[RAMP_STEPS - 1]! - 230 / 255) < 1e-9);
assert.equal(neutral.matrix.length, 20);
assert.equal(neutral.mix, 1);

// matrix: contrast 1, exposure 0 is plain grey with no offset. Weights add up to 1.
assert.ok(Math.abs(neutral.matrix[0]! + neutral.matrix[1]! + neutral.matrix[2]! - 1) < 1e-9);
assert.equal(neutral.matrix[4], 0);
// exposure shifts the offset. Contrast 2 makes mid-grey stay mid-grey.
assert.equal(buildFilterParams(resolveAdjust({ ...config, images: { x: { exposure: 0.25 } } }, 'x')).matrix[4], 0.25);
const hard = buildFilterParams(resolveAdjust({ ...config, images: { x: { contrast: 2 } } }, 'x')).matrix;
assert.ok(Math.abs(hard[0]! * 0.5 + hard[1]! * 0.5 + hard[2]! * 0.5 + hard[4]! - 0.5) < 1e-9);

// balance: above 0 pulls midtones toward the light end, below 0 toward the dark end
assert.ok(rampPosition(0.5, 1, false) > 0.5);
assert.ok(rampPosition(0.5, -1, false) < 0.5);
assert.equal(rampPosition(0.5, 0, false), 0.5);
assert.equal(rampPosition(0, 1, false), 0); // ends stay put
assert.equal(rampPosition(1, -2, false), 1);

// invert: black lands on the light color
assert.equal(rampPosition(0, 0, true), 1);
const inverted = buildFilterParams(resolveAdjust({ ...config, images: { x: { invert: true } } }, 'x'));
assert.ok(Math.abs(inverted.ramp.r[0]! - 210 / 255) < 1e-9);

// urls
assert.equal(normalizeUrl('app://abc/My%20Vault/cat.png?1700000000'), 'app://abc/My Vault/cat.png');
assert.equal(normalizeUrl('app://abc/cat.png#x'), 'app://abc/cat.png');
assert.ok(isImageExtension('JPG'));
assert.ok(!isImageExtension('svg'));

console.log('duotone tests passed');
