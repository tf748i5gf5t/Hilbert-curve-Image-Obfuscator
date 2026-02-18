/*
 * pixel_shuffle.c
 * Standalone WASM module for Hilbert curve generation + pixel shuffle.
 * Compiled with: emcc pixel_shuffle.c -O3 -o pixel_shuffle.wasm --no-entry \
 *   -s STANDALONE_WASM=1 -s INITIAL_MEMORY=256MB -s MAXIMUM_MEMORY=1GB \
 *   -s ALLOW_MEMORY_GROWTH=1 -s TOTAL_STACK=65536
 *
 * No libc needed — all functions are self-contained.
 */

/* ========== Utility macros ========== */
#define ABS(x) ((x) < 0 ? -(x) : (x))
#define SIGN(x) ((x) > 0 ? 1 : ((x) < 0 ? -1 : 0))

/*
 * floor_div2: equivalent to JS Math.floor(x / 2).
 * C's integer division truncates toward zero: -3/2 = -1
 * JS Math.floor rounds toward -∞:           -3/2 = -2
 * Arithmetic right-shift by 1 matches Math.floor(x/2) for all integers.
 */
static inline int floor_div2(int x) {
    return x >> 1;
}

/* ========== Progress reporting ========== */
/* Worker JS polls this to update progress bar */
volatile int g_progress = 0;

__attribute__((export_name("get_progress")))
int get_progress(void) {
    return g_progress;
}

/* ========== Hilbert Curve Generation ========== */

/* Flat output buffer pointer and write index, set by gilbert2d */
static int *curve_out;
static int curve_idx;

static void gen(int x, int y, int ax, int ay, int bx, int by) {
    int w = ABS(ax + ay);
    int h = ABS(bx + by);
    int dax = SIGN(ax), day = SIGN(ay);
    int dbx = SIGN(bx), dby = SIGN(by);

    if (h == 1) {
        for (int i = 0; i < w; i++) {
            curve_out[curve_idx++] = x;
            curve_out[curve_idx++] = y;
            x += dax;
            y += day;
        }
        return;
    }
    if (w == 1) {
        for (int i = 0; i < h; i++) {
            curve_out[curve_idx++] = x;
            curve_out[curve_idx++] = y;
            x += dbx;
            y += dby;
        }
        return;
    }

    int ax2 = floor_div2(ax), ay2 = floor_div2(ay);
    int bx2 = floor_div2(bx), by2 = floor_div2(by);
    int w2 = ABS(ax2 + ay2);
    int h2 = ABS(bx2 + by2);

    if (2 * w > 3 * h) {
        if ((w2 % 2) && (w > 2)) { ax2 += dax; ay2 += day; }
        gen(x, y, ax2, ay2, bx, by);
        gen(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by);
    } else {
        if ((h2 % 2) && (h > 2)) { bx2 += dbx; by2 += dby; }
        gen(x, y, bx2, by2, ax2, ay2);
        gen(x + bx2, y + by2, ax, ay, bx - bx2, by - by2);
        gen(x + (ax - dax) + (bx2 - dbx),
            y + (ay - day) + (by2 - dby),
            -bx2, -by2,
            -(ax - ax2), -(ay - ay2));
    }
}

/*
 * gilbert2d(width, height, outPtr)
 *   outPtr: pointer to int32 array of size width*height*2
 *   Writes [x0,y0, x1,y1, ...] Hilbert curve coordinates.
 */
__attribute__((export_name("gilbert2d")))
void gilbert2d(int width, int height, int *out) {
    curve_out = out;
    curve_idx = 0;
    if (width >= height)
        gen(0, 0, width, 0, 0, height);
    else
        gen(0, 0, 0, height, width, 0);
}

/*
 * precompute_indices(width, totalPixels, curvePtr, idxPtr)
 *   Converts (x,y) coordinate pairs from gilbert2d into flat pixel indices.
 *   curvePtr: int32[] of length totalPixels*2 (input)
 *   idxPtr:   int32[] of length totalPixels (output)
 *   idxPtr[i] = curvePtr[2*i] + curvePtr[2*i+1] * width
 */
__attribute__((export_name("precompute_indices")))
void precompute_indices(int width, int totalPixels,
                        const int *curvePtr, int *idxPtr) {
    for (int i = 0, ci = 0; i < totalPixels; i++, ci += 2) {
        idxPtr[i] = curvePtr[ci] + curvePtr[ci + 1] * width;
    }
}

/*
 * pixel_shuffle(totalPixels, isEncrypt, idxPtr, srcPtr, dstPtr)
 *   idxPtr:     int32[] precomputed pixel indices (from precompute_indices)
 *   srcPtr:     uint32[] RGBA source pixels
 *   dstPtr:     uint32[] RGBA destination pixels
 *   isEncrypt:  1 = encrypt (scramble), 0 = decrypt (unscramble)
 */
__attribute__((export_name("pixel_shuffle")))
void pixel_shuffle(int totalPixels,
                   int isEncrypt,
                   const int *idxPtr,
                   const unsigned int *srcPtr,
                   unsigned int *dstPtr) {
    /* Golden ratio offset */
    double golden = (__builtin_sqrt(5.0) - 1.0) / 2.0;
    int offset = (int)(golden * totalPixels + 0.5);

    /* Progress reporting */
    int reportInterval = totalPixels / 20;
    if (reportInterval < 1) reportInterval = 1;
    int nextReport = 0;

    if (isEncrypt) {
        for (int i = 0; i < totalPixels; i++) {
            int p1 = idxPtr[i];
            int j = i + offset;
            if (j >= totalPixels) j -= totalPixels;
            int p2 = idxPtr[j];

            dstPtr[p2] = srcPtr[p1];

            if (i == nextReport) {
                g_progress = (i * 100) / totalPixels;
                nextReport += reportInterval;
            }
        }
    } else {
        for (int i = 0; i < totalPixels; i++) {
            int p1 = idxPtr[i];
            int j = i + offset;
            if (j >= totalPixels) j -= totalPixels;
            int p2 = idxPtr[j];

            dstPtr[p1] = srcPtr[p2];

            if (i == nextReport) {
                g_progress = (i * 100) / totalPixels;
                nextReport += reportInterval;
            }
        }
    }
    g_progress = 100;
}
