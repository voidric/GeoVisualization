import * as THREE from 'three';

export class SeismicWiggle {
    constructor(segyData, type = 'inline') {
        this.data = segyData;
        this.type = type; // 'inline' 或 'crossline'
        this.mesh = null;
        this.geometry = null;
        this.material = null;

        this.gain = 1.0;
        this.traceSpacing = 1.0;
        this.colorScalar = null; // 值到颜色的映射函数

        this.nInlines = segyData.nInlines;
        this.nCrosslines = segyData.nCrosslines;
        this.nSamples = segyData.nSamples;
        this.index = 0;
    }

    setColorMap(colorFn) {
        this.colorScalar = colorFn;
        if (this.mesh && this.index !== undefined) this.update(this.index);
    }

    update(index) {
        this.index = Math.floor(index);

        // 1. 提取地震道数据
        const sliceData = this.getSliceData(this.index);
        if (!sliceData) return null;

        const { buffer, width, height } = sliceData;

        const vertices = [];
        const colors = []; // 顶点颜色
        const maxAmp = Math.max(Math.abs(this.data.min), Math.abs(this.data.max)) || 1;
        const scaler = (this.gain * 2.0) / maxAmp;
        const colHelper = new THREE.Color();

        for (let i = 0; i < width; i++) {
            const baseX = i * this.traceSpacing;

            for (let j = 0; j < height - 1; j++) {
                const idx1 = j * width + i;
                const idx2 = (j + 1) * width + i;

                const val1 = buffer[idx1];
                const val2 = buffer[idx2];

                // 仅填充波峰（正值部分）
                if (val1 > 0 || val2 > 0) {
                    const y1 = j;
                    const y2 = j + 1;

                    const amp1 = Math.max(0, val1) * scaler;
                    const amp2 = Math.max(0, val2) * scaler;

                    const x1 = baseX + amp1;
                    const x2 = baseX + amp2;

                    // 构建四边形

                    // 颜色逻辑
                    let c1r = 0, c1g = 0, c1b = 0; // 基准线颜色（0值）
                    let c2r = 0, c2g = 0, c2b = 0; // 波峰颜色

                    // 如果有颜色映射则使用，否则默认为黑色
                    if (this.colorScalar) {
                        // 基准 (0)
                        this.colorScalar(0, colHelper);
                        c1r = colHelper.r; c1g = colHelper.g; c1b = colHelper.b;

                        // 波峰值
                        this.colorScalar(val1 / maxAmp, colHelper);
                        c2r = colHelper.r; c2g = colHelper.g; c2b = colHelper.b;

                        // Val2
                        // ...
                    }

                    const pushColor = (v) => {
                        if (this.colorScalar) {
                            // 将值(-Max..Max)归一化到 0..1
                            const norm = (v / maxAmp + 1) / 2;
                            this.colorScalar(norm, colHelper);
                            colors.push(colHelper.r, colHelper.g, colHelper.b);
                        } else {
                            // 默认黑色
                            colors.push(0, 0, 0);
                        }
                    };

                    // 三角形 1
                    vertices.push(baseX, y1, 0); pushColor(0);
                    vertices.push(x1, y1, 0); pushColor(val1);
                    vertices.push(baseX, y2, 0); pushColor(0);

                    // 三角形 2
                    vertices.push(x1, y1, 0); pushColor(val1);
                    vertices.push(x2, y2, 0); pushColor(val2);
                    vertices.push(baseX, y2, 0); pushColor(0);
                }
            }
        }

        const f32Vertices = new Float32Array(vertices);
        const f32Colors = new Float32Array(colors);

        if (!this.geometry) this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(f32Vertices, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(f32Colors, 3));

        this.geometry.computeVertexNormals();

        if (!this.material) this.material = new THREE.MeshBasicMaterial({
            color: 0xffffff, // 使用白色底色以便显示顶点颜色
            vertexColors: true,
            side: THREE.DoubleSide
        });

        if (!this.mesh) this.mesh = new THREE.Mesh(this.geometry, this.material);

        this.mesh.rotation.set(0, 0, 0);
        this.mesh.scale.set(1, 1, 1);
        this.mesh.position.set(0, 0, 0);

        if (this.type === 'inline') {
            this.mesh.rotation.y = Math.PI / 2;
            // 旋转 Y 90 度以匹配世界坐标系 (Inline)
            this.mesh.position.set(this.index - this.nInlines / 2, -this.nSamples / 2, this.nCrosslines / 2);
        } else if (this.type === 'crossline') {
            this.mesh.position.set(-this.nInlines / 2, -this.nSamples / 2, this.index - this.nCrosslines / 2);
        }

        return this.mesh;
    }

    getSliceData(index) {
        const { volume, nInlines, nCrosslines, nSamples } = this.data;
        let width, height;
        let buffer;

        if (this.type === 'inline') {
            width = nCrosslines; height = nSamples;
            buffer = new Float32Array(width * height);
            const il = index;
            if (il >= 0 && il < nInlines) {
                for (let xl = 0; xl < nCrosslines; xl++) {
                    const off = (il * nCrosslines + xl) * nSamples;
                    for (let t = 0; t < nSamples; t++) buffer[t * width + xl] = volume[off + t];
                }
            }
        } else {
            width = nInlines; height = nSamples;
            buffer = new Float32Array(width * height);
            const xl = index;
            if (xl >= 0 && xl < nCrosslines) {
                for (let il = 0; il < nInlines; il++) {
                    const off = (il * nCrosslines + xl) * nSamples;
                    for (let t = 0; t < nSamples; t++) buffer[t * width + il] = volume[off + t];
                }
            }
        }
        return { buffer, width, height };
    }
}
