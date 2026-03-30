#include <string>
#include <emscripten/bind.h>
#include "icodec.h"
#include "libheif/heif.h"
#include <emscripten/console.h>
#include <emscripten/emscripten.h>

struct HeicOptions
{
	int quality;
	bool lossless;
	std::string preset;
	std::string tune;
	int tuIntraDepth;
	int complexity;
	std::string chroma;
	bool sharpYUV;

	int bitDepth;
};


thread_local val jsError = val::global("Error");

static __inline__ val makeError(heif_error& err) {
	auto t = std::string(err.message);
	val error = jsError.new_(t);
	error.set("code", (int)err.code);
	error.set("subcode", (int)err.subcode);
	return error;
}


/**
 * HEIC encode. Implementation reference:
 * https://github.com/strukturag/libheif/blob/master/examples/decoder_png.cc
 * https://github.com/strukturag/libheif/blob/master/examples/heif_enc.cc
 */
void encode(std::string pixels, int width, int height, HeicOptions options, val returnBuffer)
{
	heif_error err = heif_error_success;
	heif_image* image_ptr;
	// emscripten_log(EM_LOG_CONSOLE, "HEIC encode start %d %d %d", width, height, options.bitDepth);
	err = heif_image_create(width, height, heif_colorspace_RGB, options.bitDepth == 8
		? heif_chroma_interleaved_RGBA
		: heif_chroma_interleaved_RRGGBBAA_LE, &image_ptr);
	if (err.code != heif_error_Ok) {
		returnBuffer.set("error",makeError(err));
		return;
	}
	
	auto image = toRAII(image_ptr, heif_image_release);
	// heif_context_add
	err = heif_image_add_plane(image.get(), heif_channel_interleaved, width, height, options.bitDepth);
	if (err.code != heif_error_Ok) {
		returnBuffer.set("error",makeError(err));
		return;
	}

	// Planes can have padding, so we need copy the data by row.
	int row_bytes = width * CHANNELS_RGBA * ((options.bitDepth + 7) / 8);
	size_t stride;
	
	uint8_t *p = heif_image_get_plane2(image.get(), heif_channel_interleaved, &stride);
	// emscripten_log(EM_LOG_CONSOLE, "HEIC image plane stride: %zu %zu", stride, width * 4);
	if (stride == static_cast<size_t>(row_bytes)) {
        memcpy(p, pixels.data(), static_cast<size_t>(row_bytes) * height);
	} else {
        for (int y = 0; y < height; y++) {
            memcpy(
                p + stride * y,
                reinterpret_cast<const uint8_t*>(pixels.data()) + static_cast<size_t>(row_bytes) * y,
                row_bytes
            );
        }
	}


	// libheif does not automitic adjust chroma for lossless.
	if (options.lossless)
	{
		options.chroma = "444";
	}
    heif_encoder* encoder_ptr;
    err = heif_context_get_encoder_for_format(nullptr, heif_compression_HEVC, &encoder_ptr);
    if (err.code != heif_error_Ok) {
		// image.reset();
	// 	auto t = std::string(err.message);
	// val error = jsError.new_(t);
	// error.set("code", err.code);
	// error.set("subcode", err.subcode);
		returnBuffer.set("error",makeError(err));
		return;
    }

	auto encoder = toRAII(encoder_ptr, heif_encoder_release);
	err = heif_encoder_set_lossy_quality(encoder.get(), options.quality);
	if (err.code != heif_error_Ok) {
		// image.reset();
		// encoder.reset();

		returnBuffer.set("error",makeError(err));
		return;
	}
	err = heif_encoder_set_lossless(encoder.get(), options.lossless);
	if (err.code != heif_error_Ok) {
		// image.reset();
		// encoder.reset();

		returnBuffer.set("error",makeError(err));
		return;
	}
	// encoder.set_lossy_quality(options.quality);
	// encoder.set_lossless(options.lossless);
	// encoder.set_string_parameter("preset", options.preset);
	err = heif_encoder_set_parameter_string(encoder.get(), "preset", options.preset.c_str());
	if (err.code != heif_error_Ok) {
		// image.reset();
		// encoder.reset();
		returnBuffer.set("error",makeError(err));
		return;
	}
	// encoder.set_string_parameter("tune", options.tune);
	err = heif_encoder_set_parameter_string(encoder.get(), "tune", options.tune.c_str());
	if (err.code != heif_error_Ok) {
		// image.reset();
		// encoder.reset();
		returnBuffer.set("error",makeError(err));
		return;
	}
	err = heif_encoder_set_parameter_integer(encoder.get(), "tu-intra-depth", options.tuIntraDepth);
	if (err.code != heif_error_Ok) {
		// image.reset();
		// encoder.reset();
		returnBuffer.set("error",makeError(err));
		return;
	}
	err = heif_encoder_set_parameter_integer(encoder.get(), "complexity", options.complexity);
	if (err.code != heif_error_Ok) {
		// image.reset();
		// encoder.reset();
		returnBuffer.set("error",makeError(err));
		return;
	}
	err = heif_encoder_set_parameter_string(encoder.get(), "chroma", options.chroma.c_str());
	if (err.code != heif_error_Ok) {
		// image.reset();
		// encoder.reset();
		returnBuffer.set("error",makeError(err));
		return;
	}
	#ifndef __EMSCRIPTEN_PTHREADS__
	err = heif_encoder_set_parameter_string(encoder.get(), "x265:frame-threads","1");
	if (err.code != heif_error_Ok) {
		// image.reset();
		// encoder.reset();
		returnBuffer.set("error",makeError(err));
		return;
	}
	err = heif_encoder_set_parameter_string(encoder.get(), "x265:pools", "-");
	if (err.code != heif_error_Ok) {
		// image.reset();
		// encoder.reset();
		returnBuffer.set("error",makeError(err));
		return;
	}
	
	// err = heif_encoder_set_logging_level(encoder.get(), 4);
	// if (err.code != heif_error_Ok) {
	// 	returnBuffer.set("error",makeError(err));
	// 	return;
	// }
	#endif

	auto context = toRAII(heif_context_alloc(), heif_context_free);
	auto config = toRAII(heif_encoding_options_alloc(), heif_encoding_options_free);

	if (options.sharpYUV)
	{
		
		config.get()->color_conversion_options.only_use_preferred_chroma_algorithm = true;
		config.get()->color_conversion_options.preferred_chroma_downsampling_algorithm = heif_chroma_downsampling_sharp_yuv;
	}

	// Must set `matrix_coefficients=0` for exact lossless.
	// https://github.com/strukturag/libheif/pull/1039#issuecomment-1866023028

	if (options.lossless)
	{
		auto nclx = toRAII(heif_nclx_color_profile_alloc(), heif_nclx_color_profile_free);
		nclx->matrix_coefficients = heif_matrix_coefficients_RGB_GBR;
		config.get()->output_nclx_profile = nclx.get();	

		err = heif_context_encode_image(context.get(), image.get(), encoder.get(), config.get(), nullptr);
			// emscripten_log(EM_LOG_CONSOLE, "HEIC encode done");
		if (err.code != heif_error_Ok) {
			image.reset();
			encoder.reset();
			context.reset();
			config.reset();


		returnBuffer.set("error",makeError(err));
		return;
		}
		// context.encode_image(image, encoder, config);
		// heif_nclx_color_profile_free(nclx);
	}
	else
	{
			// emscripten_log(EM_LOG_CONSOLE, "HEIC encode start");

		err = heif_context_encode_image(context.get(), image.get(), encoder.get(), config.get(), nullptr);
			// emscripten_log(EM_LOG_CONSOLE, "HEIC encode done");
		// return val::undefined();

		if (err.code != heif_error_Ok) {
			image.reset();
			encoder.reset();
			context.reset();
			config.reset();


		returnBuffer.set("error",makeError(err));
		return;
		}
	}
	// emscripten_log(EM_LOG_CONSOLE, "HEIC encode done, starting to write context");
	heif_writer writer;
	val slot;// = val::undefined();
	writer.write = [] (heif_context* ctx, const void* data, size_t size, void* userdata) -> heif_error {
		val& slot = *static_cast<val*>(userdata);
		slot = toUint8Array((const uint8_t*)data, size);;
		return heif_error_success;
	};
	writer.writer_api_version = 1;
	heif_context_write(context.get(), &writer, &slot);
	// emscripten_log(EM_LOG_CONSOLE, "HEIC encode done, size: %zu", slot["byteLength"].as<size_t>());
	image.reset();
	encoder.reset();
	context.reset();
	config.reset();
		returnBuffer.set("success",slot);

	// return resolvedValue(slot);
}

