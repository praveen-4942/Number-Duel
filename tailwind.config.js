export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    darkMode: "class",
    theme: {
        extend: {
            fontFamily: {
                display: ["Inter", "ui-sans-serif", "system-ui"],
                mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular"]
            },
            boxShadow: {
                glow: "0 0 30px rgba(42, 245, 255, 0.25)",
                magenta: "0 0 32px rgba(255, 62, 165, 0.25)"
            },
            keyframes: {
                float: {
                    "0%, 100%": { transform: "translateY(0)" },
                    "50%": { transform: "translateY(-12px)" }
                },
                pulseRing: {
                    "0%": { transform: "scale(0.9)", opacity: "0.7" },
                    "70%": { transform: "scale(1.35)", opacity: "0" },
                    "100%": { transform: "scale(1.35)", opacity: "0" }
                }
            },
            animation: {
                float: "float 7s ease-in-out infinite",
                pulseRing: "pulseRing 1.8s ease-out infinite"
            }
        }
    },
    plugins: []
};
