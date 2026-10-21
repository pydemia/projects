import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.PROJECTS_API_URL ?? "http://127.0.0.1:18731";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            "/api": { target: apiTarget, changeOrigin: false },
            "/health": { target: apiTarget, changeOrigin: false },
        },
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test-setup.ts"],
        restoreMocks: true,
    },
});
