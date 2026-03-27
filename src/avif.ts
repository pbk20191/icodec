import wasmFactoryEnc, { MainModule as EncoderModule } from "../dist/avif-enc.ts";
import wasmFactoryDec, { MainModule as DecoderModule, EmbindString } from "../dist/avif-dec.ts";
import { AsyncFactoryResult, check, encodeES, EnumValue, ImageDataLike, loadES, WasmSource } from "./common.ts";

export enum Subsampling {
	YUV444 = 1,
	YUV422 = 2,
	YUV420 = 3,
	YUV400 = 4,
}

export enum AVIFTune {
	Auto,
	PSNR,
	SSIM,
}

export interface Options {
	/**
	 * [0 - 100], 0 = worst quality, 100 = lossless
	 *
	 * @default 50
	 */
	quality?: number;

	/**
	 * As above, but -1 means 'use quality'
	 *
	 * @default -1
	 */
	qualityAlpha?: number;

	/**
	 * Range: [-1, 10], 0 = slowest, 10 = fastest, slower should make for a better quality image in less bytes.
	 * A combination of settings are tweaked to simulate this speed range.
	 *
	 * @default 6
	 */
	speed?: number;

	/**
	 * Chrome subsampling type.
	 *
	 * @default YUV420
	 */
	subsample?: EnumValue<typeof Subsampling>;

	/**
	 * If true, ignores `tileRowsLog2` and `tileColsLog2` and automatically chooses suitable tiling values.
	 *
	 * @default false
	 */
	autoTiling?: boolean;

	/**
	 * [0 - 6], Creates 2^n tiles in that dimension
	 *
	 * @default 0
	 */
	tileRowsLog2?: number;
	tileColsLog2?: number;

	/**
	 * Extra chroma compression, cannot be used in lossless mode.
	 *
	 * @default false
	 */
	chromaDeltaQ?: boolean;

	/**
	 * Bias towards block sharpness in rate-distortion optimization of transform coefficients [0, 7]
	 *
	 * @default 0
	 */
	sharpness?: number;

	/**
	 * Amount of noise (from 0 = don't denoise, to 50)
	 *
	 * @default 0
	 */
	denoiseLevel?: number;

	/**
	 * Distortion metric tuned with.
	 *
	 * @default AVIFTune.Auto
	 */
	tune?: EnumValue<typeof AVIFTune>;

	/**
	 * Use libsharpyuv for RGB->YUV conversion if needed.
	 *
	 * @default false
	 */
	sharpYUV?: boolean;
}

export const defaultOptions: Required<Options> = {
	quality: 50,
	qualityAlpha: -1,
	speed: 6,
	subsample: Subsampling.YUV420,
	autoTiling: false,
	tileColsLog2: 0,
	tileRowsLog2: 0,
	chromaDeltaQ: false,
	sharpness: 0,
	denoiseLevel: 0,
	tune: AVIFTune.Auto,
	sharpYUV: false,
};

export const mimeType = "image/avif";
export const extension = "avif";
export const bitDepth = [8, 10, 12, 16];

let encoderWASM: AsyncFactoryResult<typeof wasmFactoryEnc> | undefined;
let decoderWASM: AsyncFactoryResult<typeof wasmFactoryDec> | undefined;

export async function loadEncoder(input?: WasmSource) {
	return encoderWASM ??= (await loadES(wasmFactoryEnc as any, input) as unknown as Exclude<typeof encoderWASM, undefined>);
}

export async function loadDecoder(input?: WasmSource) {
	return decoderWASM ??= (await loadES(wasmFactoryDec as any, input) as unknown as Exclude<typeof decoderWASM, undefined>);
}

export function encode(image: ImageDataLike, options?: Options) {
	return encodeES("AVIF Encode", encoderWASM, defaultOptions, image, options);
}

export function decode(input: BufferSource) {
	return check<ImageData>(decoderWASM!.decode(input as EmbindString), "AVIF Decode");
}


export function unloadDecoder() {
	decoderWASM = undefined;
}

export function unloadEncoder() {
	encoderWASM = undefined;
}