EMSCRIPTEN_BINDINGS(icodec_module_HEIC)
{
	function("encode", &encode);

	value_object<HeicOptions>("HeicOptions")
		.field("lossless", &HeicOptions::lossless)
		.field("quality", &HeicOptions::quality)
		.field("preset", &HeicOptions::preset)
		.field("tune", &HeicOptions::tune)
		.field("tuIntraDepth", &HeicOptions::tuIntraDepth)
		.field("complexity", &HeicOptions::complexity)
		.field("chroma", &HeicOptions::chroma)
		.field("sharpYUV", &HeicOptions::sharpYUV)
		.field("bitDepth", &HeicOptions::bitDepth);
}




#if !defined(__EMSCRIPTEN_PTHREADS__) && defined(__EMSCRIPTEN__)

#include <emscripten/fiber.h>
#include <pthread.h>
#include <semaphore.h>
#include <cerrno>
#include <cstring>
#include <cstdlib>
#include <emscripten/console.h>
#include <emscripten/emscripten.h>
#include <algorithm>
#include <deque>
#include <vector>

// Requires -sASYNCIFY (fiber stack switching).

static constexpr size_t GREEN_C_STACK_SIZE = 8192;
// static constexpr size_t GREEN_ASYNCIFY_STACK_SIZE = 1024;

