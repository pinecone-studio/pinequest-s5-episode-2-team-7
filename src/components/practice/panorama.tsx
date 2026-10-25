"use client";

import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import { Viewer } from "@photo-sphere-viewer/core";
import { GyroscopePlugin } from "@photo-sphere-viewer/gyroscope-plugin";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import { useEffect, useRef, useState } from "react";
import type { HotspotId } from "@/lib/scenarios";

export interface Hotspot {
  id: HotspotId;
  label: string;
  yaw: number;
  pitch: number;
}

interface Callbacks {
  onGyroChange: (enabled: boolean) => void;
  /** No gyroscope, or access refused: the toggle should disappear. */
  onGyroUnavailable: () => void;
  onHotspot: (id: HotspotId) => void;
  /** ?debug=1: report where a tap lands, to place hotspots on a new panorama. */
  onDebugTap?: (yaw: number, pitch: number) => void;
}

interface Props extends Callbacks {
  src: string;
  hotspots: Hotspot[];
  /** Initial view direction (degrees). */
  startYaw: number;
  /** Desired gyroscope state; the viewer reports the real one via onGyroChange. */
  gyro: boolean;
}

const deg = (rad: number) => Math.round((rad * 180) / Math.PI);

/** A labelled pill with a pulse ring; ≥ 44 px tall for thumbs. */
function markerHtml(label: string) {
  return `<span class="relative flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-bold text-white shadow-lg ring-2 ring-white/80 backdrop-blur">
    <span class="relative flex h-3 w-3"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex h-3 w-3 rounded-full bg-emerald-400"></span></span>
    ${label}
  </span>`;
}

function createViewer(el: HTMLDivElement, { src, hotspots, startYaw }: Pick<Props, "src" | "hotspots" | "startYaw">, callbacks: { current: Callbacks }): Viewer {
  const v = new Viewer({
    container: el,
    panorama: src,
    navbar: false,
    defaultYaw: `${startYaw}deg`,
    defaultPitch: 0,
    defaultZoomLvl: 30,
    touchmoveTwoFingers: false,
    mousewheelCtrlKey: false,
    loadingTxt: "",
    plugins: [
      MarkersPlugin.withConfig({
        markers: hotspots.map((h) => ({
          id: h.id,
          html: markerHtml(h.label),
          position: { yaw: `${h.yaw}deg`, pitch: `${h.pitch}deg` },
          anchor: "center center",
        })),
      }),
      GyroscopePlugin.withConfig({ touchmove: true, roll: false }),
    ],
  });
  v.getPlugin<MarkersPlugin>(MarkersPlugin).addEventListener("select-marker", (e) => callbacks.current.onHotspot(e.marker.id as HotspotId));
  v.getPlugin<GyroscopePlugin>(GyroscopePlugin).addEventListener("gyroscope-updated", (e) => callbacks.current.onGyroChange(e.gyroscopeEnabled));
  v.addEventListener("click", (e) => callbacks.current.onDebugTap?.(deg(e.data.yaw > Math.PI ? e.data.yaw - 2 * Math.PI : e.data.yaw), deg(e.data.pitch)));
  return v;
}

/** 360° equirectangular scene (Photo Sphere Viewer) with hotspot markers and gyroscope look-around. */
export default function Panorama({ src, hotspots, startYaw, gyro, ...rest }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [ready, setReady] = useState(0);
  // Latest callbacks without re-creating the viewer.
  const callbacks = useRef<Callbacks>(rest);
  useEffect(() => {
    callbacks.current = rest;
  });

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let v: Viewer | null = null;
    // One tick later: a mount that is undone at once (React strict mode, a quick «Буцах»)
    // never starts a download — an aborted one leaves the next viewer hanging on "Loading".
    const timer = window.setTimeout(() => {
      v = createViewer(el, { src, hotspots, startYaw }, callbacks);
      viewer.current = v;
      setReady((n) => n + 1);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      viewer.current = null;
      v?.destroy();
    };
    // The scene is fixed for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const plugin = v.getPlugin<GyroscopePlugin>(GyroscopePlugin);
    let cancelled = false;
    if (gyro && !plugin.isEnabled()) {
      plugin
        .isSupported()
        .then((ok) => (ok && !cancelled ? plugin.start() : Promise.reject(new Error("unsupported"))))
        .catch(() => !cancelled && callbacks.current.onGyroUnavailable());
    } else if (!gyro && plugin.isEnabled()) {
      plugin.stop();
    }
    return () => {
      cancelled = true;
    };
  }, [gyro, ready]);

  return <div ref={container} className="h-full w-full touch-none" />;
}
