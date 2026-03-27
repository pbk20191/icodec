import wasmFactoryEnc from "../dist/heic-enc.ts";
import wasmFactoryDec, { EmbindString } from "../dist/heic-dec.ts";
import { AsyncFactoryResult, check, encodeES, ImageDataLike, loadES, WasmSource } from "./common.ts";

export const Presets = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow", "placebo"] as const;

export const Subsampling = ["420", "422", "444"] as const;

export const Tune = ["psnr", "ssim", "grain", "fastdecode"] as const;

export interface Options {
	/**
	 * Quality-based VBR [0, 100], it will map to `--crf` parameter of x265.
	 * quality=0   -> crf=50
	 * quality=50  -> crf=25
	 * quality=100 -> crf=0
	 *
	 * @default 50
	 */
	quality?: number;

	/**
	 * If true, Bypass transform, quant and loop filters.
	 *
	 * Note: it does not bypass chroma subsampling, you need
	 *       also to set `chroma` to "444" for exact lossless.
	 *
	 * @default false
	 */
	lossless?: boolean;

	/**
	 * Trade off performance for compression efficiency.
	 *
	 * @default "slow"
	 */
	preset?: typeof Presets[number];

	/**
	 * Tune the settings for a particular type of source or situation.
	 *
	 * @default "ssim"
	 */
	tune?: typeof Tune[number];

	/**
	 * Max TU recursive depth for intra CUs。
	 *
	 * [1, 4], default 2.
	 */
	tuIntraDepth?: number;

	/**
	 * CPU effort, larger value increases encode time.
	 * Range is [0, 100], but only changes at a few values.
	 *
	 * @default 50
	 */
	complexity?: number;

	/**
	 * Specify chroma subsampling method.
	 *
	 * @default "420"
	 */
	chroma?: typeof Subsampling[number];

	/**
	 * Use more accurate and sharper RGB->YUV conversion if needed.
	 *
	 * @default false
	 */
	sharpYUV?: boolean;
}

export const defaultOptions: Required<Options> = {
	quality: 50,
	lossless: false,
	preset: "slow",
	tune: "ssim",
	tuIntraDepth: 2,
	complexity: 50,
	chroma: "420",
	sharpYUV: false,
};

export const mimeType = "image/heic";
export const extension = "heic";
export const bitDepth = [8, 10, 12];

let encoderWASM: AsyncFactoryResult<typeof wasmFactoryEnc> | undefined;
let decoderWASM: AsyncFactoryResult<typeof wasmFactoryDec> | undefined;


export async function loadEncoder(input?: WasmSource) {
	return encoderWASM ??= (await loadES(wasmFactoryEnc as any, input) as Exclude<typeof encoderWASM, undefined>);
}

export async function loadDecoder(input?: WasmSource) {
	return decoderWASM ??= (await loadES(wasmFactoryDec as any, input) as Exclude<typeof decoderWASM, undefined>);
}

export function encode(image: ImageDataLike, options?: Options) {
	const new_encode = (...args: any[]) => {
		const holder = {} as {
			error?:any,
			success?:any,
		}
		(encoderWASM as any).encode(...args,holder);
		if (holder.error) {
			return holder.error;
		}
		if (holder.success){
			return holder.success
		}
	}
	
	return encodeES("HEIC Encode", { encode:new_encode }, defaultOptions, image, options);
}

export function decode(input: BufferSource) {
	return check<ImageData>(decoderWASM!!.decode(input as EmbindString), "HEIC Decode");
}

export function unloadDecoder() {
	decoderWASM = undefined;
}

export function unloadEncoder() {
	encoderWASM = undefined;
}