# bg-video module

Self-contained background-video layer used by the welcome page. Drop new
media files into this directory to swap the background — no HTML or JS
changes required.

## Files

| File | Purpose |
|---|---|
| `bg-video.mp4` | H.264 1080p, 30 fps, no audio. Universal browser support. |
| `bg-video.webm` | VP9 1080p, 30 fps, no audio. Preferred when supported (smaller). |
| `bg-video-poster.jpg` | Still frame. Acts as the `<video poster>` and as the low-res fallback. |
| `bg-video.css` | Styles for the root container, video element, and top-right toggle button. |
| `bg-video.js` | Loader, autoplay handling, timeout fallback, quality toggle. |

**Source spec:** 45 seconds of source content captured at YouTube
timestamp `21:51` (1311s), then sped up `2×` at transcode time so the
final clip is **22.5 seconds at 30 fps @ 1920×1080**. The 2× speed-up
is baked into the file via `setpts=0.5*PTS`, so playback is just
`<video loop>` at the default rate — no JS playback-rate gymnastics
needed.

## How it's wired

The page only needs:

```html
<link rel="stylesheet" href="/bg-video/bg-video.css">
<div id="bg-video-root"></div>
<script defer src="/bg-video/bg-video.js"></script>
```

The Python backend serves these via the standard static handler — paths
are allow-listed in `PUBLIC_STATIC_FILES` in [V7/app.py](../../app.py).

## Swapping the video

1. Produce a 720p MP4 (H.264) at ≤ ~2 Mbps and a matching VP9 WebM.
2. Extract a representative still frame as `bg-video-poster.jpg`.
3. Drop all three into this directory with the same filenames.
4. Redeploy. Browsers will fetch the new files on next visit
   (cache-bust if needed by appending `?v=2` to the script include).

### One-shot regenerate from a YouTube source

The original 45-second loop was produced like this:

```bash
# 1. Grab 45 seconds of 1080p source from t=21:51 (1311 s).
yt-dlp -f 'bestvideo[height<=1080]' \
  --downloader ffmpeg \
  --downloader-args "ffmpeg_i:-ss 1311 -t 45" \
  -o _source.mp4 "https://www.youtube.com/watch?v=8gPzIKe92-M"

# 2. Transcode to H.264 with 2× speed baked in (setpts=0.5*PTS),
#    final clip is 22.5 seconds at 30 fps @ 1920×1080.
ffmpeg -i _source.mp4 \
  -vf "setpts=0.5*PTS,fps=30,scale=1920:1080:flags=lanczos" \
  -c:v libx264 -profile:v high -level 4.1 -preset slow -crf 23 \
  -pix_fmt yuv420p -movflags +faststart -an bg-video.mp4

# 3. Same source, VP9 WebM.
ffmpeg -i _source.mp4 \
  -vf "setpts=0.5*PTS,fps=30,scale=1920:1080:flags=lanczos" \
  -c:v libvpx-vp9 -b:v 2400k -minrate 1200k -maxrate 3600k -crf 30 \
  -pix_fmt yuv420p -row-mt 1 -an bg-video.webm

# 4. Still frame from the middle of the sped-up output.
ffmpeg -ss 11.25 -i bg-video.mp4 -frames:v 1 \
  -vf "scale=1920:1080:flags=lanczos" -q:v 4 bg-video-poster.jpg
```

`-an` strips audio. `+faststart` puts MP4 metadata at the head so
playback can begin while the file is still streaming in.
`setpts=0.5*PTS` halves presentation timestamps to bake the 2× speed
into the file (no runtime `playbackRate` needed).

## Fallback / accessibility behavior

The script automatically falls back to the still image when:

- The user previously chose "Still · low" (persisted in `localStorage`)
- `prefers-reduced-motion: reduce` is set in the OS
- `navigator.connection.saveData` is true, or effectiveType is 2g
- The video errors out
- The video hasn't started playing within 6 seconds

The corner toggle lets users flip between modes at any time; the
choice is remembered across sessions.
