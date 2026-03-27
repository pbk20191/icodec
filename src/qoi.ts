import wasmFactory, { EmbindString } from "../dist/qoi.ts";
import { AsyncFactoryResult, check, ImageDataLike, loadES, WasmSource } from "./common.ts";

/**
 * QOI encoder does not have options, it's always lossless.
 */
export type Options = never;

export const defaultOptions = undefined as never;

export const bitDepth = [8];
export const mimeType = "image/qoi";
export const extension = "qoi";

let codecWASM: AsyncFactoryResult<typeof wasmFactory> | undefined;

export async function loadEncoder(input?: WasmSource) {
	return codecWASM = await loadES(wasmFactory, input);
}

export const loadDecoder = loadEncoder;

export function encode(image: ImageDataLike) {
	const { data, width, height } = image;
	const result = codecWASM!!.encode(data, width, height, undefined);
	return check<Uint8Array>(result, "QOI Encode");
}

export function decode(input: BufferSource) {
	return check<ImageData>(codecWASM!!.decode(input as EmbindString), "QOI Decode");
}

export function unloadDecoder() {
	codecWASM = undefined;
}

export const unloadEncoder = unloadDecoder;