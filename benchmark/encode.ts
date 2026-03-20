import { getRawPixels } from "../test/fixtures.js";
import { defineSuite } from "esbench";
import sharp, { Sharp } from "sharp";
import * as codecs from "../lib/node.js";

const input = getRawPixels("image");
sharp.concurrency(1);
sharp.simd(true);
const sharpImage = sharp(input.data, {
	raw: {
		channels: 4,
		width: input.width,
		height: input.height,
	},
});


// Npm build of Sharp does not have JXL module.
const sharpEncodes: Record<string, () => Sharp> = {
	avif: () => sharpImage.avif({ chromaSubsampling: "4:2:0" }),
	jpeg: () => sharpImage.jpeg(),
	jxl: () =>  sharpImage.jxl({ quality: 75 }),
	png: () => sharpImage.png({ quality: 75, palette: true }),
	webp: () => sharpImage.webp({ quality: 75 }),
	heic: () => sharpImage.heif({ compression: "hevc", quality: 75, chromaSubsampling: "4:2:0" }),
};

const codecNames = Object.keys(codecs).filter(k => codecs[k as keyof typeof codecs].encode);

// Does not work in Node.
// codecNames.splice(codecNames.indexOf("heic"), 1);

/*
 * Run benchmark: pnpm exec esbench --file encode.ts
 */
export default defineSuite({
	params: {
		codec: codecNames,
	},
	baseline: {
		type: "Name",
		value: "icodec",
	},
	async setup(scene) {
		const name = scene.params.codec as keyof typeof codecs;
		const { loadEncoder, encode } = codecs[name];
		const sharpEncode = sharpEncodes[name as string];

		await loadEncoder();

		scene.bench("icodec", () => encode(input));
		if (sharpEncode) {
			scene.benchAsync("Sharp", () => sharpEncode().toBuffer());
		}
	},
});
