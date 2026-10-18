"use client";

import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

export type GradientLook = {
  colors: [string, string, string];
  type?: "plane" | "waterPlane" | "sphere";
  wave?: boolean;
};

// Base settings follow the library's "halo" preset; `wave` tilts the camera
// down onto a waterPlane for the landscape look used in the closing section.
export default function GradientBackground({ colors, type = "plane", wave = false }: GradientLook) {
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
        grain="on"
        lightType="3d"
        brightness={1.2}
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
