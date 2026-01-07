import * as THREE from 'three';

export class SeismicSlice {
    constructor(segyData, type = 'inline') {
        this.data = segyData;
        this.type = type;
        this.mesh = null;
        this.texture = null;
        this.index = 0;
    }

    update(index, colorFn = null, contourParams = null) {
        this.index = Math.floor(index);
        const { volume, nInlines, nCrosslines, nSamples, min, max } = this.data;

        // 1. 提取切片数据
        let sliceWidth, sliceHeight;
        let buffer;

        if (this.type === 'inline') {
            sliceWidth = nCrosslines;
            sliceHeight = nSamples;
        } else if (this.type === 'crossline') {
            sliceWidth = nInlines;
            sliceHeight = nSamples;
        } else { // time
            sliceWidth = nInlines;
            sliceHeight = nCrosslines;
        }

        buffer = new Float32Array(sliceWidth * sliceHeight);

        if (this.type === 'inline') {
            const il = this.index;
            if (il < 0 || il >= nInlines) return null;
            for (let xl = 0; xl < nCrosslines; xl++) {
                const traceOffset = (il * nCrosslines + xl) * nSamples;
                for (let t = 0; t < nSamples; t++) {
                    buffer[t * sliceWidth + xl] = volume[traceOffset + t];
                }
            }
        } else if (this.type === 'crossline') {
            const xl = this.index;
            if (xl < 0 || xl >= nCrosslines) return null;
            for (let il = 0; il < nInlines; il++) {
                const traceOffset = (il * nCrosslines + xl) * nSamples;
                for (let t = 0; t < nSamples; t++) {
                    buffer[t * sliceWidth + il] = volume[traceOffset + t];
                }
            }
        } else { // time
            const t = this.index;
            if (t < 0 || t >= nSamples) return null;
            for (let il = 0; il < nInlines; il++) {
                for (let xl = 0; xl < nCrosslines; xl++) {
                    buffer[xl * sliceWidth + il] = volume[(il * nCrosslines + xl) * nSamples + t];
                }
            }
        }

        // 2. 归一化与着色
        const size = sliceWidth * sliceHeight;
        const texData = new Uint8Array(size * 4);
        const range = Math.max(Math.abs(min), Math.abs(max)) || 1.0;
        const colHelper = new THREE.Color();

        // 等值线参数
        const showContour = contourParams && contourParams.show;
        const interval = contourParams ? contourParams.interval : 500;
        const cColor = contourParams ? contourParams.color : [255, 255, 255];
        // 阈值计算
        const threshold = interval * 0.05;

        for (let i = 0; i < size; i++) {
            let val = buffer[i];
            let norm = val / range; // -1 to 1
            if (norm < -1) norm = -1;
            if (norm > 1) norm = 1;

            if (norm > 1) norm = 1;

            // 映射 -1..1 到 0..1
            const t = (norm + 1) / 2;

            let r, g, b;

            if (colorFn) {
                // colorFn expects 0..1
                colorFn(t, colHelper);
                // 默认 BWR 逻辑
                r = Math.floor(colHelper.r * 255);
                g = Math.floor(colHelper.g * 255);
                b = Math.floor(colHelper.b * 255);
            } else {
                // Default Blue-White-Red
                if (t < 0.5) {
                    const lt = t * 2;
                    r = Math.floor(lt * 255); g = Math.floor(lt * 255); b = 255;
                } else {
                    const lt = (t - 0.5) * 2;
                    r = 255; g = Math.floor((1 - lt) * 255); b = Math.floor((1 - lt) * 255);
                }
            }

            if (showContour) {
                // 等值线叠加
                const f = Math.abs(val / interval);
                const fract = Math.abs(f - Math.round(f));
                if (fract < 0.05) {
                    r = cColor[0]; g = cColor[1]; b = cColor[2];
                }
            }

            texData[i * 4] = r; texData[i * 4 + 1] = g; texData[i * 4 + 2] = b; texData[i * 4 + 3] = 255;
        }

        // 3. 更新纹理
        if (this.texture) {
            if (this.texture.image.width !== sliceWidth || this.texture.image.height !== sliceHeight) {
                this.texture.dispose();
                this.texture = new THREE.DataTexture(texData, sliceWidth, sliceHeight, THREE.RGBAFormat);
                this.texture.needsUpdate = true;
                if (this.mesh) this.mesh.material.map = this.texture;
            } else {
                this.texture.image.data = texData;
                this.texture.needsUpdate = true;
            }
        } else {
            this.texture = new THREE.DataTexture(texData, sliceWidth, sliceHeight, THREE.RGBAFormat);
            this.texture.needsUpdate = true;
        }

        // 4. 创建网格
        if (!this.mesh) {
            const geo = new THREE.PlaneGeometry(1, 1);
            const mat = new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide });
            this.mesh = new THREE.Mesh(geo, mat);
        }

        // 5. 定位与旋转 (标准: Inline=X, Crossline=Z, Time=Y)
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.scale.set(1, 1, 1);
        this.mesh.position.set(0, 0, 0);

        if (this.type === 'inline') {
            // 调整平面几何以匹配切片方向
            this.mesh.rotation.y = Math.PI / 2;
            this.mesh.scale.set(sliceWidth, sliceHeight, 1);

            // X = 索引偏移
            this.mesh.position.set(this.index - nInlines / 2, 0, 0);

        } else if (this.type === 'crossline') {
            // 无需旋转 (XY平铺)
            this.mesh.scale.set(sliceWidth, sliceHeight, 1);

            // Z = 索引偏移
            this.mesh.position.set(0, 0, this.index - nCrosslines / 2);

        } else { // time
            // 旋转至水平面 (XZ)
            this.mesh.rotation.x = -Math.PI / 2;
            this.mesh.scale.set(sliceWidth, sliceHeight, 1);

            // Y = 索引偏移
            this.mesh.position.set(0, this.index - nSamples / 2, 0);
        }

        return this.mesh;
    }
}
