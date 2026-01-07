import * as THREE from 'three';

export const ColorSchemes = {
    'rainbow': { name: '标准彩虹', type: 'hsl_rainbow' },
    'jet': { name: '高对比彩虹', stops: [[0, '#000080'], [0.125, '#0000ff'], [0.375, '#00ffff'], [0.625, '#ffff00'], [0.875, '#ff0000'], [1, '#800000']] },
    'viridis': { name: '翠绿', stops: [[0, '#440154'], [0.25, '#3b528b'], [0.5, '#21918c'], [0.75, '#5ec962'], [1, '#fde725']] },
    'plasma': { name: '等离子', stops: [[0, '#0d0887'], [0.25, '#7e03a8'], [0.5, '#cc4778'], [0.75, '#f89540'], [1, '#f0f921']] },
    'magma': { name: '岩浆', stops: [[0, '#000004'], [0.25, '#3b0f70'], [0.5, '#8c2981'], [0.75, '#de4968'], [1, '#fcfdbf']] },
    'heat': { name: '热力图', stops: [[0, '#000000'], [0.4, '#800000'], [0.6, '#ff0000'], [0.8, '#ffff00'], [1, '#ffffff']] },
    'ocean': { name: '海洋', stops: [[0, '#e0f7fa'], [1, '#01579b']] },
    'terrain': { name: '自然地形', stops: [[0, '#006994'], [0.1, '#f9e4b7'], [0.3, '#2e7d32'], [0.7, '#fdd835'], [1, '#5d4037']] },
    'grayscale': { name: '灰度', stops: [[0, '#000000'], [1, '#ffffff']] },
    'cool': { name: '冷色调', stops: [[0, '#00ffff'], [1, '#ff00ff']] },
    'warm': { name: '暖色调', stops: [[0, '#ff00ff'], [1, '#ffff00']] },
    'spring': { name: '春意', stops: [[0, '#ff00ff'], [1, '#00ffff']] },
    'summer': { name: '夏日', stops: [[0, '#008030'], [1, '#ffff00']] },
    'winter': { name: '冬雪', stops: [[0, '#0000ff'], [1, '#00ffff']] },
    'custom': { name: '自定义', stops: [[0, '#0000ff'], [1, '#ff0000']] }
};

export class TerrainMesh {
    constructor(demData) {
        this.demData = demData;
        this.mesh = null;
        this.material = null;
        this.geometry = null;
    }

