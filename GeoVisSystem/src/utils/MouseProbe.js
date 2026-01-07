import * as THREE from 'three';

export class MouseProbe {
    constructor(camera, scene, container) {
        this.camera = camera;
        this.scene = scene;
        this.container = container;
        this.enabled = true;

        // HUD 信息面板
        this.hud = document.createElement('div');
        this.hud.id = 'probe-hud';
        Object.assign(this.hud.style, {
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '12px',
            pointerEvents: 'none',
            display: 'none',
            zIndex: '1000'
        });
        document.body.appendChild(this.hud);

        // 射线检测器
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
    }

    update(mouseEvent, terrainObj, seismicCtx, currentMode) {
        if (!this.enabled || !mouseEvent) {
            this.hud.style.display = 'none';
            return;
        }

        // 鼠标坐标转归一化设备坐标 (NDC)
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((mouseEvent.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((mouseEvent.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        let info = null;

        if (currentMode === 'terrain' && terrainObj && terrainObj.mesh) {
            const intersects = this.raycaster.intersectObject(terrainObj.mesh);
            if (intersects.length > 0) {
                const p = intersects[0].point;
                // 逆向映射：世界坐标 -> 数据索引

                const dem = terrainObj.demData;
                if (dem) {
                    const width = dem.width;
                    const height = dem.height;

                    // 将世界坐标转换为模型本地坐标
                    const localP = terrainObj.mesh.worldToLocal(p.clone());

                    // 本地坐标映射到数据索引
                    // PlaneGeometry UV 默认为 0..1

                    if (intersects[0].uv) {
                        const u = intersects[0].uv.x;
                        const v = intersects[0].uv.y;

                        const gridX = Math.floor(u * (width - 1));
                        const gridY = Math.floor((1 - v) * (height - 1));

                        const idx = gridY * width + gridX;
                        const val = dem.data[idx];

                        info = `X: ${gridX} Y: ${gridY} Z: ${val ? val.toFixed(1) : 'N/A'}`;
                    }
                }
            }
        } else if (currentMode === 'seismic' && seismicCtx) {
            // 检查切片
            const targets = [];
            if (seismicCtx.inlineSlice && seismicCtx.inlineSlice.mesh && seismicCtx.inlineSlice.mesh.visible) targets.push(seismicCtx.inlineSlice.mesh);
            if (seismicCtx.crosslineSlice && seismicCtx.crosslineSlice.mesh && seismicCtx.crosslineSlice.mesh.visible) targets.push(seismicCtx.crosslineSlice.mesh);
            if (seismicCtx.timeSlice && seismicCtx.timeSlice.mesh && seismicCtx.timeSlice.mesh.visible) targets.push(seismicCtx.timeSlice.mesh);

            const intersects = this.raycaster.intersectObjects(targets);
            if (intersects.length > 0) {
                const hit = intersects[0];
                const p = hit.point;

                // 映射回 Inline/Crossline/Time 索引
                // 地震体位于原点中心

                const data = seismicCtx.data;
                const cx = data.nInlines / 2;
                const cz = data.nCrosslines / 2;
                const cy = data.nSamples / 2;

                const il = Math.round(p.x + cx);
                const xl = Math.round(p.z + cz);
                const t = Math.round(-(p.y - cy));

                // 数据值查询
                // idx = (il * nCrosslines + xl) * nSamples + t;
                let val = 'N/A';
                if (il >= 0 && il < data.nInlines && xl >= 0 && xl < data.nCrosslines && t >= 0 && t < data.nSamples) {
                    const idx = (il * data.nCrosslines + xl) * data.nSamples + t;
                    val = data.volume[idx] ? data.volume[idx].toFixed(2) : 'N/A';
                }

                info = `IL: ${il} XL: ${xl} Time: ${t}ms Val: ${val}`;
            }
        }

        if (info) {
            this.hud.innerText = info;
            this.hud.style.display = 'block';
        } else {
            this.hud.style.display = 'none';
        }
    }

    dispose() {
        if (this.hud && this.hud.parentElement) {
            this.hud.parentElement.removeChild(this.hud);
        }
    }
}
