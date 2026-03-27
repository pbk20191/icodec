import wasmFactoryEnc from "../dist/vvic-enc.ts";
import wasmFactoryDec, { EmbindString } from "../dist/vvic-dec.ts";
import { AsyncFactoryResult, check, encodeES, ImageDataLike, loadES, WasmSource } from "./common.ts";

export interface Options {
    /**
     * If true, encode the image without any loss.
     *
     * @default false
     */
    lossless?: boolean;
    /**
     * The quality of the encoded image, from 0 to 100.
     *
     * @default 75
     */
    quality?: number;
}

export const defaultOptions: Required<Options> = {
    lossless: false,
    quality: 75,
};

let encoderWASM: AsyncFactoryResult<typeof wasmFactoryEnc> | undefined;
let decoderWASM: AsyncFactoryResult<typeof wasmFactoryDec> | undefined;

export const mimeType = "image/vvic";
export const extension = "vvic";
export const bitDepth = [8];

export async function loadEncoder(input?: WasmSource) {
    return encoderWASM ??= await loadES(wasmFactoryEnc, input);
}

export async function loadDecoder(input?: WasmSource) {
    return decoderWASM ??= await loadES(wasmFactoryDec, input);
}

export function encode(image: ImageDataLike, options?: Options) {
    return encodeES("VVIC Encode", encoderWASM, defaultOptions, image, options);
}


export function decode(input: BufferSource) {
    return check<ImageData>(decoderWASM!!.decode(input as EmbindString), "VVIC Decode");
}

export function unloadDecoder() {
    decoderWASM = undefined;
}

export function unloadEncoder() {
    encoderWASM = undefined;
}