import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile"

export default defineConfig({
    build: {
        target: 'es2019',
        chunkSizeWarningLimit: 1000
    },
    plugins: [viteSingleFile()]
});