    createMesh(exaggeration = 1) {
        const { width, height, data, min, max } = this.demData;
        const segX = Math.min(width - 1, 300);
        const segY = Math.min(height - 1, 300);

        this.geometry = new THREE.PlaneGeometry(width, height, segX, segY);
        this.geometry.rotateX(-Math.PI / 2);

        const count = this.geometry.attributes.position.count;
        const posAttr = this.geometry.attributes.position;

        // 混合锚点计算
        let anchor = min;
        if (min < 0 && max > 0) {
            anchor = 0;
        }

        for (let i = 0; i < count; i++) {
            const ix = i % (segX + 1);
            const iy = Math.floor(i / (segX + 1));
            const imgX = Math.floor((ix / segX) * (width - 1));
            const imgY = Math.floor((iy / segY) * (height - 1));

            const dataIndex = (height - 1 - imgY) * width + imgX;
            const h = data[dataIndex] || 0;

            const y = (h - anchor) * exaggeration;
            posAttr.setY(i, y);
        }

        this.geometry.computeBoundingBox();
        this.geometry.computeVertexNormals();

        // 初始化颜色缓冲区
        const colors = new Float32Array(count * 3);
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // 等值线 Shader 参数
        this.contourUniforms = {
            uShowContours: { value: 0 },
            uContourInterval: { value: 50.0 },
            uContourColor: { value: new THREE.Color(0xffffff) }
        };

        this.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0.2,
            flatShading: false
        });

        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.uShowContours = this.contourUniforms.uShowContours;
            shader.uniforms.uContourInterval = this.contourUniforms.uContourInterval;
            shader.uniforms.uContourColor = this.contourUniforms.uContourColor;

            shader.fragmentShader = `
                uniform float uShowContours;
                uniform float uContourInterval;
                uniform vec3 uContourColor;
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `
                #include <dithering_fragment>
                if (uShowContours > 0.5) {
                    float f = vPosition.y / uContourInterval;
                    float df = fwidth(f);
                    float lineStr = smoothstep(1.0 - df, 1.0, fract(f));
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, uContourColor, lineStr * 0.8);
                }
                `
            );

            // Need vPosition in fragment, but Standard material usually has vViewPosition.
            // We need world or local position. 
            // 'common' chunk has vPosition? No. 
            // We should inject varying vPosition in vertex and fragment.

            shader.vertexShader = `
                varying vec3 vPosWorld;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                `
                #include <worldpos_vertex>
                vPosWorld = (modelMatrix * vec4( transformed, 1.0 )).xyz;
                `
            );

            shader.fragmentShader = `
                varying vec3 vPosWorld;
            ` + shader.fragmentShader;

            // Use vPosWorld.y in the mixing logic above instead of vPosition.
            shader.fragmentShader = shader.fragmentShader.replace(
                'float f = vPosition.y / uContourInterval;',
                'float f = vPosWorld.y / uContourInterval;'
            );
        };

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        // Default Scheme
        this.updateColor('rainbow');

        return this.mesh;
    }

    updateContours(visible, interval) {
        if (!this.contourUniforms) return;
        this.contourUniforms.uShowContours.value = visible ? 1 : 0;
        this.contourUniforms.uContourInterval.value = interval;
    }

    updateColor(schemeName) {
        if (!this.geometry) return;

        const scheme = ColorSchemes[schemeName] || ColorSchemes['rainbow'];
        const colorAttr = this.geometry.attributes.color;
        const posAttr = this.geometry.attributes.position;
        const count = posAttr.count;

        const { width, height, data, min, max } = this.demData;
        const range = max - min || 1;
        const segX = Math.min(width - 1, 300);
        const segY = Math.min(height - 1, 300);

        // Prepare Lerp for stops
        let lerpFunc = null;
        if (scheme.type === 'hsl_rainbow') {
            lerpFunc = (t, outColor) => {
                // Blue(0.0) -> Red(1.0)
                outColor.setHSL(0.6 - t * 0.6, 1.0, 0.5);
            };
        } else {
            // Pre-parse stops colors
            const stops = scheme.stops.map(s => ({ t: s[0], c: new THREE.Color(s[1]) }));
            lerpFunc = (t, outColor) => {
                // Find gap
                if (t <= stops[0].t) { outColor.copy(stops[0].c); return; }
                if (t >= stops[stops.length - 1].t) { outColor.copy(stops[stops.length - 1].c); return; }

                for (let k = 0; k < stops.length - 1; k++) {
                    const s1 = stops[k];
                    const s2 = stops[k + 1];
                    if (t >= s1.t && t <= s2.t) {
                        const alpha = (t - s1.t) / (s2.t - s1.t);
                        outColor.copy(s1.c).lerp(s2.c, alpha);
                        return;
                    }
                }
            };
        }

        const tmpColor = new THREE.Color();

        for (let i = 0; i < count; i++) {
            const ix = i % (segX + 1);
            const iy = Math.floor(i / (segX + 1));
            const imgX = Math.floor((ix / segX) * (width - 1));
            const imgY = Math.floor((iy / segY) * (height - 1));

            const dataIndex = (height - 1 - imgY) * width + imgX;
            const h = data[dataIndex] || 0;

            let t = (h - min) / range;
            if (t < 0) t = 0;
            if (t > 1) t = 1;

            lerpFunc(t, tmpColor);
            colorAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
        }

        colorAttr.needsUpdate = true;
    }

    updateScale(exaggeration) {
        if (!this.mesh) return;
        this.mesh.geometry.dispose();
        const newMesh = this.createMesh(exaggeration);
        this.mesh.geometry = newMesh.geometry;
    }
}
