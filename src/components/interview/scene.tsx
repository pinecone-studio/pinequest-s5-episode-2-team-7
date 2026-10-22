"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import type { SceneId } from "@/lib/scenes";

/**
 * Puts the avatar into a scene: the person is cut out of the live video
 * (MediaPipe selfie segmentation, on the device) and drawn over an
 * illustrated, slightly blurred background — like a video-call background.
 * If segmentation cannot run, nothing is drawn and the original video shows.
 */

const MEDIAPIPE_VERSION = "1.0.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
/** Segmentation rate; the video itself is drawn every frame. */
const SEGMENT_FPS = 20;

let segmenterPromise: Promise<ImageSegmenter> | null = null;

async function loadSegmenter(): Promise<ImageSegmenter> {
  const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO" as const,
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  try {
    return await ImageSegmenter.createFromOptions(fileset, options("GPU"));
  } catch {
    return ImageSegmenter.createFromOptions(fileset, options("CPU"));
  }
}

function getSegmenter(): Promise<ImageSegmenter> {
  segmenterPromise ??= loadSegmenter().catch((error: unknown) => {
    segmenterPromise = null;
    throw error;
  });
  return segmenterPromise;
}

/** Match the studio-lit person to the scene's light. */
const PERSON_LIGHT: Partial<Record<SceneId, string>> = {
  accident: "brightness(0.78) saturate(0.85) contrast(1.05)",
  steppe: "brightness(1.05) saturate(1.05)",
  home: "sepia(0.12) brightness(0.97)",
};

/** Share of the screen height the person takes; the scene shows above and beside them. */
const PERSON_HEIGHT = 0.62;

/** Where the video goes: bottom-centred, PERSON_HEIGHT of the box tall (sides may be cropped). */
function placement(w: number, h: number, cw: number, ch: number) {
  const dh = Math.round(ch * PERSON_HEIGHT);
  const dw = Math.max(Math.round((dh * w) / h), Math.min(cw, Math.round(cw * 0.9)));
  const fittedH = Math.round((dw * h) / w);
  return { dx: Math.round((cw - dw) / 2), dy: ch - fittedH, dw, dh: fittedH };
}

export function SceneLayer({ scene, videoId }: { scene: Exclude<SceneId, "original">; videoId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Read by the draw loop, so changing the scene does not restart segmentation.
  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    let stopped = false;
    let frame = 0;
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");
    let maskImage: ImageData | null = null;
    /** Some models report background confidence instead of person: detected on the first mask. */
    let invert: boolean | null = null;
    let lastSegment = 0;

    void getSegmenter()
      .then((segmenter) => {
        const draw = () => {
          if (stopped) return;
          frame = requestAnimationFrame(draw);
          const video = document.getElementById(videoId) as HTMLVideoElement | null;
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (!video || !canvas || !ctx || !maskCtx || video.readyState < 2 || !video.videoWidth) return;

          const now = performance.now();
          if (now - lastSegment >= 1000 / SEGMENT_FPS) {
            lastSegment = now;
            const result = segmenter.segmentForVideo(video, now);
            const mask = result.confidenceMasks?.[0];
            if (mask) {
              const values = mask.getAsFloat32Array();
              if (maskCanvas.width !== mask.width || maskCanvas.height !== mask.height) {
                maskCanvas.width = mask.width;
                maskCanvas.height = mask.height;
                maskImage = maskCtx.createImageData(mask.width, mask.height);
              }
              if (invert === null) {
                const at = (x: number, y: number) => values[Math.floor(y) * mask.width + Math.floor(x)];
                const center = at(mask.width / 2, mask.height / 2);
                const corners = (at(1, 1) + at(mask.width - 2, 1)) / 2;
                invert = corners > center;
              }
              const pixels = maskImage!.data;
              for (let i = 0; i < values.length; i++) {
                const p = invert ? 1 - values[i] : values[i];
                // Sharpen the edge a little: hair stays soft, background goes fully away.
                const a = Math.min(1, Math.max(0, (p - 0.25) / 0.5));
                pixels[i * 4 + 3] = a * 255;
              }
              maskCtx.putImageData(maskImage!, 0, 0);
            }
            result.close();
          }

          const rect = canvas.getBoundingClientRect();
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const cw = Math.round(rect.width * dpr);
          const ch = Math.round(rect.height * dpr);
          if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
          }
          const p = placement(video.videoWidth, video.videoHeight, cw, ch);
          ctx.globalCompositeOperation = "source-over";
          ctx.filter = PERSON_LIGHT[sceneRef.current] ?? "none";
          ctx.clearRect(0, 0, cw, ch);
          ctx.drawImage(video, p.dx, p.dy, p.dw, p.dh);
          if (maskCanvas.width) {
            ctx.globalCompositeOperation = "destination-in";
            ctx.filter = "blur(2px)";
            ctx.drawImage(maskCanvas, p.dx, p.dy, p.dw, p.dh);
            setReady(true);
          }
        };
        draw();
      })
      .catch((error: unknown) => {
        console.warn("[scene] segmentation unavailable", error);
        setFailed(true);
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [videoId]);

  if (failed) return null;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ opacity: ready ? 1 : 0, transition: "opacity 400ms" }}>
      <SceneBackdrop scene={scene} />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