struct GreenThread
{
	emscripten_fiber_t fiber;
	alignas(16) std::vector<char> c_stack;
	std::vector<char> asyncify_stack;
	void *(*start)(void *);
	void *arg;
	void *retval;
	bool finished;
	bool queued;
	std::vector<GreenThread*> join_waiters;

	GreenThread(void *(*entry)(void *), void *entry_arg)
		: c_stack(GREEN_C_STACK_SIZE),
		  asyncify_stack(ASYNCIFY_STACK_SIZE),
		  start(entry),
		  arg(entry_arg),
		  retval(nullptr),
		  finished(false),
		  queued(false)
	{}
};



thread_local GreenThread g_main_thread = GreenThread(nullptr, nullptr);
// thread_local std::set<GreenThread*> pending_threads;
thread_local GreenThread* g_current_thread = nullptr;
thread_local std::deque<GreenThread*> g_ready_queue;

static inline bool ensure_main_thread() {
	if (g_main_thread.fiber.stack_base == nullptr) {
		
		g_main_thread.asyncify_stack.resize(0);
	}
	auto test = g_current_thread == nullptr;
	// if (g_current_thread == nullptr) {
	// 	g_current_thread = &g_main_thread;
	// }
	return test;
}

static inline void enqueue_thread(GreenThread* thread) {
	if (!thread || thread->finished || thread->queued) {
		return;
	}
	thread->queued = true;
	g_ready_queue.push_back(thread);
}

static inline GreenThread* dequeue_next_runnable() {
	while (!g_ready_queue.empty()) {
		GreenThread* next = g_ready_queue.front();

		g_ready_queue.pop_front();
		// if (next == pthread_self()) {
		// 	return next;
		// }
		next->queued = false;
		if (!next->finished) {
			return next;
		}
	}
	return nullptr;
}


