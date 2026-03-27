/// <reference types="emscripten" preserve="true" />
import "emscripten"

type EmscriptenRequiredKeys = "locateFile" | "preRun" | "postRun" | "onAbort" | "instantiateWasm" | "onExit" | "noExitRuntime" | "print" | "printErr" | "wasmBinary" | "arguments" | "thisProgram" | "preInit" | "calledRun" | "onRuntimeInitialized" | "setStatus"
export type OptimizedEmscriptenModule = Partial<Pick<EmscriptenModule, EmscriptenRequiredKeys>>

declare module "../dist/avif-dec.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/avif-enc.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/jxl-dec.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/jxl-enc.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/webp-dec.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/webp-enc.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/heic-dec.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/heic-enc.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/wp2-dec.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
} 

declare module "../dist/wp2-enc.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/qoi.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/vvic-dec.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/vvic-enc.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}

declare module "../dist/mozjpeg.ts" {
    interface WasmModule extends OptimizedEmscriptenModule {}
}
