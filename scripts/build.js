import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { argv } from "node:process";
import { copyFile, copyFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { config, emcc, emcmake, wasmPack } from "./toolchain.js";
import { removeRange, RepositoryManager } from "./repository.js";

// Ensure we're on the project root directory.
process.chdir(dirname(import.meta.dirname));

const repositories = new RepositoryManager({
	mozjpeg: ["v4.1.5", "https://github.com/mozilla/mozjpeg"],
	qoi: ["master", "https://github.com/phoboslab/qoi"],
	libwebp: ["v1.6.0", "https://github.com/webmproject/libwebp"],
	libjxl: ["v0.11.2", "https://github.com/libjxl/libjxl"],
	libavif: ["v1.4.1", "https://github.com/AOMediaCodec/libavif"],
	aom: ["v3.13.2", "https://aomedia.googlesource.com/aom"],
	libwebp2: [
		"8720150cdc4c5c51a11a809a93110f38035b6048",
		"https://chromium.googlesource.com/codecs/libwebp2",
	],
	x265: ["4.1", "https://bitbucket.org/multicoreware/x265_git"],
	libde265: ["v1.0.18", "https://github.com/strukturag/libde265"],
	libheif: ["v1.21.2", "https://github.com/strukturag/libheif"],
	vvenc: ["v1.14.0", "https://github.com/fraunhoferhhi/vvenc"],
	vvdec: ["v3.1.0", "https://github.com/fraunhoferhhi/vvdec"],
});

// It also builds libsharpyuv.a which used in other encoders.
function buildWebPLibrary() {
	emcmake({
		outFile: "vendor/libwebp/libwebp.a",
		src: "vendor/libwebp",
		flags: "-DWEBP_DISABLE_STATS -DWEBP_REDUCE_CSP -DWEBP_USE_SSE2",
		cflags: "-std=c89",
		exceptions: false,
		options: {
			WEBP_ENABLE_SIMD: 1,
			WEBP_BUILD_CWEBP: 0,
			WEBP_BUILD_DWEBP: 0,
			WEBP_BUILD_GIF2WEBP: 0,
			WEBP_BUILD_IMG2WEBP: 0,
			WEBP_BUILD_VWEBP: 0,
			WEBP_BUILD_WEBPINFO: 0,
			WEBP_BUILD_LIBWEBPMUX: 0,
			WEBP_BUILD_WEBPMUX: 0,
			WEBP_BUILD_EXTRAS: 0,
			WEBP_USE_THREAD: 0,
			WEBP_BUILD_ANIM_UTILS: 0,
		},
	});
}

export function buildMozJPEG() {
	emcmake({
		outFile: "vendor/mozjpeg/libjpeg.a",
		src: "vendor/mozjpeg",
		// https://github.com/libjpeg-turbo/libjpeg-turbo/issues/600
		flags: "-DNO_GETENV -DNO_PUTENV",
		options: {
			WITH_SIMD: 0,
			ENABLE_SHARED: 0,
			WITH_TURBOJPEG: 0,
			PNG_SUPPORTED: 0,
		},
	});
	execFileSync("emcc", [
		"rdswitch.c",
		"-O3",
		"-c",
		config.wasm64 ? "-sMEMORY64" : "",
	], {
		stdio: "inherit",
		shell: true,
		cwd: "vendor/mozjpeg",
	});
	emcc("cpp/mozjpeg.cpp", [
		"-I vendor/mozjpeg",
		"vendor/mozjpeg/libjpeg.a",
		"vendor/mozjpeg/rdswitch.o",
		"--emit-tsd mozjpeg.d.ts",
	]);
}

export function buildPNGQuant() {
	wasmPack("rust");
	// `--out-dir` cannot be out of the rust workspace.
	renameSync("rust/pkg/pngquant.js", `${config.outDir}/pngquant.js`);
	renameSync("rust/pkg/pngquant_bg.wasm", `${config.outDir}/pngquant_bg.wasm`);
}

export function buildQOI() {
	emcc("cpp/qoi.cpp", ["-I vendor/qoi", "--emit-tsd qoi.d.ts"]);
}

export function buildWebP() {
	buildWebPLibrary();
	emcc("cpp/webp_enc.cpp", [
		"-I vendor/libwebp",
		"vendor/libwebp/libwebp.a",
		"vendor/libwebp/libsharpyuv.a",
		"--emit-tsd webp-enc.d.ts",
	]);
	emcc("cpp/webp_dec.cpp", [
		"-I vendor/libwebp",
		"vendor/libwebp/libwebp.a",
		"vendor/libwebp/libsharpyuv.a",
		"--emit-tsd webp-dec.d.ts",
	]);
}

export function buildJXL() {
	// highway uses CJS scripts in build, but our project is ESM.
	writeFileSync("vendor/libjxl/third_party/highway/package.json", "{}");
	removeRange("vendor/libjxl/third_party/skcms/skcms.cc",
		"#include <smmintrin.h>", "#endif");
	emcmake({
		outFile: "vendor/libjxl/lib/libjxl.a",
		src: "vendor/libjxl",
		options: {
			BUILD_SHARED_LIBS: 0,
			BUILD_TESTING: 0,
			JPEGXL_BUNDLE_LIBPNG: 0,
			JPEGXL_ENABLE_JPEGLI: 0,
			JPEGXL_ENABLE_SJPEG: 0,
			JPEGXL_ENABLE_JNI: 0,
			JPEGXL_ENABLE_MANPAGES: 0,
			JPEGXL_ENABLE_TOOLS: 0,
			JPEGXL_ENABLE_BENCHMARK: 0,
			JPEGXL_ENABLE_DOXYGEN: 0,
			JPEGXL_ENABLE_EXAMPLES: 0,
		},
	});
	const includes = [
		"-I vendor/libjxl/third_party/highway",
		"-I vendor/libjxl/lib/include",
		"vendor/libjxl/lib/libjxl.a",
		"vendor/libjxl/lib/libjxl_cms.a",
		"vendor/libjxl/third_party/brotli/libbrotlidec.a",
		"vendor/libjxl/third_party/brotli/libbrotlienc.a",
		"vendor/libjxl/third_party/brotli/libbrotlicommon.a",
		"vendor/libjxl/third_party/highway/libhwy.a",
	];
	includes.push("--emit-tsd jxl-enc.d.ts");
	emcc("cpp/jxl_enc.cpp", includes);
	includes.pop();
	includes.push("--emit-tsd jxl-dec.d.ts");
	emcc("cpp/jxl_dec.cpp", includes);
}

function buildAVIFPartial(isEncode) {
	const typeName = isEncode ? "enc" : "dec";
	emcmake({
		outFile: `vendor/aom/${typeName}-build/libaom.a`,
		src: "vendor/aom",
		dist: `vendor/aom/${typeName}-build`,
		options: {
			ENABLE_CCACHE: 0,
			AOM_TARGET_CPU: "generic",
			AOM_EXTRA_C_FLAGS: "-UNDEBUG",
			AOM_EXTRA_CXX_FLAGS: "-UNDEBUG",
			ENABLE_DOCS: 0,
			ENABLE_TESTS: 0,
			ENABLE_EXAMPLES: 0,
			ENABLE_TOOLS: 0,
			CONFIG_ACCOUNTING: 0,
			CONFIG_INSPECTION: 0,
			CONFIG_RUNTIME_CPU_DETECT: 0,
			CONFIG_WEBM_IO: 0,

			CONFIG_MULTITHREAD: 0,
			CONFIG_AV1_HIGHBITDEPTH: 1,

			CONFIG_AV1_ENCODER: isEncode,
			CONFIG_AV1_DECODER: 1 - isEncode,
		},
	});
	emcmake({
		outFile: `vendor/libavif/${typeName}-build/libavif.a`,
		src: "vendor/libavif",
		dist: `vendor/libavif/${typeName}-build`,
		options: {
			AVIF_ENABLE_EXPERIMENTAL_SAMPLE_TRANSFORM: 1,
			BUILD_SHARED_LIBS: 0,

			AVIF_CODEC_AOM: "SYSTEM",
			AOM_LIBRARY: `vendor/aom/${typeName}-build/libaom.a`,
			AOM_INCLUDE_DIR: "vendor/aom",

			AVIF_LIBYUV: "OFF",

			AVIF_LIBSHARPYUV: "SYSTEM",
			LIBSHARPYUV_LIBRARY: "vendor/libwebp/libsharpyuv.a",
			LIBSHARPYUV_INCLUDE_DIR: "vendor/libwebp",

			AVIF_CODEC_AOM_ENCODE: isEncode,
			AVIF_CODEC_AOM_DECODE: 1 - isEncode,
		},
	});
	emcc(`cpp/avif_${typeName}.cpp`, [
		"-I vendor/libavif/include",
		"vendor/libwebp/libsharpyuv.a",
		`vendor/aom/${typeName}-build/libaom.a`,
		`vendor/libavif/${typeName}-build/libavif.a`,
		`--emit-tsd avif-${typeName}.d.ts`,
	]);
}

export function buildAVIF() {
	buildWebPLibrary();
	buildAVIFPartial(1);
	buildAVIFPartial(0);
}

export function buildWebP2() {
	// libwebp2 does not provide a switch for imageio library.
	removeRange("vendor/libwebp2/CMakeLists.txt",
		"# build the imageio library", "\n# #######");
	emcmake({
		outFile: "vendor/wp2_build/libwebp2.a",
		src: "vendor/libwebp2",
		dist: "vendor/wp2_build",
		rtti: false,
		flags: "-DEMSCRIPTEN=" ,
		options: {
			WP2_BUILD_EXAMPLES: 0,
			WP2_BUILD_TESTS: 0,
			WP2_ENABLE_TESTS: 0,
			WP2_BUILD_EXTRAS: 0,
			WP2_ENABLE_SIMD: 1,
			WP2_ENABLE_SIMD_DEFAULT: 1,
			CMAKE_DISABLE_FIND_PACKAGE_Threads: 1,

			// Fails in vdebug.cc
			// WP2_REDUCED: 1,
		},
	});
	emcc("cpp/wp2_enc.cpp", [
		"-I vendor/libwebp2",
		"vendor/wp2_build/libwebp2.a",
		"--emit-tsd wp2-enc.d.ts",
	]);
	emcc("cpp/wp2_dec.cpp", [
		"-I vendor/libwebp2",
		"vendor/wp2_build/libwebp2.a",
		`--emit-tsd wp2-dec.d.ts`,
	]);
}

function buildHEICPartial(isEncode) {
	const typeName = isEncode ? "heic_enc" : "heic_dec";
	emcmake({
		outFile: `vendor/${typeName}/libheif/libheif.a`,
		src: "vendor/libheif",
		dist: "vendor/" + typeName,
		rtti: true,
		exceptions: false,
		flags: "-Dthrow= -DLIBHEIF_BOX_EMSCRIPTEN_H=",
		// flags: isEncode ? "-pthread" : "",
		// flags: "-D__EMSCRIPTEN_STANDALONE_WASM__=1",
		options: {
			CMAKE_DISABLE_FIND_PACKAGE_Doxygen: 1,
			WITH_AOM_DECODER: 0,
			WITH_AOM_ENCODER: 0,
			WITH_EXAMPLES: 0,
			WITH_GDK_PIXBUF: 0,
			ENABLE_MULTITHREADING_SUPPORT: 0,
			BUILD_TESTING: 0,
			BUILD_SHARED_LIBS: 0,
			ENABLE_PLUGIN_LOADING: 0,
			WITH_X265: isEncode,
			WITH_LIBDE265: !isEncode,
			WITH_OpenH264_DECODER: 0,
			WITH_X264: 0,

			...(isEncode ? {
				LIBSHARPYUV_INCLUDE_DIR: "vendor/libwebp",
				LIBSHARPYUV_LIBRARY: "vendor/libwebp/libsharpyuv.a",

				X265_INCLUDE_DIR: "vendor/x265/source",
				X265_LIBRARY: "vendor/x265/source/libx265.a",
			} : {
				LIBDE265_INCLUDE_DIR: "vendor/libde265",
				LIBDE265_LIBRARY: "vendor/libde265/libde265/libde265.a",
			}),
		},
	});
}

function buildHEIC() {
	// Must delete x265/source/CmakeLists.txt lines 240-248 for 32-bit build.
	if (!config.wasm64) {
		removeRange("vendor/x265/source/CmakeLists.txt",
			"\n    elseif(X86 AND NOT X64)", "\n    endif()");
	}

	buildWebPLibrary();
		execFileSync(
	"bash",
	["-lc", `
		git apply --check ../../patches/x265_fix.patch && git apply ../../patches/x265_fix.patch \
		|| git apply --check --reverse ../../patches/x265_fix.patch \
		|| (echo "Patch failed" && exit 1)
	`],
	{
		cwd: "vendor/x265",
		stdio: "inherit",
	}
	);	
	const x265Flags = [
				"pthread_create=gthread_create",
		"pthread_join=gthread_join",
		"pthread_cond_init=gthread_cond_init",
		"pthread_cond_destroy=gthread_cond_destroy",
				"pthread_cond_wait=gthread_cond_wait",

		"pthread_cond_broadcast=gthread_cond_broadcast",
		"pthread_cond_signal=gthread_cond_signal",
		"pthread_cond_timedwait=gthread_cond_timedwait",
	].map(flags => "-D" + flags).join(" ");
	const x265Options = {
		ENABLE_LIBNUMA: 0,
		ENABLE_SHARED: 0,
		ENABLE_CLI: 0,
		ENABLE_ASSEMBLY: 0,
		AARCH64_RUNTIME_CPU_DETECT: 0,
	};

	emcmake({
		outFile: "vendor/x265/12bit/libx265.a",
		src: "vendor/x265/source",
		dist: "vendor/x265/12bit",
		rtti: true,
		// flags: "-pthread",
		flags: x265Flags,
		options: {
			...x265Options,
			HIGH_BIT_DEPTH: 1,
			MAIN12: 1,
			EXPORT_C_API: 0,
		},
	});
	emcmake({
		outFile: "vendor/x265/10bit/libx265.a",
		src: "vendor/x265/source",
		dist: "vendor/x265/10bit",
				rtti: true,

		// flags: "-pthread",
				flags: x265Flags,

		options: {
			...x265Options,
			HIGH_BIT_DEPTH: 1,
			EXPORT_C_API: 0,
		},
	});
	emcmake({
		outFile: "vendor/x265/8bit/libx265.a",
		src: "vendor/x265/source",
		dist: "vendor/x265/8bit",
				rtti: true,

		// flags: "-pthread",
				flags: x265Flags,

		options: {
			...x265Options,
			LINKED_10BIT: 1,
			LINKED_12BIT: 1,
			EXTRA_LIB: "\"vendor/x265/10bit/libx265.a;vendor/x265/12bit/libx265.a\"",
			EXTRA_LINK_FLAGS:"\"-L. -lembind\"",
		},
	});
	
	removeRange("vendor/libde265/CMakeLists.txt", "#if !defined(__x86_64) && !defined(__i386__) ", "int main");
	emcmake({
		outFile: "vendor/libde265/libde265/libde265.a",
		src: "vendor/libde265",
		options: {
			BUILD_SHARED_LIBS: 0,
			ENABLE_SDL: 0,
			ENABLE_DECODER: 0,
		},
	});
	const mri = `
	CREATE vendor/x265/source/libx265.a
	ADDLIB vendor/x265/8bit/libx265.a
	ADDLIB vendor/x265/10bit/libx265.a
	ADDLIB vendor/x265/12bit/libx265.a
	SAVE
	END
	`;	
	execFileSync("emar", ["-M"], { 
			input: mri, 
			stdio: ["pipe", "inherit", "inherit"],
		}
	);
	copyFileSync("vendor/x265/8bit/x265_config.h", "vendor/x265/source/x265_config.h")
	buildHEICPartial(true);
// CROSS_ORIGIN
	// config.debug = true
	emcc("cpp/heic_enc.cpp", [
		"-I vendor/heic_enc",
		"-I vendor/libheif/libheif/api",
		 "-sRETAIN_COMPILER_SETTINGS=1",
		"-sASYNCIFY_ADD=\"heif_context_encode_image,green_thread_entry(*),gthread_cond_wait,gthread_join,gthread_cond_timedwait,*ThreadShim(*)\"",
		"-fno-exceptions",
		"-sASYNCIFY=1",

// "-sSTACK_SIZE=10MB",
		// "-Wl,--allow-multiple-definition", // our pthread impls override library_pthread_stub.o
		"vendor/libwebp/libsharpyuv.a",
		"vendor/x265/source/libx265.a",
		"vendor/heic_enc/libheif/libheif.a",
		"--emit-tsd heic-enc.d.ts",
	]);
	// config.debug = false
	buildHEICPartial(false);


	emcc("cpp/heic_dec.cpp", [
		// "-s", "ENVIRONMENT=web",
		"-I vendor/heic_dec",
		"-I vendor/libheif/libheif/api",
		"-fno-exceptions",
		"vendor/libde265/libde265/libde265.a",
		"vendor/heic_dec/libheif/libheif.a",
		"--emit-tsd heic-dec.d.ts",
	]);

	// fixPThreadImpl("dist/heic-enc.js", 1);
}

function buildVVIC() {
	buildWebPLibrary();
	execFileSync(
	"bash",
	["-lc", `
		git apply --check ../../patches/vvdec.patch && git apply ../../patches/vvdec.patch \
		|| git apply --check --reverse ../../patches/vvdec.patch \
		|| (echo "Patch failed" && exit 1)
	`],
	{
		cwd: "vendor/vvdec",
		stdio: "inherit",
	}
	);	
	// // If build failed, try to delete "use ccache" section in CMakeLists.txt
	// // removeRange("vendor/vvdec/CMakeLists.txt", "\n# use ccache", "\n\n");
	// // removeRange("vendor/vvdec/source/Lib/vvdec/wasm_bindings.cpp", "\n#ifdef __EMSCRIPTEN__", "  // __EMSCRIPTEN__\n\n");
	// // removeRange("vendor/vvdec/")
	emcmake({
		outFile: `vendor/vvdec/lib/libvvdec.a`,
		src: "vendor/vvdec",
		exceptions: true,
		rtti: true,
		options: {
			VVDEC_ENABLE_X86_SIMD:1,
			VVDEC_ENABLE_ARM_SIMD: 1,
			VVDEC_LIBRARY_ONLY: 1,
			BUILD_SHARED_LIBS: 0,
			VVDEC_ENABLE_LINK_TIME_OPT: config.debug ? 0 : 1,
			VVDEC_INSTALL_VVDECAPP: 0,
			VVDEC_TOPLEVEL_OUTPUT_DIRS: 0,
			VVDEC_ENABLE_WERROR: 0,
			CMAKE_INSTALL_PREFIX: "vendor/vvic_build",

		}
	});

	// // removeRange("vendor/vvenc/CMakeLists.txt", "\n# use ccache", "\n\n");
	emcmake({
		outFile: `vendor/vvenc/lib/libvvenc.a`,
		src: "vendor/vvenc",
		exceptions: true,
		rtti: true,
		options: {
			// Some instructions are not supported in WASM.
			VVENC_ENABLE_X86_SIMD: 1,
			BUILD_SHARED_LIBS: 0,
			VVENC_ENABLE_INSTALL: 1,
			VVENC_ENABLE_THIRDPARTY_JSON: 0,
			VVENC_ENABLE_ARM_SIMD: 1,
			VVENC_LIBRARY_ONLY: 1,
			VVENC_TOPLEVEL_OUTPUT_DIRS: 0,
			VVENC_ENABLE_LINK_TIME_OPT: config.debug ? 0 : 1,
			CMAKE_INSTALL_PREFIX: "vendor/vvic_build",
		},
	});
	execFileSync("cmake", ["--install", "."], { cwd: "vendor/vvenc", stdio: "inherit" });
	execFileSync("cmake", ["--install", "."], { cwd: "vendor/vvdec", stdio: "inherit" });
	execFileSync(
	"bash",
	["-lc", `
		git apply --check ../../patches/heif_vvc_single_thread.patch && git apply ../../patches/heif_vvc_single_thread.patch \
		|| git apply --check --reverse ../../patches/heif_vvc_single_thread.patch \
		|| (echo "Patch failed" && exit 1)
	`],
	{
		cwd: "vendor/libheif",
		stdio: "inherit",
	}
	);	
	emcmake({
		outFile: "vendor/libheif_vvdec/libheif/libheif.a",
		src: "vendor/libheif",
		dist: "vendor/libheif_vvdec",
		flags: "-DLIBHEIF_BOX_EMSCRIPTEN_H= -Dthrow=",
		rtti: true,
		exceptions: false,
		options: {
			CMAKE_DISABLE_FIND_PACKAGE_Doxygen: 1,
			WITH_AOM_DECODER: 0,
			WITH_AOM_ENCODER: 0,
			WITH_X265: 0,
			WITH_LIBDE265: 0,
			WITH_EXAMPLES: 0,
			WITH_GDK_PIXBUF: 0,
			ENABLE_MULTITHREADING_SUPPORT: 0,
			BUILD_TESTING: 0,
			BUILD_SHARED_LIBS: 0,
			ENABLE_PLUGIN_LOADING: 0,
			// LIBSHARPYUV_INCLUDE_DIR: "vendor/libwebp",
			// LIBSHARPYUV_LIBRARY: "vendor/libwebp/libsharpyuv.a",

			WITH_VVENC: 0,
			WITH_VVDEC: 1,
			WITH_X264:0,
			vvenc_DIR: `${process.cwd()}/vendor/vvic_build/lib/cmake/vvenc`,
			vvdec_DIR: `${process.cwd()}/vendor/vvic_build/lib/cmake/vvdec`,
		},
	});
	emcmake({
		outFile: "vendor/libheif_vvenc/libheif/libheif.a",
		src: "vendor/libheif",
		dist: "vendor/libheif_vvenc",
		flags: "-DLIBHEIF_BOX_EMSCRIPTEN_H= -Dthrow=",
		rtti: true,
		exceptions: false,
		options: {
			CMAKE_DISABLE_FIND_PACKAGE_Doxygen: 1,
			WITH_AOM_DECODER: 0,
			WITH_AOM_ENCODER: 0,
			WITH_X265: 0,
			WITH_LIBDE265: 0,
			WITH_EXAMPLES: 0,
			WITH_GDK_PIXBUF: 0,
			ENABLE_MULTITHREADING_SUPPORT: 0,
			BUILD_TESTING: 0,
			BUILD_SHARED_LIBS: 0,
			ENABLE_PLUGIN_LOADING: 0,
			LIBSHARPYUV_INCLUDE_DIR: "vendor/libwebp",
			LIBSHARPYUV_LIBRARY: "vendor/libwebp/libsharpyuv.a",

			WITH_VVENC: 1,
			WITH_VVDEC: 0,
			WITH_X264:0,
			vvenc_DIR: `${process.cwd()}/vendor/vvic_build/lib/cmake/vvenc`,
			vvdec_DIR: `${process.cwd()}/vendor/vvic_build/lib/cmake/vvdec`,
		},
	});
	emcc("cpp/vvic_enc.cpp", [
		"-I vendor/libheif_vvenc",
		"-I vendor/libheif/libheif/api",
		// "-pthread",
		// "-fexceptions",
		"-fwasm-exceptions",
		// "-sWASM_EXCEPTIONS=1",
		"vendor/libheif_vvenc/libheif/libheif.a",
		"vendor/vvic_build/lib/libvvenc.a",
		// "vendor/vvic_build/lib/libvvdec.a",
		"vendor/libwebp/libsharpyuv.a",
		"--emit-tsd vvic-enc.d.ts",
	]);
	emcc("cpp/vvic_dec.cpp", [
		"-I vendor/libheif_vvdec",
		"-I vendor/libheif/libheif/api",
		// "-pthread",
		// "-fexceptions",
		"-fwasm-exceptions",
		// "-sWASM_EXCEPTIONS=1",
		"vendor/libheif_vvdec/libheif/libheif.a",
		// "vendor/vvic_build/lib/libvvenc.a",
		"vendor/vvic_build/lib/libvvdec.a",
		// "vendor/libwebp/libsharpyuv.a",
		"--emit-tsd vvic-dec.d.ts",
	]);
}

repositories.download();

// To update a module, delete the directory then build.
if (process.argv[2] === "update") {
	await repositories.checkUpdate();
} else {
	config.updateFromArgs(argv.slice(2));
	mkdirSync(config.outDir, { recursive: true });

	buildWebP();
	buildAVIF();
	buildJXL();
	buildQOI();
	buildMozJPEG();
	buildWebP2();
	buildHEIC();
	buildPNGQuant();
	buildVVIC();
	repositories.writeVersionsJSON();
}