static inline void block_current_and_dispatch() {
	auto is_main_thread = g_current_thread == nullptr;
	GreenThread* old = g_current_thread;

	GreenThread* next = dequeue_next_runnable();
	if (next) {
		if (next == old) {
			// emscripten_log(EM_LOG_CONSOLE, "block_current_and_dispatch failed worker ");

			return;
		}
		if (next == &g_main_thread && is_main_thread) {
			// emscripten_log(EM_LOG_CONSOLE, "block_current_and_dispatch failed main ");
			return;
		}
	}
	if (next) {
		g_current_thread = next;
		if (is_main_thread) {
			ensure_main_thread();
			emscripten_fiber_init_from_current_context(
				&g_main_thread.fiber,
				g_main_thread.c_stack.data(),
				g_main_thread.c_stack.size()
			);
			g_current_thread = next;
			// emscripten_log(EM_LOG_CONSOLE, "block_current_and_dispatch main to worker");

			emscripten_fiber_swap(&g_main_thread.fiber, &next->fiber);
			// emscripten_log(EM_LOG_CONSOLE, "block_current_and_dispatch main to worker returned");

			g_current_thread = nullptr;
			g_main_thread.fiber = {};
			g_main_thread.fiber.stack_base = nullptr;


		} else {
			if (next == &g_main_thread) {

				g_current_thread = nullptr;
				if (old == &g_main_thread) {
					std::abort();
					return;
				}
				emscripten_fiber_swap(&old->fiber, &g_main_thread.fiber);
			} else {
				g_current_thread = next;
				emscripten_fiber_swap(&old->fiber, &next->fiber);
			}
		}
		return;
	} else {
		std::abort();
		// if (!is_main_thread) {
		// 	enqueue_thread(&g_main_thread);
		// }
		return;
		// if (is_main_thread) {
		// 	// No runnable threads, but we're the main thread, so just return to the event loop.
		// 	return;
		// } else {
		// 	emscripten_fiber_swap(&g_current_thread->fiber, &g_main_thread.fiber);
		// }
	}
}

[[noreturn]] static void green_thread_entry(void* arg) {
	GreenThread* thread = static_cast<GreenThread*>(arg);
	
	thread->retval = thread->start(thread->arg);
	thread->finished = true;
	// emscripten_log(EM_LOG_CONSOLE, "green_thread_entry: thread %p finished with retval %p", thread, thread->retval);
	for (GreenThread* waiter : thread->join_waiters) {
		enqueue_thread(waiter);
	}
	thread->join_waiters.clear();

	GreenThread* next = dequeue_next_runnable();
	// emscripten_log(EM_LOG_CONSOLE, "green_thread_entry: thread %p exiting, next runnable thread is %p", thread, next);

	if (next && next != &g_main_thread) {
		g_current_thread = next;

		emscripten_fiber_swap(&thread->fiber, &next->fiber);
	} else {
		for (GreenThread* waiter : thread->join_waiters) {
			enqueue_thread(waiter);
		}
		thread->join_waiters.clear();
		g_current_thread = nullptr;
		// emscripten_log(EM_LOG_CONSOLE, "green_thread_entry: thread %p exiting to main thread", thread);
		emscripten_fiber_swap(&thread->fiber, &g_main_thread.fiber);
	}
	for (GreenThread* waiter : thread->join_waiters) {
		enqueue_thread(waiter);
	}
	thread->join_waiters.clear();
	//std::abort();
}

static double timespec_diff_ms(const struct timespec* a,
                               const struct timespec* b) {
  long long sec  = (long long)a->tv_sec  - (long long)b->tv_sec;
  long long nsec = (long long)a->tv_nsec - (long long)b->tv_nsec;
  long long total_ns = sec * 1000000000LL + nsec;
  if (total_ns <= 0) return 0.0;
  return (double)total_ns / 1e6;
}

// pthread_cond_timedwait() abstime -> emscripten_set_timeout() delay(ms)
static double abstime_to_timeout_ms_realtime(const struct timespec* abstime) {
  struct timespec now;
  clock_gettime(CLOCK_REALTIME, &now);
  return timespec_diff_ms(abstime, &now);
}


// Condition variable state: a GreenCond* stored in the first bytes of pthread_cond_t.
// pthread_cond_t is large enough (>=sizeof(void*)) and zero-init acts as "not yet created".
struct GreenCond
{
	std::vector<GreenThread*> waiters;

};

static_assert(sizeof(pthread_cond_t) >= sizeof(void*), "pthread_cond_t must be large enough to store a pointer");	

