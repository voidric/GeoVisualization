import * as THREE from 'three';

export class SeismicBody {
    constructor(segyData) {
        this.data = segyData;
        this.mesh = null;
        this.geometry = null;
        this.material = null;

        this.threshold = 0.5; // 归一化值 0..1
        this.pointSize = 2;
        this.opacity = 0.5;
        this.sampleRate = 4; // 降采样以减少点数 (1=全部, 2=一半, 等)
    }

    create(threshold = 0.5, pointSize = 3, colorFn = null) {
        this.threshold = threshold;
        this.pointSize = pointSize;

        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }

        const { volume, nInlines, nCrosslines, nSamples, min, max } = this.data;
        const range = Math.max(Math.abs(min), Math.abs(max)) || 0.0001;

        const vertices = [];
        const colors = [];

        // 中心偏移量
        const cx = nInlines / 2;
        const cy = nSamples / 2;
        const cz = nCrosslines / 2;

        const step = 1;
        const samplingRate = 0.25; // 降低采样率至 25% (随机采样) 以彻底打破网格规律

        // 颜色辅助对象
        const color = new THREE.Color();

        for (let il = 0; il < nInlines; il += step) {
            for (let xl = 0; xl < nCrosslines; xl += step) {
                for (let t = 0; t < nSamples; t += step) {
                    // 随机采样：有效消除摩尔条纹
                    if (Math.random() > samplingRate) continue;

                    const idx = (il * nCrosslines + xl) * nSamples + t;
                    const val = volume[idx];
                    const absVal = Math.abs(val);
                    const normMag = absVal / range; // 0..1 幅值

                    if (normMag > this.threshold) {
                        // 添加点
                        const x = il - cx;
                        const y = -t; // 时间深度为负 Y
                        const z = xl - cz;

                        // 即使是随机采样，由于浮点精度，仍建议保留微量扰动，但可减小
                        const jitter = 0.2;
                        const jx = (Math.random() - 0.5) * jitter;
                        const jy = (Math.random() - 0.5) * jitter;
                        const jz = (Math.random() - 0.5) * jitter;

                        vertices.push(x + jx, y + cy + jy, z + jz);

                        // 颜色逻辑
                        if (colorFn) {
                            // 映射值 (-range..range) 到 0..1
                            const fullNorm = val / range;
                            const tCol = (fullNorm + 1) / 2; // 0..1
                            colorFn(tCol, color);
                        } else {
                            // 默认 红(+) / 蓝(-)
                            if (val > 0) color.setHSL(0.0, 1.0, 0.5); // 红色
                            else color.setHSL(0.66, 1.0, 0.5); // 蓝色
                        }

                        colors.push(color.r, color.g, color.b);
                    }
                }
            }
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        this.material = new THREE.PointsMaterial({
            size: this.pointSize,
            vertexColors: true,
            transparent: false, // 关闭透明度，渲染为实心点
            opacity: 1.0,
            sizeAttenuation: true
            // depthWrite 默认为 true
        });

        this.mesh = new THREE.Points(this.geometry, this.material);
        return this.mesh;
    }
}
