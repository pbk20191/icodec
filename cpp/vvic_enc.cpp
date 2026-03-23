#include <string>
#include <emscripten/bind.h>
#include "icodec.h"
#include "libheif/heif.h"
#include <emscripten/console.h>
#include <emscripten/emscripten.h>

thread_local val jsError = val::global("Error");

static __inline__ val makeError(heif_error& err) {
	std::string t = "";
	if (err.message && *err.message) {
		t = std::string(err.message);
	} else {
		t = "Unknown error";
	}
	val error = jsError.new_(t);
	error.set("code", (int)err.code);
	error.set("subcode", (int)err.subcode);
	emscripten_log(EM_LOG_CONSOLE, "Error: %s", t.c_str());
	return error;
}


struct VvicOptions
{
	int quality;
	bool lossless;
	int bitDepth;
};


val encode(std::string pixels, int width, int height, VvicOptions options)
{
	heif_error err = heif_error_success;
	heif_image* image_ptr;
	// emscripten_log(EM_LOG_CONSOLE, "HEIC encode start %d %d %d", width, height, options.bitDepth);
	err = heif_image_create(width, height, heif_colorspace_RGB, options.bitDepth == 8
		? heif_chroma_interleaved_RGBA
		: heif_chroma_interleaved_RRGGBBAA_LE, &image_ptr);
	if (err.code != heif_error_Ok) {
		return makeError(err);
	}

	auto image = toRAII(image_ptr, heif_image_release);
	// heif_context_add
	err = heif_image_add_plane(image.get(), heif_channel_interleaved, width, height, options.bitDepth);
	if (err.code != heif_error_Ok) {
		return makeError(err);
	}

	// Planes can have padding, so we need copy the data by row.
	int row_bytes = width * CHANNELS_RGBA * ((options.bitDepth + 7) / 8);
	size_t stride;
	
	uint8_t *p = heif_image_get_plane2(image.get(), heif_channel_interleaved, &stride);
	// emscripten_log(EM_LOG_CONSOLE, "HEIC image plane stride: %zu %zu", stride, width * 4);
	if (stride == width * 4) {
		memcpy(p, &pixels, width * height * 4);
	} else {
		for (auto y = 0; y < height; y++)
		{
			memcpy(p + stride * y, &pixels[row_bytes * y], stride);
		}
	}

	heif_encoder* encoder_ptr;
    err = heif_context_get_encoder_for_format(nullptr, heif_compression_VVC, &encoder_ptr);
    if (err.code != heif_error_Ok) {
		return makeError(err);
	}
	auto encoder = toRAII(encoder_ptr, heif_encoder_release);
	err = heif_encoder_set_lossy_quality(encoder.get(), options.quality);
	if (err.code != heif_error_Ok) {
		return makeError(err);
	}
	err = heif_encoder_set_lossless(encoder.get(), options.lossless);
	if (err.code != heif_error_Ok) {
		return makeError(err);
	}
	
	auto context = toRAII(heif_context_alloc(), heif_context_free);
	auto config = toRAII(heif_encoding_options_alloc(), heif_encoding_options_free);

	if (options.lossless)
	{
		auto nclx = toRAII(heif_nclx_color_profile_alloc(), heif_nclx_color_profile_free);
		nclx->matrix_coefficients = heif_matrix_coefficients_RGB_GBR;
		config.get()->output_nclx_profile = nclx.get();	
		err = heif_context_encode_image(context.get(), image.get(), encoder.get(), config.get(), nullptr);
		if (err.code != heif_error_Ok) {
			return makeError(err);
		}
	} else {
		err = heif_context_encode_image(context.get(), image.get(), encoder.get(), config.get(), nullptr);
		if (err.code != heif_error_Ok) {
			return makeError(err);
		}
	}
	heif_writer writer;
	val slot;// = val::undefined();
	writer.write = [] (heif_context* ctx, const void* data, size_t size, void* userdata) -> heif_error {
		val& slot = *static_cast<val*>(userdata);
		slot = toUint8Array((const uint8_t*)data, size);;
		return heif_error_success;
	};
	writer.writer_api_version = 1;
	heif_context_write(context.get(), &writer, &slot);
	return slot;
	// if (options.sharpYUV)
	// {
	// 	config.color_conversion_options.only_use_preferred_chroma_algorithm = true;
	// 	config.color_conversion_options.preferred_chroma_downsampling_algorithm = heif_chroma_downsampling_sharp_yuv;
	// }

	// // Must set `matrix_coefficients=0` for exact lossless.
	// // https://github.com/strukturag/libheif/pull/1039#issuecomment-1866023028
	// if (options.lossless && options.chroma == "444")
	// {
	// 	auto nclx = heif_nclx_color_profile_alloc();
	// 	nclx->matrix_coefficients = heif_matrix_coefficients_RGB_GBR;
	// 	config.output_nclx_profile = nclx;

	// 	context.encode_image(image, encoder, config);
	// 	heif_nclx_color_profile_free(nclx);
	// }
	// else
	// {
	// 	context.encode_image(image, encoder, config);
	// }

}


EMSCRIPTEN_BINDINGS(icodec_module_VVIC_Encode)
{
	// function("decode", &decode);

		function("encode", &encode);

	value_object<VvicOptions>("VvicOptions")
		.field("lossless", &VvicOptions::lossless)
		.field("bitDepth", &VvicOptions::bitDepth)
		.field("quality", &VvicOptions::quality);
}
