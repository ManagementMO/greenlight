"use client";

import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";

export type GradientLook = {
  colors: [string, string, string];
  type?: "plane" | "waterPlane" | "sphere";
  wave?: boolean;
};

// Base settings follow the library's "halo" preset; `wave` tilts the camera
// down onto a waterPlane for the landscape look used in the closing section.
class GradientBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function GradientBackground(props: GradientLook) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const sync = () => setActive(visible && !motion.matches && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    if (root.current) observer.observe(root.current);
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { observer.disconnect(); motion.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync); };
  }, []);
  return <div ref={root} className={`lp-gradient-background${props.wave ? ' is-wave' : ''}`} data-active={active} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    {active && <GradientBoundary><AnimatedGradient {...props} /></GradientBoundary>}
    <svg className="lp-gradient-orbits" viewBox="0 0 1440 960" preserveAspectRatio="xMidYMid slice" fill="none">
      <g transform="rotate(-28 1030 420)">
        <ellipse cx="1030" cy="420" rx="620" ry="300" />
        <ellipse cx="1030" cy="420" rx="660" ry="330" />
        <ellipse cx="1030" cy="420" rx="700" ry="360" />
        <ellipse className="lp-gradient-flow" cx="1030" cy="420" rx="660" ry="330" pathLength="1" />
      </g>
    </svg>
  </div>;
}

function AnimatedGradient({ colors, type = "plane", wave = false }: GradientLook) {
  const camera = wave
    ? { cAzimuthAngle: 180, cPolarAngle: 70, cDistance: 4.4, positionX: 0, rotationY: 0, rotationZ: 0, uStrength: 3, uDensity: 1.6, uFrequency: 0 }
    : { cAzimuthAngle: 180, cPolarAngle: 90, cDistance: 3.6, positionX: -1.4, rotationY: 10, rotationZ: 50, uStrength: 4, uDensity: 1.3, uFrequency: 5.5 };

  return (
    <ShaderGradientCanvas
      pointerEvents="none"
      pixelDensity={1}
      fov={45}
      style={{ position: "absolute", inset: 0 }}
    >
      <ShaderGradient
        control="props"
        type={wave ? "waterPlane" : type}
        animate="on"
        uTime={0}
        uSpeed={0.3}
        uAmplitude={1}
        color1={colors[0]}
        color2={colors[1]}
        color3={colors[2]}
        grain="off"
        lightType="3d"
        brightness={0.95}
        reflection={0.1}
        cameraZoom={1}
        positionY={0}
        positionZ={0}
        rotationX={0}
        {...camera}
      />
    </ShaderGradientCanvas>
  );
}
