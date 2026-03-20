#include <string>
#include <emscripten/bind.h>
#include "icodec.h"
#include "libheif/heif.h"
#include <memory>

thread_local val jsError = val::global("Error");

static __inline__ val makeError(heif_error& err) {
	auto t = std::string(err.message);
	val error = jsError.new_(t);
	error.set("code", (int)err.code);
	error.set("subcode", (int)err.subcode);
	return error;
}

/**
 * HEIC decode from memory. Implementation reference:
 * https://github.com/saschazar21/webassembly/blob/main/packages/heif/main.cpp
 */
val decode(std::string input)
{
	heif_error err = heif_error_success;
	auto ctx = toRAII(heif_context_alloc(), heif_context_free);
	err = heif_context_read_from_memory_without_copy(
		ctx.get(),
		input.c_str(), input.length(), nullptr
	);
	if (err.code != heif_error_Ok) {
		return makeError(err);
	}
	heif_image_handle* _raw_handle = nullptr;
	err = heif_context_get_primary_image_handle(ctx.get(), &_raw_handle);
	if (err.code != heif_error_Ok) {
		return makeError(err);
	}
	auto handle = toRAII(_raw_handle, heif_image_handle_release);

	
	auto bitDepth = heif_image_handle_get_luma_bits_per_pixel(handle.get());
	heif_image* _raw_image = nullptr;
	err = heif_decode_image(
		handle.get(), &_raw_image, heif_colorspace_RGB, bitDepth == 8
		? heif_chroma_interleaved_RGBA
		: heif_chroma_interleaved_RRGGBBAA_LE, nullptr
	);
	if (err.code != heif_error_Ok) {
		return makeError(err);
	}
	auto image = toRAII(_raw_image, heif_image_release);
	

	auto width = heif_image_handle_get_width(handle.get());
	auto height = heif_image_handle_get_height(handle.get());
	int stride;
	
	auto p = heif_image_get_plane(image.get(), heif_channel_interleaved, &stride);;

	auto row_bytes = width * CHANNELS_RGBA * ((bitDepth + 7) / 8);
	auto rgba = std::make_unique_for_overwrite<uint8_t[]>(row_bytes * height);
	for (auto y = 0; y < height; y++)
	{
		memcpy(&rgba[row_bytes * y], p + stride * y, row_bytes);
	}

	return toImageData(rgba.get(), (uint32_t)width, (uint32_t)height, (uint32_t)bitDepth);
}

EMSCRIPTEN_BINDINGS(icodec_module_HEIC)
{
	function("decode", &decode);
}
