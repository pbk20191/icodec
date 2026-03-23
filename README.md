# icodec

[![NPM Version](https://img.shields.io/npm/v/icodec?style=flat-square)](https://www.npmjs.com/package/icodec)
![NPM Downloads](https://img.shields.io/npm/dm/icodec?style=flat-square)
![NPM Type Definitions](https://img.shields.io/npm/types/icodec?style=flat-square)
![No Dependency](https://img.shields.io/badge/dependencies-0-blue?style=flat-square&label=dependencies)

Image encoders & decoders built with WebAssembly, support high-depth.

<table>
    <thead>
        <tr><th>Module</th><th>Encoder</th><th>Decoder</th><th>Bit Depth</th></tr>
    </thead>
    <tbody>
        <tr>
            <td>jpeg</td>
            <td colspan='2'>
                <a href='https://github.com/mozilla/mozjpeg'>MozJPEG</a>
            </td>
            <td>8</td>
        </tr>
        <tr>
            <td>png</td>
            <td>
                <a href='https://github.com/shssoichiro/oxipng'>OxiPNG</a> 
                + 
                <a href='https://github.com/ImageOptim/libimagequant'>imagequant</a>
            </td>
            <td>
                <a href='https://github.com/image-rs/image-png'>image-png</a>
            </td>
            <td>8, 16</td>
        </tr>
        <tr>
            <td>qoi</td>
            <td colspan='2'>
                <a href='https://github.com/phoboslab/qoi'>qoi</a>
            </td>
            <td>8</td>
        </tr>
        <tr>
            <td>webp</td>
            <td colspan='2'>
                <a href='https://chromium.googlesource.com/webm/libwebp'>libwebp</a>
            </td>
            <td>8</td>
        </tr>
        <tr>
            <td>heic</td>
            <td>
                <a href='https://github.com/strukturag/libheif'>libheif</a>
                +
                <a href='https://bitbucket.org/multicoreware/x265_git/src'>x265</a>
            </td>
            <td>
                <a href='https://github.com/strukturag/libheif'>libheif</a>
                +
                <a href='https://github.com/strukturag/libde265'>libde265</a>
            </td>
            <td>8, 10, 12</td>
        </tr>
        <tr>
            <td>avif</td>
            <td colspan='2'>
                <a href='https://github.com/AOMediaCodec/libavif'>libavif</a>
                +
                <a href='https://aomedia.googlesource.com/aom'>aom</a>
            </td>
            <td>8, 10, 12, 16*</td>
        </tr>
        <tr>
            <td>jxl</td>
            <td colspan='2'>
                <a href='https://github.com/libjxl/libjxl'>libjxl</a>
            </td>
            <td>from 8 to 16</td>
        </tr>
        <tr>
            <td>wp2</td>
            <td colspan='2'>
                <a href='https://chromium.googlesource.com/codecs/libwebp2'>libwebp2</a>
            </td>
            <td>8</td>
        </tr>S
        <tr>
            <td>vvic</td>
            <td>
                <a href='https://github.com/strukturag/libheif'>libheif</a>
                +
                <a href='https://github.com/fraunhoferhhi/vvenc'>vvenc</a>
            </td>
            <td>
                <a href='https://github.com/strukturag/libheif'>libheif</a>
                +
                <a href='https://github.com/fraunhoferhhi/vvdec'>vvdec</a>
            </td>
            <td>8</td>
        </tr>
    </tbody>
</table>

> [!WARNING]
> The `encode` of the `heic` module is guaranteed to work in single-thread mode by using Emscripten fiber, even though libheif does not support specifying thread count for the x265 encoder.
> 
> `wp2` is experimental, file encoded in old version may be invalid for newer decoder.
> 
> \* 16-bit AVIF uses experimental simple transform that store image in 12-bit + extra 4-bit hidden image item.

icodec is aimed at the web platform and has some limitations:

* Decode output & Encode input only support RGBA format.
* No animated image support, you should use video instead.

# Usage

Requirement: The target environment must support [WebAssembly SIMD](https://caniuse.com/wasm-simd).

```shell
pnpm add icodec
```

Use in browser:

```javascript
// All codec modules (see the table above) are named export.
import { avif, jxl } from "icodec";

const response = await fetch("https://raw.githubusercontent.com/Kaciras/icodec/master/test/snapshot/image.avif");
const data = new Uint8Array(await response.arrayBuffer());

// This should be called once before you invoke `decode()`
await avif.loadDecoder();

// Decode AVIF to ImageData.
const image = avif.decode(data);

// This should be called once before you invoke `encode()`
await jxl.loadEncoder();

// Encode the image to JPEG XL.
const jxlData = jxl.encode(image/*, { options }*/);
```

To use icodec in Node, just change the import specifier to `icodec/node`, and `loadEncoder`/`loadDecoder` will use `readFileSync` instead of `fetch`.

```javascript
import { avif, jxl } from "icodec/node";
```

If your bundler requires special handing of WebAssembly, you can pass the URL of WASM files to `load*` function. WASM files are exported in the format `icodec/<codec>-<enc|dec>.wasm`.

icodec is tree-shakable, with a bundler the unused code and wasm files can be eliminated.

```javascript
import { avif, jxl } from "icodec";

// Example for Vite
import AVIFEncWASM from "icodec/avif-enc.wasm?url";
import JxlDecWASM from "icodec/jxl-dec.wasm?url";

await avif.loadDecoder(AVIFEncWASM);
await jxl.loadEncoder(JxlDecWASM);
```

Type of each codec module:

```typescript
/**
 * Provides a uniform type for codec modules that support encoding.
 *
 * @example
 * import { wp2, ICodecModule } from "icodec";
 *
 * const encoder: ICodecModule<wp2.Options> = wp2;
 */
interface ICodecModule<T = any> {
  /**
   * The default options of `encode` function.
   */
  defaultOptions: Required<T>;

  /**
   * The MIME type string of the format.
   */
  mimeType: string;

  /**
   * File extension (without the dot) of this format.
   */
  extension: string;

  /**
   * List of supported bit depth, from lower to higher.
   */
  bitDepth: number[];

  /**
   * Load the decoder WASM file, must be called once before decode.
   * Multiple calls are ignored, and return the first result.
   *
   * @param source If pass a string, it's the URL of WASM file to fetch,
   *               else it will be treated as the WASM bytes.
   * @return the underlying WASM module, which is not part of
   *               the public API and can be changed at any time.
   */
  loadDecoder(source?: WasmSource): Promise<any>;

  /**
   * Convert the image to raw RGBA data.
   */
  decode(input: Uint8Array): ImageData;

  /**
   * Load the encoder WASM file, must be called once before encode.
   * Multiple calls are ignored, and return the first result.
   *
   * @param source If pass a string, it's the URL of WASM file to fetch,
   *               else it will be treated as the WASM bytes.
   * @return the underlying WASM module, which is not part of
   *               the public API and can be changed at any time.
   */
  loadEncoder(source?: WasmSource): Promise<any>;

  /**
   * Encode an image with RGBA pixels data.
   */
  encode(image: ImageDataLike, options?: T): Uint8Array;
}
```

The `png` module exports extra members:

```typescript
/**
 * Reduces the colors used in the image at a slight loss, using a combination
 * of vector quantization algorithms.
 *
 * Can be used before other compression algorithm to boost compression ratio.
 */
declare function reduceColors(image: ImageDataLike, options?: QuantizeOptions): Uint8Array;
```

# High Bit-Depth

icodec supports high bit-depth images, for image with bit-depth > 8, the data should be 2-bytes per channel in Little-Endian (both encode input and decode result).

If you want to encode an image with bit-depth does not supported by the codec, you must scale it before.

In browser, decode result of the 8-bit image is an instance of [ImageData](https://developer.mozilla.org/docs/Web/API/ImageData), otherwise is not.

# Performance

Decode & Encode `test/snapshot/image.*` files, 417px x 114px, 8-bit, `time.SD` is Standard Deviation of the time.

This benchmark ignores extra code size introduced by icodec, which in practice needs to be taken into account.

Decode on Edge browser.

| No. |   Name | codec |        time |     time.SD |
| --: | -----: | ----: | ----------: | ----------: |
|   0 | icodec |  avif | 1,727.54 us |    15.12 us |
|   1 |     2d |  avif |   493.56 us |     2.58 us |
|   2 |  WebGL |  avif |   876.40 us |     9.62 us |
|   3 | icodec |  heic |     1.20 ms |     7.51 us |
|   4 | icodec |  jpeg |   434.98 us |     1.51 us |
|   5 |     2d |  jpeg |   209.49 us |     2.66 us |
|   6 |  WebGL |  jpeg |   605.33 us |     1.87 us |
|   7 | icodec |   jxl |     2.15 ms |     5.53 us |
|   8 | icodec |   png |   174.09 us |   324.80 ns |
|   9 |     2d |   png |   170.82 us | 1,087.79 ns |
|  10 |  WebGL |   png |   549.13 us | 2,708.95 ns |
|  11 | icodec |   qoi |   194.77 us |   955.73 ns |
|  12 | icodec |  webp |   390.09 us |     3.69 us |
|  13 |     2d |  webp |   361.30 us |     4.71 us |
|  14 |  WebGL |  webp |   744.59 us |     4.92 us |
|  15 | icodec |   wp2 |     1.57 ms |    14.71 us |

Decode on Node, vs [Sharp](https://github.com/lovell/sharp).

| No. |   Name | codec |      time |     time.SD |
| --: | -----: | ----: | --------: | ----------: |
|   0 | icodec |  avif |   1.73 ms |     2.54 us |
|   1 |  Sharp |  avif |   1.15 ms |     4.00 us |
|   2 | icodec |  heic |   1.31 ms |    46.66 us |
|   3 |  Sharp |  heic |   2.13 ms |    69.81 us |
|   4 | icodec |  jpeg | 440.56 us |     4.11 us |
|   5 |  Sharp |  jpeg | 486.12 us |     1.39 us |
|   6 | icodec |   jxl |   2.11 ms |     3.01 us |
|   7 |  Sharp |   jxl |   3.78 ms |    14.06 us |
|   8 | icodec |   png | 156.59 us |    51.68 ns |
|   9 |  Sharp |   png | 420.68 us |   810.94 ns |
|  10 | icodec |   qoi | 177.98 us |   222.92 ns |
|  11 | icodec |  webp | 368.54 us | 1,409.96 ns |
|  12 |  Sharp |  webp | 936.37 us |   726.44 ns |
|  13 | icodec |   wp2 |   1.51 ms |    13.38 us |

Encode on Node, vs [Sharp](https://github.com/lovell/sharp). Note that icodec and Sharp do not use the same code, so the output images are not exactly equal.

| No. |   Name | codec |        time |   time.SD |
|----:|-------:|------:|------------:|----------:|
|   0 | icodec |  avif |    35.65 ms | 109.92 us |
|   1 |  Sharp |  avif |    42.73 ms |  99.32 us |
|   2 | icodec |  heic |    94.91 ms | 108.29 us |
|   3 |  Sharp |  heic |    41.59 ms | 120.28 us |
|   4 | icodec |  jpeg | 7,038.84 us |  34.34 us |
|   5 |  Sharp |  jpeg |   553.21 us |   6.24 us |
|   6 | icodec |   jxl |    28.65 ms |  87.20 us |
|   7 |  Sharp |   jxl |    30.08 ms | 191.50 us |
|   8 | icodec |   png |    50.99 ms | 295.76 us |
|   9 |  Sharp |   png |     2.37 ms |  41.31 us |
|  10 | icodec |   qoi |    99.50 us | 824.39 ns |
|  11 | icodec |  webp |     3.82 ms |  39.77 us |
|  12 |  Sharp |  webp |     2.81 ms |  52.25 us |
|  13 | icodec |   wp2 |    56.29 ms | 378.50 us |

# Contribute

To build WASM modules, you will need to install:

* [Cmake](https://cmake.org) >= 3.24
* [Rust](https://www.rust-lang.org/tools/install) & [wasm-pack](https://rustwasm.github.io/wasm-pack/installer)
* [Emscripten](https://emscripten.org/docs/getting_started/downloads.html)
* [Perl](https://www.perl.org)
* [Git](https://git-scm.com)
* A proper C/C++ compiler toolchain, depending on your operating system

build the project:

```shell
pnpm exec tsc
node scripts/build.js [--debug] [--rebuild] [--parallel=<int>] [--cmakeBuilder=<Ninja|...>]
```

Run tests:

```shell
node --test test/test-*.js
```

Start web demo:

```shell
node scripts/start-demo.js
```