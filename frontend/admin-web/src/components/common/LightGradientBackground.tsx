import React from "react";

/**
 * LightGradientBackground
 *
 * Implements the Figma "Light Gradient 13" ambient mesh background with exact
 * vector coordinates, blur filters, matrix transformations, and opacities.
 */
export function LightGradientBackground({ className = "" }: { className?: string }) {
  return (
    <div
      className={`fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-white ${className}`}
      aria-hidden="true"
    >
      {/* Light Gradient 13 — Group 1 Ambient Layer */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          width: "140vw",
          height: "140vh",
          left: "-20vw",
          top: "-20vh",
          transform: "matrix(-1, 0, 0, 1, 0, 0)",
        }}
      >
        {/* Vector 1 - #1DA8FF */}
        <div
          className="absolute"
          style={{
            left: "-24.76%",
            right: "75.18%",
            top: "-8.89%",
            bottom: "6.79%",
            background: "#1DA8FF",
            opacity: 0.5,
            filter: "blur(100px)",
            transform: "matrix(-0.81, -0.59, -0.59, 0.81, 0, 0)",
          }}
        />

        {/* Vector 5 - #FFE897 */}
        <div
          className="absolute"
          style={{
            left: "-9.67%",
            right: "90.53%",
            top: "24.34%",
            bottom: "36.96%",
            background: "#FFE897",
            opacity: 0.9,
            filter: "blur(75px)",
            transform: "matrix(-0.81, -0.59, -0.59, 0.81, 0, 0)",
          }}
        />

        {/* Vector 6 - #B767FD */}
        <div
          className="absolute"
          style={{
            left: "-7.54%",
            right: "88.4%",
            top: "13.02%",
            bottom: "67.43%",
            background: "#B767FD",
            opacity: 0.5,
            filter: "blur(75px)",
            transform: "matrix(-0.81, -0.59, -0.59, 0.81, 0, 0)",
          }}
        />

        {/* Vector 7 - #FDAD67 */}
        <div
          className="absolute"
          style={{
            left: "30.69%",
            right: "50.17%",
            top: "77.67%",
            bottom: "2.77%",
            background: "#FDAD67",
            opacity: 0.59,
            filter: "blur(75px)",
            transform: "matrix(-0.81, -0.59, -0.59, 0.81, 0, 0)",
          }}
        />

        {/* Vector 4 - #1E44EC */}
        <div
          className="absolute"
          style={{
            left: "11.08%",
            right: "46.17%",
            top: "18.46%",
            bottom: "17.2%",
            background: "#1E44EC",
            opacity: 0.3,
            filter: "blur(150px)",
            transform: "matrix(-0.97, 0.23, 0.23, 0.97, 0, 0)",
          }}
        />

        {/* Ellipse 11 - #FFEDA4 */}
        <div
          className="absolute"
          style={{
            left: "61.57%",
            right: "-12.12%",
            top: "64.55%",
            bottom: "-25.08%",
            background: "#FFEDA4",
            filter: "blur(100px)",
            transform: "matrix(-1, 0, 0, 1, 0, 0)",
          }}
        />

        {/* Vector 3 - #946CE9 */}
        <div
          className="absolute"
          style={{
            left: "41.91%",
            right: "19.47%",
            top: "2.12%",
            bottom: "35.45%",
            background: "#946CE9",
            opacity: 0.3,
            filter: "blur(150px)",
            transform: "matrix(-1, 0, 0, 1, 0, 0)",
          }}
        />

        {/* Ellipse 10 - #49A0EC */}
        <div
          className="absolute"
          style={{
            left: "65.83%",
            right: "-15.27%",
            top: "11.75%",
            bottom: "9.25%",
            background: "#49A0EC",
            opacity: 0.5,
            filter: "blur(150px)",
            transform: "matrix(-1, 0, 0, 1, 0, 0)",
          }}
        />
      </div>
    </div>
  );
}
