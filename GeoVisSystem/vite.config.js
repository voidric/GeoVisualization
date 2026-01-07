import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // 确保构建后使用相对路径，方便部署
    server: {
        open: false,
        host: true
    }
});