/** Illustrated background, blurred slightly so it reads as depth of field. */
export function SceneBackdrop({ scene }: { scene: Exclude<SceneId, "original"> }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full scale-110" style={{ filter: "blur(3px)" }} aria-hidden>
        {BACKDROPS[scene]}
      </svg>
      {(scene === "accident" || scene === "ambulance") && <FlashingLights soft={scene === "ambulance"} />}
    </div>
  );
}

/** Red/blue emergency light washing over the scene. */
function FlashingLights({ soft }: { soft: boolean }) {
  return (
    <>
      <style>{`
        @keyframes scene-red { 0%,45%,100% { opacity: 0 } 10%,35% { opacity: 1 } }
        @keyframes scene-blue { 0%,50%,95%,100% { opacity: 0 } 60%,85% { opacity: 1 } }
      `}</style>
      <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 15% 30%, rgba(255,30,40,.55), transparent 55%)", animation: "scene-red 1.1s infinite", opacity: 0, mixBlendMode: "screen", filter: soft ? "opacity(.4)" : undefined }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 85% 25%, rgba(40,90,255,.6), transparent 55%)", animation: "scene-blue 1.1s infinite", opacity: 0, mixBlendMode: "screen", filter: soft ? "opacity(.4)" : undefined }} />
    </>
  );
}

