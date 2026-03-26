/// <reference types="node" preserve="true" />
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PureImageData, WasmSource } from "./common.ts";

import * as avifRaw from "./avif.ts";
import * as pngRaw from "./png.ts";
import * as jpegRaw from "./jpeg.ts";
import * as jxlRaw from "./jxl.ts";
import * as webpRaw from "./webp.ts";
import * as heicRaw from "./heic.ts";
import * as qoiRaw from "./qoi.ts";
import * as wp2Raw from "./wp2.ts";
import * as vvicRaw from "./vvic.ts";

type NodeCodecModule = {
	loadEncoder(input?: WasmSource): Promise<EmscriptenModule>;
	loadDecoder(input?: WasmSource): Promise<EmscriptenModule>;
};
const distDir = join(dirname(fileURLToPath(import.meta.url)), "../dist");

globalThis._icodec_ImageData = (data, w, h, depth) => {
	return new PureImageData(data, w, h, depth);
};

function wrapLoaders<T extends NodeCodecModule>(original: T, e: string, d = e): T {
	let loadedEnc: Promise<EmscriptenModule> | undefined;
	let loadedDec: Promise<EmscriptenModule> | undefined;

	const loadEncoder = (input?: WasmSource) => {
		if (loadedEnc) return loadedEnc;

		let source = input ?? join(distDir, e);
		if (typeof source === "string") {
			source = readFileSync(source);
		}
		loadedEnc = original.loadEncoder(source);
		return loadedEnc;
	};

	const loadDecoder = (input?: WasmSource) => {
		if (loadedDec) return loadedDec;

		let source = input ?? join(distDir, d);
		if (typeof source === "string") {
			source = readFileSync(source);
		}
		loadedDec = original.loadDecoder(source);
		return loadedDec;
	};

	return { ...original, loadEncoder, loadDecoder } as T;
}

export const avif = wrapLoaders(avifRaw, "avif-enc.wasm", "avif-dec.wasm");
export const png = wrapLoaders(pngRaw, "pngquant_bg.wasm");
export const jpeg = wrapLoaders(jpegRaw, "mozjpeg.wasm");
export const jxl = wrapLoaders(jxlRaw, "jxl-enc.wasm", "jxl-dec.wasm");
export const webp = wrapLoaders(webpRaw, "webp-enc.wasm", "webp-dec.wasm");
export const qoi = wrapLoaders(qoiRaw, "qoi.wasm");
export const wp2 = wrapLoaders(wp2Raw, "wp2-enc.wasm", "wp2-dec.wasm");
export const vvic = wrapLoaders(vvicRaw, "vvic-enc.wasm", "vvic-dec.wasm");
export const heic = wrapLoaders(heicRaw, "heic-enc.wasm", "heic-dec.wasm");
