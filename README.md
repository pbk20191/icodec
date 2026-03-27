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

| No. |   Name | codec |        time |   time.SD |
| --: | -----: | ----: | ----------: | --------: |
|   0 | icodec |  avif | 1,710.60 us |  21.93 us |
|   1 |     2d |  avif |   493.69 us |   1.65 us |
|   2 |  WebGL |  avif |   894.87 us |  10.13 us |
|   3 | icodec |  heic |     1.17 ms |  14.51 us |
|   4 | icodec |  jpeg |     2.05 ms | 628.38 us |
|   5 |     2d |  jpeg |     1.56 ms | 110.55 us |
|   6 |  WebGL |  jpeg |     2.63 ms | 707.70 us |
|   7 | icodec |   jxl |    13.09 ms | 955.22 us |
|   8 | icodec |   png |   821.78 us |  66.81 us |
|   9 |     2d |   png | 1,199.33 us |  44.77 us |
|  10 |  WebGL |   png | 1,946.85 us | 442.79 us |
|  11 | icodec |   qoi |   892.97 us |  31.51 us |
|  12 | icodec |  vvic |    11.16 ms | 292.62 us |
|  13 | icodec |  webp |     2.55 ms | 164.52 us |
|  14 |     2d |  webp |     2.20 ms | 176.67 us |
|  15 |  WebGL |  webp |     2.51 ms | 451.14 us |
|  16 | icodec |   wp2 |     8.72 ms | 174.01 us |

Decode on Node, vs [Sharp](https://github.com/lovell/sharp).

| No. |   Name | codec |      time |  time.SD |
| --: | -----: | ----: | --------: | -------: |
|   0 | icodec |  avif |   1.68 ms | 20.70 us |
|   1 |  Sharp |  avif |   1.16 ms | 33.35 us |
|   2 | icodec |  heic |   1.16 ms | 18.64 us |
|   3 |  Sharp |  heic |   1.90 ms | 26.32 us |
|   4 | icodec |  jpeg | 435.98 us |  8.20 us |
|   5 |  Sharp |  jpeg | 472.40 us |  9.68 us |
|   6 | icodec |   jxl |   2.07 ms | 21.80 us |
|   7 |  Sharp |   jxl |   3.84 ms | 64.29 us |
|   8 | icodec |   png | 154.72 us |  1.60 us |
|   9 |  Sharp |   png | 419.32 us |  2.15 us |
|  10 | icodec |   qoi | 181.06 us |  4.86 us |
|  11 | icodec |  vvic |   1.53 ms | 17.61 us |
|  12 | icodec |  webp | 361.30 us |  6.68 us |
|  13 |  Sharp |  webp | 940.68 us |  7.43 us |
|  14 | icodec |   wp2 |   1.46 ms | 13.45 us |

Encode on Node, vs [Sharp](https://github.com/lovell/sharp). Note that icodec and Sharp do not use the same code, so the output images are not exactly equal.

| No. |   Name | codec |        time |     time.SD |
| --: | -----: | ----: | ----------: | ----------: |
|   0 | icodec |  avif |    33.97 ms |   552.34 us |
|   1 |  Sharp |  avif |    41.82 ms | 1,494.94 us |
|   2 | icodec |  heic |    92.53 ms |     2.80 ms |
|   3 |  Sharp |  heic |    40.57 ms |     1.06 ms |
|   4 | icodec |  jpeg | 7,742.53 us |   861.64 us |
|   5 |  Sharp |  jpeg |   572.19 us |    15.27 us |
|   6 | icodec |   jxl |    26.89 ms |   400.82 us |
|   7 |  Sharp |   jxl |    28.50 ms |   268.92 us |
|   8 | icodec |   png |    47.40 ms |   284.28 us |
|   9 |  Sharp |   png |     2.25 ms |    16.63 us |
|  10 | icodec |   qoi |    92.90 us |     1.71 us |
|  11 | icodec |  vvic |      1.24 s |    46.07 ms |
|  12 | icodec |  webp |     3.87 ms |   212.54 us |
|  13 |  Sharp |  webp |     2.69 ms |    44.19 us |
|  14 | icodec |   wp2 |    54.05 ms |   845.42 us |

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