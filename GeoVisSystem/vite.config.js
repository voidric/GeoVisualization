import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
    base: './', // 确保构建后使用相对路径，方便部署
    plugins: [viteSingleFile()],
    server: {
        open: false,
        host: true
    }
});