const BACKDROPS: Record<Exclude<SceneId, "original">, React.ReactNode> = {
  accident: (
    <>
      <defs>
        <linearGradient id="acc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060a18" />
          <stop offset="0.55" stopColor="#1a2238" />
          <stop offset="1" stopColor="#2b2a33" />
        </linearGradient>
        <radialGradient id="acc-lamp">
          <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffcf7a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="acc-head">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#fff6d6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="700" fill="url(#acc-sky)" />
      {/* City silhouette */}
      <path d="M0 330 h40 v-60 h30 v40 h25 v-90 h40 v70 h30 v-40 h35 v80 h40 v-110 h35 v90 h30 v-50 h45 v70 h50 V700 H0z" fill="#0d1222" />
      {[30, 75, 120, 160, 215, 250, 300, 345].map((x, i) => (
        <rect key={x} x={x} y={250 + (i % 3) * 20} width="6" height="8" fill="#f5c76b" opacity="0.6" />
      ))}
      {/* Road */}
      <path d="M0 420 L400 400 L400 700 L0 700z" fill="#22232a" />
      <path d="M150 700 L205 410 L215 410 L250 700z" fill="#2c2d35" />
      {[440, 500, 580, 670].map((y, i) => (
        <rect key={y} x={198 - i * 3} y={y} width={6 + i * 3} height={20 + i * 12} fill="#e8e3c8" opacity="0.7" />
      ))}
      {/* Crashed car */}
      <g transform="translate(250 430) rotate(-8)">
        <rect x="0" y="20" width="120" height="40" rx="10" fill="#3b3f4a" />
        <path d="M18 22 L38 0 H88 L105 22z" fill="#2a2e38" />
        <circle cx="25" cy="62" r="13" fill="#111" />
        <circle cx="95" cy="62" r="13" fill="#111" />
        <circle cx="118" cy="38" r="22" fill="url(#acc-head)" />
      </g>
      {/* Police / ambulance at the side */}
      <rect x="-20" y="440" width="110" height="55" rx="8" fill="#e9edf2" />
      <rect x="10" y="430" width="30" height="10" rx="3" fill="#ff3b3b" />
      <rect x="40" y="430" width="30" height="10" rx="3" fill="#3b6bff" />
      {/* Street lamps */}
      <circle cx="60" cy="230" r="60" fill="url(#acc-lamp)" />
      <circle cx="340" cy="210" r="70" fill="url(#acc-lamp)" />
      <rect x="57" y="230" width="5" height="200" fill="#151821" />
      <rect x="337" y="210" width="5" height="200" fill="#151821" />
      {/* Traffic cones */}
      {[150, 185, 220].map((x, i) => (
        <path key={x} d={`M${x} ${520 + i * 8} l10 -30 l10 30z`} fill="#ff7a1a" />
      ))}
    </>
  ),
  ambulance: (
    <>
      <defs>
        <linearGradient id="amb-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dfe6ec" />
          <stop offset="1" stopColor="#b9c4cf" />
        </linearGradient>
      </defs>
      <rect width="400" height="700" fill="url(#amb-wall)" />
      <rect x="0" y="0" width="400" height="40" fill="#f4f8fb" />
      <rect x="40" y="10" width="320" height="14" rx="7" fill="#ffffff" />
      {/* Cabinets */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={20 + i * 125} y="70" width="115" height="120" rx="6" fill="#eef2f5" stroke="#a9b5c1" strokeWidth="3" />
      ))}
      {/* Monitor */}
      <rect x="250" y="230" width="130" height="95" rx="8" fill="#14181f" />
      <polyline points="258,280 280,280 288,262 296,300 304,280 330,280 338,268 346,292 352,280 372,280" fill="none" stroke="#3dff8b" strokeWidth="3" />
      <text x="262" y="252" fill="#3dff8b" fontSize="16" fontFamily="monospace">HR 112</text>
      {/* Oxygen tank, straps */}
      <rect x="30" y="230" width="34" height="170" rx="16" fill="#2f9e5b" />
      <rect x="70" y="260" width="14" height="300" fill="#ffb02e" opacity="0.8" />
      {/* Back window with night outside */}
      <rect x="140" y="220" width="90" height="70" rx="6" fill="#0b1426" />
      {/* Stretcher */}
      <rect x="0" y="560" width="400" height="140" fill="#8a96a3" />
      <rect x="0" y="545" width="400" height="22" fill="#f2f2f2" />
    </>
  ),
  er: (
    <>
      <defs>
        <linearGradient id="er-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e7f4f3" />
          <stop offset="1" stopColor="#c8dfdd" />
        </linearGradient>
      </defs>
      <rect width="400" height="700" fill="url(#er-wall)" />
      {/* Ceiling lights */}
      {[60, 200, 340].map((x) => (
        <rect key={x} x={x - 45} y="20" width="90" height="16" rx="4" fill="#ffffff" />
      ))}
      {/* Curtain */}
      <path d="M0 60 Q 20 80 0 100 Q 20 120 0 140 V700 H120 V60z" fill="#7cc4c0" opacity="0.85" />
      <path d="M120 60 V700" stroke="#5aa6a2" strokeWidth="6" />
      {/* Monitor on arm */}
      <rect x="260" y="150" width="120" height="85" rx="8" fill="#101820" />
      <polyline points="268,195 290,195 297,178 305,212 312,195 340,195 346,184 352,205 358,195 372,195" fill="none" stroke="#33e6ff" strokeWidth="3" />
      <rect x="315" y="235" width="8" height="120" fill="#9fb3b6" />
      {/* Wall outlets, gases */}
      <rect x="170" y="260" width="70" height="40" rx="5" fill="#f9fbfb" stroke="#9fb9b7" strokeWidth="2" />
      <circle cx="190" cy="280" r="7" fill="#2f9e5b" />
      <circle cx="220" cy="280" r="7" fill="#3b6bff" />
      {/* Bed */}
      <rect x="0" y="560" width="400" height="140" fill="#dfe8e8" />
      <rect x="0" y="540" width="400" height="26" rx="6" fill="#ffffff" />
    </>
  ),
  home: (
    <>
      <defs>
        <radialGradient id="home-lamp" cx="0.8" cy="0.35" r="0.6">
          <stop offset="0" stopColor="#ffd59a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffd59a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="700" fill="#c9a983" />
      <rect width="400" height="700" fill="url(#home-lamp)" />
      {/* Window with evening sky */}
      <rect x="30" y="110" width="140" height="170" rx="4" fill="#3a4d7a" stroke="#f3eadf" strokeWidth="8" />
      <path d="M100 110 V280 M30 195 H170" stroke="#f3eadf" strokeWidth="6" />
      {/* Shelf with books */}
      <rect x="220" y="330" width="160" height="10" fill="#7a5233" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={228 + i * 22} y={280 - (i % 2) * 10} width="16" height={50 + (i % 2) * 10} fill={["#a33b3b", "#3b5ea3", "#d9a441", "#4f8a4f", "#6b4f8a", "#c46a2f"][i]} />
      ))}
      {/* Lamp */}
      <path d="M300 170 L340 170 L355 215 L285 215z" fill="#f6e2b8" />
      <rect x="317" y="215" width="6" height="110" fill="#5b4632" />
      {/* Wall clock, carpet, sofa back */}
      <circle cx="250" cy="120" r="26" fill="#f7f1e8" stroke="#5b4632" strokeWidth="4" />
      <path d="M250 120 V104 M250 120 H262" stroke="#333" strokeWidth="3" />
      <rect x="0" y="520" width="400" height="180" fill="#8b4f3a" />
      <rect x="0" y="500" width="400" height="40" rx="10" fill="#6d3c2c" />
    </>
  ),
  steppe: (
    <>
      <defs>
        <linearGradient id="st-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5aa0e6" />
          <stop offset="0.6" stopColor="#bcdcf5" />
        </linearGradient>
      </defs>
      <rect width="400" height="700" fill="url(#st-sky)" />
      <ellipse cx="90" cy="120" rx="60" ry="18" fill="#ffffff" opacity="0.9" />
      <ellipse cx="300" cy="80" rx="70" ry="20" fill="#ffffff" opacity="0.85" />
      {/* Mountains */}
      <path d="M0 380 L80 290 L150 360 L230 270 L320 350 L400 300 V700 H0z" fill="#7d8fa8" />
      {/* Hills */}
      <path d="M0 430 Q 120 380 220 420 T 400 410 V700 H0z" fill="#8fb35a" />
      <path d="M0 520 Q 150 470 400 510 V700 H0z" fill="#a9c46b" />
      {/* Ger */}
      <g transform="translate(250 400)">
        <rect x="0" y="20" width="80" height="35" fill="#f7f4ee" />
        <path d="M-6 22 Q 40 -15 86 22z" fill="#ffffff" stroke="#c9bfae" strokeWidth="2" />
        <rect x="32" y="32" width="16" height="23" fill="#d24b2a" />
      </g>
      {/* Horses in the distance */}
      {[60, 95].map((x) => (
        <rect key={x} x={x} y="445" width="16" height="7" rx="3" fill="#5a3b26" />
      ))}
    </>
  ),
};