extern "C" {

int gthread_create(pthread_t *thread, const pthread_attr_t *, void *(*start)(void *), void *arg)
{
	// ensure_main_thread();
	GreenThread *t = new GreenThread(start, arg);
	const long size = 2 * 1024 * 1024;//emscripten_get_compiler_setting("STACK_SIZE");
	t->c_stack.resize(size);
	t->asyncify_stack.resize(ASYNCIFY_STACK_SIZE);
	emscripten_fiber_init(
		&t->fiber,
		green_thread_entry,
		t,
		t->c_stack.data(),
		t->c_stack.size(),
		t->asyncify_stack.data(),
		t->asyncify_stack.size()
	);
	// worker_thread = t;
	enqueue_thread(t);
	// enqueue_thread(&g_main_thread);
	// emscripten_log(EM_LOG_CONSOLE, "pthread_create: created green fiber %p", t);
	*thread = reinterpret_cast<pthread_t>(t);
	return 0;
}

int gthread_join(pthread_t thread, void **retval)
{

	GreenThread *t = reinterpret_cast<GreenThread *>(thread);
	if (!t) {
		return EINVAL;
	}
	bool is_main_thread = g_current_thread == nullptr;
	if (g_current_thread == t || pthread_self() == thread) {
		return EDEADLK;
	}
	// if (g_current_thread == nullptr) {
	// }
	// emscripten_log(EM_LOG_CONSOLE, "pthread_join: waiting green fiber %p", t);
	if (!t->finished) {
		if (is_main_thread) {
			// emscripten_log(EM_LOG_CONSOLE, "pthread_join: main thread is waiting, running other fibers until the target finishes");
			
			while (!t->finished) {
				GreenThread* next = dequeue_next_runnable();
				if (!next) {
					// emscripten_log(EM_LOG_CONSOLE, "pthread_join: no runnable fibers, waiting for events");
					g_main_thread.fiber = {};
					g_main_thread.fiber.stack_base = nullptr;

					return EDEADLK;
				} else {
					if (next == &g_main_thread) {
						g_current_thread = nullptr;
						g_main_thread.fiber = {};
						g_main_thread.fiber.stack_base = nullptr;

						return EDEADLK;
					} else {
						g_current_thread = next;
						ensure_main_thread();
						emscripten_fiber_init_from_current_context(
							&g_main_thread.fiber,
							g_main_thread.c_stack.data(),
							g_main_thread.c_stack.size()
						);
						emscripten_fiber_swap(&g_main_thread.fiber, &next->fiber);
						// emscripten_log(EM_LOG_CONSOLE | EM_LOG_C_STACK, "pthread_join: main_thread switched back from fiber %p", next);

						g_current_thread = nullptr;
						g_main_thread.fiber = {};
						g_main_thread.fiber.stack_base = nullptr;

					}
				}
			}
		} else {
			t->join_waiters.push_back(g_current_thread);
			GreenThread* old = g_current_thread;
			g_current_thread = t;

			emscripten_fiber_swap(&old->fiber, &t->fiber);
		}
	}
	// worker_thread = nullptr;
	if (retval) *retval = t->retval;
	delete t;
	return 0;
}



// int pthread_mutex_init(pthread_mutex_t *, const pthread_mutexattr_t *) {
// 		emscripten_log(EM_LOG_CONSOLE, "pthread_mutex_init: initializing green thread ");

// 	 return 0;
// 	 }
// int  pthread_mutex_destroy(pthread_mutex_t *) { emscripten_log(EM_LOG_CONSOLE, "pthread_mutex_destroy: destroying green thread "); return 0; }
// int pthread_mutex_lock(pthread_mutex_t *) { 
// 			emscripten_log(EM_LOG_CONSOLE, "pthread_mutex_lock: locking green thread");

// 	return 0; }
// int pthread_mutex_unlock(pthread_mutex_t *) { emscripten_log(EM_LOG_CONSOLE, "pthread_mutex_unlock: unlocking green thread "); return 0; }
// int pthread_mutexattr_destroy(pthread_mutexattr_t *) { return 0; }

int gthread_cond_init(pthread_cond_t *cond, const pthread_condattr_t *)
{
	// cond->__data[0] = 0; // zero-init means "not yet created"
	GreenCond *g_cond = new GreenCond();

	GreenCond **p = reinterpret_cast<GreenCond **>(cond);
	*p = g_cond;
	// emscripten_log(EM_LOG_CONSOLE, "pthread_cond_init: %p", *p);

	return 0;
}

int  gthread_cond_destroy(pthread_cond_t *cond)
{

	GreenCond **p = reinterpret_cast<GreenCond **>(cond);
	// emscripten_log(EM_LOG_CONSOLE, "pthread_cond_destroy: %p", *p);

	if (*p) {
		delete *p;
		*p = nullptr;
	}
	return 0;
}

// int  pthread_condattr_destroy(pthread_condattr_t *) { return 0; }

int gthread_cond_wait(pthread_cond_t *cond, pthread_mutex_t *)
{
	// if (!) {
	// 	return EINVAL;
	// }
	GreenCond **p = reinterpret_cast<GreenCond **>(cond);
	// emscripten_log(EM_LOG_CONSOLE, "pthread_cond_wait: %p", *p);
	if (!*p) {
		return EINVAL;
	}
	if (g_current_thread == nullptr) {
		(*p)->waiters.push_back(&g_main_thread);
	} else {
		(*p)->waiters.push_back(g_current_thread);
	}
	// if (g_ready_queue.empty()) {
	// 	emscripten_log(EM_LOG_CONSOLE, "pthread_cond_wait: worker thread is waiting, no other runnable fibers");
	// 	if (g_current_thread == nullptr) {
	// 		enqueue_thread(worker_thread);

	// 	} else {
	// 		enqueue_thread(&g_main_thread);
	// 	}
	// }
	block_current_and_dispatch();
	return 0;
}

int  gthread_cond_timedwait(pthread_cond_t *cond, pthread_mutex_t *, const struct timespec * abstime)
{
	// if (!g_current_thread) {
	// 	return EINVAL;
	// }
	if (!abstime) {
		return gthread_cond_wait(cond, nullptr);
	}

	GreenCond **p = reinterpret_cast<GreenCond **>(cond);
	// emscripten_log(EM_LOG_CONSOLE, "pthread_cond_timedwait: %p", *p);
	if (!*p) {
		return EINVAL;
	}
	GreenThread* self = nullptr;
	if (g_current_thread == nullptr) {
		self = &g_main_thread;
		(*p)->waiters.push_back(&g_main_thread);
	} else {
		self = g_current_thread;
		(*p)->waiters.push_back(self);
	}


	for (;;) {
		auto it = std::find((*p)->waiters.begin(), (*p)->waiters.end(), self);
		if (it == (*p)->waiters.end()) {
			return 0;
		}

		double timeout_ms = abstime_to_timeout_ms_realtime(abstime);
		if (timeout_ms <= 0) {
			(*p)->waiters.erase(it);
			return ETIMEDOUT;
		}

		GreenThread* next = dequeue_next_runnable();
		if (!next) {
			continue;
		}
		if (g_current_thread == nullptr) {
			ensure_main_thread();
						emscripten_fiber_init_from_current_context(
				&g_main_thread.fiber,
				g_main_thread.c_stack.data(),
				g_main_thread.c_stack.size()
			);
			g_current_thread = next;
			emscripten_fiber_swap(&g_main_thread.fiber, &next->fiber);
			g_current_thread = nullptr;
			g_main_thread.fiber = {};
			g_main_thread.fiber.stack_base = nullptr;
		} else {
			GreenThread* old = g_current_thread;
			g_current_thread = next;
			emscripten_fiber_swap(&old->fiber, &next->fiber);
		}
	}
}

int  gthread_cond_broadcast(pthread_cond_t *cond)
{

	GreenCond **p = reinterpret_cast<GreenCond **>(cond);
	// if 
	// emscripten_log(EM_LOG_CONSOLE, "pthread_cond_broadcast: %p", *p);
	if (!*p) return 0;
	for (auto w : (*p)->waiters) {
		enqueue_thread(w);
	}
	(*p)->waiters.clear();
	return 0;
}

int  gthread_cond_signal(pthread_cond_t *cond)
{
	GreenCond **p = reinterpret_cast<GreenCond **>(cond);
	// if (*p == 0) {

	// 	std::abort();
	// }
	// emscripten_log(EM_LOG_CONSOLE, "pthread_cond_signal: %p", *p);
	if ((*p)->waiters.empty()) return 0;
	GreenThread* w = (*p)->waiters.front();
	(*p)->waiters.erase((*p)->waiters.begin());

	enqueue_thread(w);

	return 0;
	//return gthread_cond_broadcast(cond);
}



 int __attribute__((weak)) sem_close(sem_t *) { return ENOENT; }
 int __attribute__((weak)) sem_unlink(const char *) { return ENOENT; }
 sem_t* __attribute__((weak)) sem_open(const char *, int, ...) { return nullptr; }
 int  __attribute__((weak)) sem_timedwait(sem_t *__restrict, const struct timespec *__restrict) { return ENOSYS; }
} // extern "C"

#endif
