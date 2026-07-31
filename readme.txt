=== Onylogy Squoosh ===
Contributors: ehasan28
Tags: image optimization, compress images, webp, avif, jpeg xl
Requires at least: 6.6
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 3.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Automatically compress, resize and convert your Media Library to WebP/AVIF/JPEG XL at Squoosh-level quality — all in your browser. No cloud, no API keys, no per-image cost.

== Description ==

Onylogy Squoosh optimizes the images already in your Media Library and every new one you upload — just like Smush, ShortPixel or Imagify, but with one big difference: **the compression runs in your browser using WebAssembly**, not on a paid cloud service and not on your host's PHP image library.

That means Squoosh-level quality (mozjpeg, oxipng, WebP, AVIF, JPEG XL) that works the same on *every* host, with nothing ever leaving your site and no ongoing cost.

**What it does**

* **Auto-optimize on upload** — new images are compressed and, when it's a win, converted to WebP/AVIF/JPEG XL automatically.
* **Bulk-optimize your existing library** — one click processes every image, every thumbnail size, with a live progress bar and a running "total saved" counter.
* **Resize oversized images** — downscale huge uploads to a sensible max width (2560px by default). Never upscales.
* **Converts in place, works with every page builder** — when WebP/AVIF wins, it *replaces* the file in your Media Library (e.g. `photo.png` becomes `photo.webp`). There's no separate "next-gen sibling" file and no front-end rewriting required — your theme, Elementor, Divi, or any other page builder just serves whatever's in the Media Library, automatically.
* **Smart & non-destructive** — a size is only replaced when the new version is actually smaller. Every original is backed up before the first change, so you can **Restore** any image with one click.
* **100% private & free** — no external API, no per-image fees, nothing uploaded anywhere.

**How it works (the honest version)**

Bulk-optimizing a large *existing* library runs in your browser, so keep the tab open until it finishes (exactly like Smush's Bulk Smush). New uploads are optimized instantly. The server never encodes an image — it only backs up the original, then writes whichever result the browser decided is smallest as the attachment's own file (updating its filename, MIME type, and WordPress metadata to match). That's why it behaves identically on every host, and why every consumer of the Media Library — theme, block editor, or page builder — sees the optimized file with zero extra configuration.

**A note on browser support:** replacing an original with WebP/AVIF/JPEG XL means very old browsers (IE11, iOS ≤ 13 Safari) would see a broken image if they ever request that file directly. This is an intentionally small, shrinking slice of traffic in 2026; if you need to guarantee support for those browsers specifically, turn off next-gen format conversion in Settings and Squoosh will still recompress in the original format.

== Installation ==

1. Upload the `onylogy-squoosh` folder to `/wp-content/plugins/`, or install the zip via Plugins → Add New → Upload.
2. Activate the plugin.
3. Go to **Media → Squoosh** and click **Optimize all**. New uploads are handled automatically.

== Frequently Asked Questions ==

= Does this send my images to a third-party service? =

No. All compression and conversion happens locally in your browser. Nothing is uploaded to any external service.

= Do I need ImageMagick, GD, or a special host? =

No. The plugin doesn't rely on any server-side image library to compress or convert — it uses WebAssembly in the browser. (WordPress core's built-in resizing is only used to regenerate thumbnails when you downscale an image, which every WordPress install already supports.)

= Can I undo it? =

Yes. Every original is backed up *before* the first change to that image, which is exactly why the backup exists — without it, "Restore original" would have nothing to restore. Use the **Restore original** action on any image, and the original file, its original filename/format, and all its thumbnails are put back exactly as they were.

= Why does my PNG show up as a .webp file in the Media Library? =

That's the point, not a bug: when converting to WebP makes the file smaller, Squoosh replaces the attachment's own file (and updates its WordPress metadata to match) rather than creating a separate "sibling" file next to it. That's what makes it work automatically with page builders like Elementor or Divi — they just render whatever file the Media Library says is there.

= Why does the big bulk run need the tab open? =

Because the compression happens in your browser, not on a remote server. This is the same trade-off as Smush's Bulk Smush — and it's what keeps the plugin free, private, and host-independent.

== Changelog ==

= 3.0.0 =
* Renamed from Onylogy Image Squeeze to Onylogy Squoosh.
* Dashboard and Settings rebuilt on the Onylogy design system (format chips, resize presets, toast notifications) in place of bare admin form controls.
* Added JPEG XL as a third candidate format alongside WebP/AVIF, each with its own quality control.
* Compression engine upgraded to the fuller per-format option set (matching the Onylogy Squeeze desktop/web apps) instead of a single quality number per format.
* Fixed: the optimized file size shown on the Edit Media screen no longer reflects the pre-optimization byte count — attachment metadata now records the true size of the file actually written to disk.
* Removed a leftover Google Fonts CDN request; brand fonts are fully self-hosted.

= 2.1.0 =
* Images are now optimized **in place**: when WebP/AVIF wins, it replaces the attachment's own file (filename, MIME type, and metadata all updated) instead of being stored as a separate sibling file. Fixes next-gen formats not appearing for images inserted by page builders (Elementor, Divi, etc.), since there's no more front-end markup rewriting involved.
* Restore now reverts the exact original filename, format, and metadata, not just the bytes.

= 2.0.0 =
* Rebuilt as a full Media Library optimizer (like Smush/ShortPixel) — the previous manual convert-and-download tool is replaced.
* Auto-optimize on upload; bulk-optimize the entire existing library with progress + savings stats.
* Resize oversized uploads; generate & serve WebP/AVIF via `<picture>` with fallback.
* Non-destructive with per-image backup and one-click Restore; Media Library row actions.
* All compression still runs client-side in WebAssembly — no cloud, no per-image cost.

= 1.0.0 =
* Initial release: in-browser convert/compress workbench (JPG/PNG/WebP/AVIF).
