// src/utils/MockLoader.js

export class MockLoader {
    // 生成模拟地形数据 (Sinc 函数)
    static createTerrain(width = 256, height = 256) {
        const size = width * height;
        const data = new Float32Array(size);
        let min = Infinity;
        let max = -Infinity;

        const cx = width / 2;
        const cy = height / 2;

        // Sinc 函数模拟地形: sin(r)/r
        const frequency = 0.1;
        const amplitude = 50.0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const dx = x - cx;
                const dy = y - cy;
                const r = Math.sqrt(dx * dx + dy * dy);

                let val;
                if (r === 0) {
                    val = amplitude; // limit r->0
                } else {
                    val = (Math.sin(r * frequency) / (r * frequency)) * amplitude;
                }

                const idx = y * width + x;
                data[idx] = val;

                if (val < min) min = val;
                if (val > max) max = val;
            }
        }

        console.log("Mock Terrain (Sinc) Generated:", { width, height, min, max });
        return { width, height, data, min, max };
    }

    // 生成模拟地震数据 (水平层状结构 + 简单起伏)
    static createSeismic(nInlines = 100, nCrosslines = 100, nSamples = 200) {
        const size = nInlines * nCrosslines * nSamples;
        const volume = new Float32Array(size);

        const inlines = Array.from({ length: nInlines }, (_, i) => i + 1);
        const crosslines = Array.from({ length: nCrosslines }, (_, i) => i + 1);

        let min = -1.0;
        let max = 1.0;

        for (let il = 0; il < nInlines; il++) {
            for (let xl = 0; xl < nCrosslines; xl++) {
                // 构造平滑的褶皱结构
                const shift = Math.sin(il * 0.05) * 15 + Math.cos(xl * 0.05) * 15;

                for (let t = 0; t < nSamples; t++) {
                    const idx = (il * nCrosslines + xl) * nSamples + t;

                    // 地层结构生成
                    // 基础正弦信号
                    let val = Math.sin((t + shift) * 0.15);

                    // 添加明显的岩层特征 (模拟反射层)
                    // 层 A
                    if (t > 40 + shift && t < 60 + shift) val += 1.2;
                    // 层 B
                    if (t > 110 + shift && t < 130 + shift) val -= 1.2;

                    // Clamp to -1..1 range conceptually, or just let it be. 
                    // Normalization happens in Slice/Wiggle renderers usually or min/max calculation.

                    volume[idx] = val;
                }
            }
        }

        console.log("Mock Seismic Generated:", { dim: [nInlines, nCrosslines, nSamples] });

        return {
            volume,
            min, max,
            nInlines, nCrosslines, nSamples,
            inlines, crosslines
        };
    }
}
