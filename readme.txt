=== Onylogy Image Squeeze ===
Contributors: ehasan28
Tags: image optimization, compress images, webp, avif, lazy optimize
Requires at least: 6.6
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 2.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Automatically compress, resize and convert your Media Library to WebP/AVIF at Squoosh-level quality — all in your browser. No cloud, no API keys, no per-image cost.

== Description ==

Onylogy Image Squeeze optimizes the images already in your Media Library and every new one you upload — just like Smush, ShortPixel or Imagify, but with one big difference: **the compression runs in your browser using WebAssembly**, not on a paid cloud service and not on your host's PHP image library.

That means Squoosh-level quality (mozjpeg, oxipng, WebP, AVIF) that works the same on *every* host, with nothing ever leaving your site and no ongoing cost.

**What it does**

* **Auto-optimize on upload** — new images are compressed (and WebP/AVIF versions created) automatically.
* **Bulk-optimize your existing library** — one click processes every image, every thumbnail size, with a live progress bar and a running "total saved" counter.
* **Resize oversized images** — downscale huge uploads to a sensible max width (2560px by default). Never upscales.
* **Convert & serve WebP/AVIF** — next-gen copies are generated and served to supporting browsers automatically via `<picture>`, with a seamless fallback to the original for browsers that don't support them. Works on Apache *and* nginx — no `.htaccess` needed.
* **Smart & non-destructive** — a file is only replaced when the new version is actually smaller, and a next-gen sibling is only kept when it beats the original. Every original is backed up so you can **Restore** any image with one click.
* **100% private & free** — no external API, no per-image fees, nothing uploaded anywhere.

**How it works (the honest version)**

Bulk-optimizing a large *existing* library runs in your browser, so keep the tab open until it finishes (exactly like Smush's Bulk Smush). New uploads are optimized instantly. The server only stores the finished files, backs up originals, and serves the next-gen formats — it never encodes an image, which is why it behaves identically on every host.

== Installation ==

1. Upload the `onylogy-image-squeeze` folder to `/wp-content/plugins/`, or install the zip via Plugins → Add New → Upload.
2. Activate the plugin.
3. Go to **Media → Image Squeeze** and click **Optimize all**. New uploads are handled automatically.

== Frequently Asked Questions ==

= Does this send my images to a third-party service? =

No. All compression and conversion happens locally in your browser. Nothing is uploaded to any external service.

= Do I need ImageMagick, GD, or a special host? =

No. The plugin doesn't rely on any server-side image library to compress or convert — it uses WebAssembly in the browser. (WordPress core's built-in resizing is only used to regenerate thumbnails when you downscale an image, which every WordPress install already supports.)

= Can I undo it? =

Yes. Every original is backed up. Use the **Restore original** action on any image, and the original file (and all its thumbnails) are put back.

= Why does the big bulk run need the tab open? =

Because the compression happens in your browser, not on a remote server. This is the same trade-off as Smush's Bulk Smush — and it's what keeps the plugin free, private, and host-independent.

== Changelog ==

= 2.0.0 =
* Rebuilt as a full Media Library optimizer (like Smush/ShortPixel) — the previous manual convert-and-download tool is replaced.
* Auto-optimize on upload; bulk-optimize the entire existing library with progress + savings stats.
* Resize oversized uploads; generate & serve WebP/AVIF via `<picture>` with fallback.
* Non-destructive with per-image backup and one-click Restore; Media Library row actions.
* All compression still runs client-side in WebAssembly — no cloud, no per-image cost.

= 1.0.0 =
* Initial release: in-browser convert/compress workbench (JPG/PNG/WebP/AVIF).
