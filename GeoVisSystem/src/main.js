import '../style.css';
import { setupScene } from './scene.js';
import GUI from 'lil-gui';
import { DemLoader } from './loaders/DemLoader.js';
import { TerrainMesh, ColorSchemes } from './objects/TerrainMesh.js';
import { SegyLoader } from './loaders/SegyLoader.js';
import { SeismicSlice } from './objects/SeismicSlice.js';
import { SeismicWiggle } from './objects/SeismicWiggle.js';
import { MockLoader } from './utils/MockLoader.js';
import { ColorBar } from './utils/ColorBar.js';
import { SeismicBody } from './objects/SeismicBody.js';

import { MouseProbe } from './utils/MouseProbe.js';
import { Histogram } from './utils/Histogram.js';
import * as THREE from 'three';

const appState = {
    currentMode: 'terrain',
    bgColor: '#d6d6d6'
};

let lastMouseEvent = null;

const terrainParams = {
    exaggeration: 1.0,
    colorScheme: 'rainbow',
    loadFile: () => triggerFileInput('.tif', loadTerrain)
};

const seismicParams = {
    showInline: true, inlineIdx: 0,
    showCrossline: false, crosslineIdx: 0,
    showTime: false, timeIdx: 0,
    displayMode: 'density',
    wiggleGain: 1.0,
    wiggleFixedBlack: false, // Added missing param
    colorScheme: 'default', // Ensure defined
    loadFile: () => triggerFileInput('.sgy', loadSeismic)
};

let ctx = {
    scene: null, camera: null, controls: null, renderer: null, gui: null,
    container: null,
    activeFolder: null,
    terrainObj: null,
    activeFolder: null,
    terrainObj: null,
    seismicCtx: null,
    colorBar: null,
    activeFolder: null,
    terrainObj: null,
    seismicCtx: null,
    colorBar: null,
    mouseProbe: null,
    histogram: null
};

// 数据分析参数
const analysisParams = {
    showHistogram: false,
    showContours: false,
    contourInterval: 500, // 地震默认值
    contourIntervalTerrain: 50 // 地形默认值
};

// 自定义颜色配置状态
const customColorParams = {
    colorStart: '#000080', // 深蓝
    colorEnd: '#ffff00',   // 黄色
    useMid: false,         // 默认禁用中间色
    colorMid: '#ff0000',   // 红色
    midPos: 0.5
};

function updateGlobalCustomScheme() {
    // 1. 重建渐变色停靠点
    const stops = [];
    stops.push([0, customColorParams.colorStart]);
    if (customColorParams.useMid) {
        stops.push([customColorParams.midPos, customColorParams.colorMid]);
    }
    stops.push([1, customColorParams.colorEnd]);
    stops.sort((a, b) => a[0] - b[0]);

    // 2. 更新全局定义
    if (ColorSchemes['custom']) {
        ColorSchemes['custom'].stops = stops;
    }

    // 3. 触发地形更新
    if (ctx.terrainObj && terrainParams.colorScheme === 'custom') {
        ctx.terrainObj.updateColor('custom');
        if (ctx.colorBar) {
            ctx.colorBar.update(ctx.terrainObj.demData.min, ctx.terrainObj.demData.max, 'custom', true);
        }
    }

    // 4. 触发地震更新
    if (ctx.seismicCtx && seismicParams.colorScheme === 'custom') {
        refreshSeismic();
    }
}

init();

function init() {
    const app = document.querySelector('#app');
    const setup = setupScene(app);
    ctx.scene = setup.scene;
    ctx.camera = setup.camera;
    ctx.controls = setup.controls;
    ctx.renderer = setup.renderer;
    // Capture helpers
    ctx.helpers = { grid: setup.gridHelper, axes: setup.axesHelper };

    ctx.colorBar = new ColorBar(app);

    ctx.scene.background.set(appState.bgColor);

    ctx.gui = new GUI({ title: '三维地质可视系统', width: 320 });

    // Mouse Probe
    ctx.mouseProbe = new MouseProbe(ctx.camera, ctx.scene, app);

    // Screenshot


    // Histogram
    ctx.histogram = new Histogram(app);



    // Global View Settings (Helpers)
    const viewConfig = {
        showGrid: true,
        showAxes: true
    };

    // Logic to toggle helpers
    const toggleHelpers = () => {
        if (ctx.helpers.grid) ctx.helpers.grid.visible = viewConfig.showGrid;
        if (ctx.helpers.axes) ctx.helpers.axes.visible = viewConfig.showAxes;
    };

    // Store for referencing in specific menus if needed, or add global 'View' folder?
    // User asked "In both... join options".
    // I can add a common function to add these to any folder.
    ctx.viewConfig = viewConfig;
    ctx.toggleHelpers = toggleHelpers;

    const sysConfig = { mode: 'terrain' };
    ctx.gui.add(sysConfig, 'mode', {
        '地形可视化': 'terrain',
        '地震可视化': 'seismic'
    }).onChange(switchMode).name("切换系统");

    ctx.gui.addColor(appState, 'bgColor').name('场景背景').onChange(c => ctx.scene.background.set(c));



    window.addEventListener('mousemove', e => {
        lastMouseEvent = e;
    });

    // 初始全局工具渲染由 switchMode 处理
    switchMode('terrain');
    animate();
}

function clearGlobalTools() {
    if (ctx.folderAnalysis) { ctx.folderAnalysis.destroy(); ctx.folderAnalysis = null; }
    if (ctx.folderView) { ctx.folderView.destroy(); ctx.folderView = null; }
    if (ctx.ctrlScreenshot) { ctx.ctrlScreenshot.destroy(); ctx.ctrlScreenshot = null; }
}

function renderGlobalTools() {
    // 1. 数据透视工具
    const folderAnalysis = ctx.gui.addFolder('数据透视');
    folderAnalysis.add(analysisParams, 'showHistogram').name("直方图").onChange(v => {
        if (ctx.histogram) ctx.histogram.setEnabled(v);
        if (v) updateVisualAnalysis();
    });
    const ctrlShowContours = folderAnalysis.add(analysisParams, 'showContours').name("等值线").onChange(updateVisualAnalysis);

    const ctrlContourT = folderAnalysis.add(analysisParams, 'contourIntervalTerrain', 10, 200).name("等高距").onChange(updateVisualAnalysis);

    ctx.folderAnalysis = folderAnalysis;
    ctx.ctrlShowContours = ctrlShowContours;
    ctx.ctrlContourT = ctrlContourT;

    // 2. 辅助显示工具
    const folderView = ctx.gui.addFolder('辅助显示');
    folderView.add(ctx.viewConfig, 'showGrid').name("显示网格").onChange(ctx.toggleHelpers);
    folderView.add(ctx.viewConfig, 'showAxes').name("显示坐标轴").onChange(ctx.toggleHelpers);
    ctx.folderView = folderView;

    // 3. 截图工具
    const tools = {
        screenshot: () => {
            ctx.renderer.render(ctx.scene, ctx.camera);
            const dataURL = ctx.renderer.domElement.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `GeoVis_Screenshot_${Date.now()}.png`;
            link.href = dataURL;
            link.click();
        }
    };
    ctx.ctrlScreenshot = ctx.gui.add(tools, 'screenshot').name("一键截图");

    // 动态更新控件可见性
    updateVisualAnalysis();
}

function switchMode(mode) {
    appState.currentMode = mode;

    // 清场
    if (ctx.container) {
        ctx.scene.remove(ctx.container);
        ctx.container = null;
    }
    if (ctx.activeFolder) {
        ctx.activeFolder.destroy();
        ctx.activeFolder = null;
    }

    if (mode !== 'terrain' && ctx.colorBar) {
        ctx.colorBar.update(0, 0, 'rainbow', false);
    }

    if (mode === 'terrain') initTerrain();
    else initSeismic();

    // 重新渲染全局工具以保持在底部
    clearGlobalTools();
    renderGlobalTools();
}

async function initTerrain() {
    const folder = ctx.gui.addFolder('地形控制');
    ctx.activeFolder = folder;

    folder.add(terrainParams, 'loadFile').name("📂 导入 GeoTIFF");
    folder.add({ mock: () => loadTerrain('MOCK') }, 'mock').name(" Sinc函数");

    folder.add(terrainParams, 'exaggeration', 0.01, 100.0).name("Z轴夸张").onChange(v => {
        if (ctx.terrainObj && ctx.container) {
            const mesh = ctx.terrainObj.createMesh(v);
            ctx.container.clear();
            applyAutoFit(mesh, 2000);
            ctx.container.add(mesh);
            ctx.terrainObj.updateColor(terrainParams.colorScheme);
        }
    });



    const schemeOptions = {};
    Object.keys(ColorSchemes).forEach(k => {
        if (ColorSchemes[k]) schemeOptions[ColorSchemes[k].name] = k;
    });

    // 1. Color Scheme Control
    folder.add(terrainParams, 'colorScheme', schemeOptions)
        .name("颜色映射")
        .onChange(scheme => {
            if (scheme === 'custom') folderCustom.show();
            else folderCustom.hide();

            if (ctx.terrainObj) {
                ctx.terrainObj.updateColor(scheme);
                if (ctx.colorBar) {
                    ctx.colorBar.update(ctx.terrainObj.demData.min, ctx.terrainObj.demData.max, scheme, true);
                }
            }
        });

    // 2. Custom Color GUI (Using Global State)
    const folderCustom = folder.addFolder('自定义颜色配置');
    folderCustom.addColor(customColorParams, 'colorStart').name('起始颜色').onChange(updateGlobalCustomScheme);
    folderCustom.addColor(customColorParams, 'colorEnd').name('终止颜色').onChange(updateGlobalCustomScheme);

    // Toggle Control (Reordered)
    const ctrlUseMid = folderCustom.add(customColorParams, 'useMid').name('启用中间色');

    // Middle Color Controls
    const ctrlMidColor = folderCustom.addColor(customColorParams, 'colorMid').name('中间颜色').onChange(updateGlobalCustomScheme);
    const ctrlMidPos = folderCustom.add(customColorParams, 'midPos', 0.1, 0.9).name('中间位置').onChange(updateGlobalCustomScheme);

    // Toggle Logic
    const toggleMid = () => {
        if (customColorParams.useMid) {
            ctrlMidColor.show();
            ctrlMidPos.show();
        } else {
            ctrlMidColor.hide();
            ctrlMidPos.hide();
        }
        updateGlobalCustomScheme(); // Ensure changes are applied
    };

    ctrlUseMid.onChange(toggleMid);

    // Init Visibility
    toggleMid();

    // Initial sync
    updateGlobalCustomScheme();

    if (terrainParams.colorScheme !== 'custom') folderCustom.hide();

    await loadTerrain('MOCK');
}

async function loadTerrain(url) {
    showLoading(true);
    await nextFrame();

    try {
        if (ctx.container) {
            ctx.scene.remove(ctx.container);
            ctx.container = null;
        }

        let data;
        if (url === 'MOCK') data = MockLoader.createTerrain(512, 512);
        else {
            const loader = new DemLoader();
            data = await loader.load(url);
        }

        ctx.terrainObj = new TerrainMesh(data);
        const mesh = ctx.terrainObj.createMesh(terrainParams.exaggeration);

        ctx.terrainObj.updateColor(terrainParams.colorScheme);

        if (ctx.colorBar) {
            ctx.colorBar.update(data.min, data.max, terrainParams.colorScheme, true);
        }

        const box = new THREE.Box3().setFromObject(mesh);
        if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) {
            throw new Error("地形数据生成了无效的几何体 (NaN/Infinity)");
        }

        const group = new THREE.Group();
        group.add(mesh);

        // === 应用物理比例修正 ===
        // 如果我们从 TIF 元数据中获取了物理分辨率（例如：30米/像素），
        // 那么 Mesh 的 X/Y 应该放大到对应的物理尺寸，Z 已经是米了。
        // 或者反过来：我们把 Z 缩小，保持 X/Y 是像素坐标。
        // 既然我们之前假定 X/Y 是像素坐标，那么 Z 轴就需要除以 "米/像素"。
        // 比如分辨率 30米/像素。X=1代表30米。Z=1代表1米。
        // 那么 Z 在 Mesh 空间里应该显得很小 (1/30)。
        // 公式：MeshScaleZ = 1 / PixelResolution (单位：像素/米) -> 也就是 1 / (米/像素)

        let physicalScaleCorrection = 1.0;
        if (data.physicalScaleX) {
            // 平局分辨率
            const avgRes = (data.physicalScaleX + (data.physicalScaleY || data.physicalScaleX)) / 2;
            if (avgRes > 0) {
                console.log(`Main: Applying physical aspect ratio correction. Resolution: ${avgRes} m/pixel`);
                // 我们的 Mesh 平面是 width x height (像素单位)
                // 高度值是 (米)。
                // 为了统一到 "像素空间"：
                // 新高度 = (原高度米) / (分辨率 米/像素)
                physicalScaleCorrection = 1.0 / avgRes;
            }
        }

        // 我们把这个修正应用到 TerrainMesh 内部的 scale 或者外部的 scale
        // 为了不破坏 exaggeration 逻辑，我们乘进去
        mesh.scale.set(1, 1, physicalScaleCorrection);
        // 注意：TerrainMesh 是平面，默认是 X-Y 平面 rotateX 之后变 X-Z。
        // 原代码: geometry = PlaneGeometry(w, h), rotateX(-PI/2) -> 顶点变 (x, z, -y) or something?
        // Wait, TerrainMesh.js:
        // this.geometry = new THREE.PlaneGeometry(width, height, segX, segY);
        // this.geometry.rotateX(-Math.PI / 2);
        // posAttr.setY(i, y); -> Y 是高度。
        // 所以 Mesh 的 Y 轴是高度。
        mesh.scale.y *= physicalScaleCorrection;


        const success = applyAutoFit(mesh, 2000);
        if (!success) throw new Error("地形缩放失败 (Scale Error)");

        ctx.container = group;
        ctx.scene.add(group);
        fitCamera(group);

    } catch (e) {
        console.error(e);
        alert("地形加载失败: " + e.message);
    }
    showLoading(false);

    // Auto-update Analysis Tools
    updateVisualAnalysis();
}

async function initSeismic() {
    const folder = ctx.gui.addFolder('地震控制');
    ctx.activeFolder = folder;

    // Note: Controls are now added dynamically after data load in 'seismicGui' sub-folders.
    // We just create the container folder here.
    ctx.seismicGui = folder; // Use the main folder directly

    await loadSeismic('MOCK');
}

async function loadSeismic(url) {
    showLoading(true);
    await nextFrame();

    try {
        if (ctx.container) {
            ctx.scene.remove(ctx.container);
            ctx.container = null;
        }

        let data;
        if (url === 'MOCK') data = MockLoader.createSeismic(100, 100, 200);
        else {
            const loader = new SegyLoader();
            data = await loader.load(url);
        }

        ctx.seismicCtx = {
            data,
            inlineSlice: new SeismicSlice(data, 'inline'),
            crosslineSlice: new SeismicSlice(data, 'crossline'),
            timeSlice: new SeismicSlice(data, 'timeslice'),
            inlineWiggle: new SeismicWiggle(data, 'inline'),
            crosslineWiggle: new SeismicWiggle(data, 'crossline'),
            volumeBody: new SeismicBody(data)
        };

        seismicParams.inlineIdx = Math.floor(data.nInlines / 2);
        seismicParams.crosslineIdx = Math.floor(data.nCrosslines / 2);
        seismicParams.timeIdx = Math.floor(data.nSamples / 2);

        // Volume Params default
        seismicParams.showBody = false;
        seismicParams.bodyThreshold = 0.3;
        seismicParams.pointSize = 2.0;

        updateSeismicGUI(data);

        const group = new THREE.Group();
        ctx.container = group; // Assign early to prevent updateVolumeBody crash
        const sCtx = ctx.seismicCtx;
        const objs = [sCtx.inlineSlice, sCtx.crosslineSlice, sCtx.timeSlice, sCtx.inlineWiggle, sCtx.crosslineWiggle];

        objs.forEach(o => {
            const m = o.update(0);
            if (m) group.add(m);
        });

        // Force update to calculated default centers
        const c = ctx.seismicCtx;
        c.inlineSlice.update(seismicParams.inlineIdx);
        c.inlineWiggle.update(seismicParams.inlineIdx);
        c.crosslineSlice.update(seismicParams.crosslineIdx);
        c.crosslineWiggle.update(seismicParams.crosslineIdx);
        c.timeSlice.update(seismicParams.timeIdx);

        refreshSeismic();

        const success = applyAutoFit(group, 2000);
        if (!success) throw new Error("地震体缩放失败 (Scale Error)");


        ctx.scene.add(group);
        fitCamera(group);

    } catch (e) {
        console.error("LoadSeismic Global Error:", e);
        alert("地震加载失败: " + e.message);
    }
    showLoading(false);

    // Auto-update Analysis Tools
    updateVisualAnalysis();
}

// 根据配色方案名称获取颜色函数
function getColorFunction(schemeName) {
    if (!ColorSchemes[schemeName]) return null;
    const scheme = ColorSchemes[schemeName];

    // 返回归一化值到颜色的映射函数 (norm, targetColor)
    return (norm, target) => {
        // norm is 0..1
        if (scheme.type === 'hsl_rainbow') {
            target.setHSL((1.0 - norm) * 0.7, 1.0, 0.5);
        } else if (scheme.stops) {
            // 线性插值查找
            const stops = scheme.stops;
            if (norm <= stops[0][0]) { target.set(stops[0][1]); return; }
            if (norm >= stops[stops.length - 1][0]) { target.set(stops[stops.length - 1][1]); return; }
            for (let i = 0; i < stops.length - 1; i++) {
                if (norm >= stops[i][0] && norm <= stops[i + 1][0]) {
                    const t = (norm - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
                    const c1 = new THREE.Color(stops[i][1]);
                    const c2 = new THREE.Color(stops[i + 1][1]);
                    target.copy(c1).lerp(c2, t);
                    return;
                }
            }
        } else {
            target.set(0x000000); // 默认黑色
        }
    };
}

function updateSeismicGUI(data) {
    try {
        const gui = ctx.seismicGui;
        // Clear existing
        while (gui.children.length > 0) gui.children[0].destroy();
        while (gui.controllers.length > 0) gui.controllers[0].destroy();

        while (gui.children.length > 0) gui.children[0].destroy();
        while (gui.controllers.length > 0) gui.controllers[0].destroy();

        // Data Source Controls (Directly in main folder)


        gui.add(seismicParams, 'loadFile').name("📂 导入 SEGY");
        gui.add({ mock: () => loadSeismic('MOCK') }, 'mock').name("模拟数据");

        // === Folder 1: 2D Visualization ===
        const folder2D = gui.addFolder('二维可视化');

        // Display Mode
        folder2D.add(seismicParams, 'displayMode', { '变密度': 'density', '变面积': 'wiggle' })
            .name("显示模式")
            .onChange(() => {
                if (seismicParams.displayMode === 'wiggle') folderWiggle.show();
                else folderWiggle.hide();
                refreshSeismic();
            });

        // Wiggle Settings (Moved here)
        const folderWiggle = folder2D.addFolder('波形设置');
        folderWiggle.add(seismicParams, 'wiggleGain', 0.1, 10).name("波形增益").onChange(refreshSeismic);
        folderWiggle.add(seismicParams, 'wiggleFixedBlack').name("波形纯黑").onChange(refreshSeismic);

        // Initial visibility
        if (seismicParams.displayMode !== 'wiggle') folderWiggle.hide();

        // Initial visibility
        if (seismicParams.displayMode !== 'wiggle') folderWiggle.hide();





        // Slices

        // Slices
        const folderSlices = folder2D.addFolder('切片控制');
        folderSlices.add(seismicParams, 'showInline').name('纵测线').onChange(refreshSeismic);
        folderSlices.add(seismicParams, 'inlineIdx', 0, data.nInlines - 1, 1).name('位置').onChange(v => updateSeismicIndex('inline', v));

        folderSlices.add(seismicParams, 'showCrossline').name('横测线').onChange(refreshSeismic);
        folderSlices.add(seismicParams, 'crosslineIdx', 0, data.nCrosslines - 1, 1).name('位置').onChange(v => updateSeismicIndex('crossline', v));

        folderSlices.add(seismicParams, 'showTime').name('时间切片').onChange(refreshSeismic);
        folderSlices.add(seismicParams, 'timeIdx', 0, data.nSamples - 1, 1).name('位置').onChange(v => updateSeismicIndex('time', v));

        // === Folder 3: 3D Visualization ===
        const folder3D = gui.addFolder('三维可视化');
        folder3D.add(seismicParams, 'showBody').name('启用点云体').onChange(updateVolumeBody);
        folder3D.add(seismicParams, 'bodyThreshold', 0.1, 0.9).name('阈值过滤').onChange(updateVolumeBody);
        folder3D.add(seismicParams, 'pointSize', 1, 10).name('点大小').onChange(updateVolumeBody);

        // === Independent Color Control (Matches Terrain format) ===
        // 1. Color Scheme Control
        const colorOptions = { '默认': 'default' };
        Object.keys(ColorSchemes).forEach(k => {
            if (ColorSchemes[k]) {
                colorOptions[ColorSchemes[k].name] = k;
            }
        });

        gui.add(seismicParams, 'colorScheme', colorOptions)
            .name("颜色方案")
            .onChange(val => {
                if (val === 'custom') folderCustom.show();
                else folderCustom.hide();
                refreshSeismic();
            });

        // 2. Custom Gradient GUI
        const folderCustom = gui.addFolder('自定义颜色配置');
        folderCustom.addColor(customColorParams, 'colorStart').name('起始颜色').onChange(() => updateGlobalCustomScheme());
        folderCustom.addColor(customColorParams, 'colorEnd').name('终止颜色').onChange(() => updateGlobalCustomScheme());

        const ctrlUseMid = folderCustom.add(customColorParams, 'useMid').name('启用中间色');

        const ctrlMidColor = folderCustom.addColor(customColorParams, 'colorMid').name('中间颜色').onChange(() => updateGlobalCustomScheme());
        const ctrlMidPos = folderCustom.add(customColorParams, 'midPos', 0.1, 0.9).name('中间位置').onChange(() => updateGlobalCustomScheme());

        const toggleMid = () => {
            if (customColorParams.useMid) {
                ctrlMidColor.show();
                ctrlMidPos.show();
            } else {
                ctrlMidColor.hide();
                ctrlMidPos.hide();
            }
            updateGlobalCustomScheme();
        };

        ctrlUseMid.onChange(toggleMid);
        toggleMid();

        // Initial Visibility Check
        if (seismicParams.colorScheme !== 'custom') folderCustom.hide();

        folderWiggle.close(); // Collapse details by default
        folder3D.open(); // Open 3D folder by default as requested
    } catch (e) {
        console.error("Seismic GUI Error:", e);
    }
}

function updateVolumeBody() {
    const c = ctx.seismicCtx;
    if (!c || !c.volumeBody) return;

    // 查找或创建体积渲染专用组 (避免清除其他对象)
    let volGroup = ctx.container.getObjectByName('VolumeGroup');
    if (!volGroup) {
        volGroup = new THREE.Group();
        volGroup.name = 'VolumeGroup';
        ctx.container.add(volGroup);
    }

    volGroup.clear();

    if (seismicParams.showBody) {
        // 获取主颜色函数
        let mainColorFn = null;
        if (seismicParams.colorScheme && seismicParams.colorScheme !== 'default') {
            mainColorFn = getColorFunction(seismicParams.colorScheme);
        }

        const mesh = c.volumeBody.create(seismicParams.bodyThreshold, seismicParams.pointSize, mainColorFn);
        if (mesh) volGroup.add(mesh);
    }
}

function updateSeismicIndex(type, val) {
    const c = ctx.seismicCtx;
    if (!c) return;

    // 获取主颜色函数
    let colorFn = null;
    if (seismicParams.colorScheme && seismicParams.colorScheme !== 'default') {
        colorFn = getColorFunction(seismicParams.colorScheme);
    }

    // 波形函数检查
    let wiggleFn = seismicParams.wiggleFixedBlack ? null : colorFn;

    if (type === 'inline') {
        c.inlineSlice.update(val, colorFn, null);
        c.inlineWiggle.setColorMap(wiggleFn); // 确保颜色映射是最新的
        c.inlineWiggle.update(val);
    } else if (type === 'crossline') {
        c.crosslineSlice.update(val, colorFn, null);
        c.crosslineWiggle.setColorMap(wiggleFn);
        c.crosslineWiggle.update(val);
    } else if (type === 'time') {
        c.timeSlice.update(val, colorFn, null);
    }
}

function refreshSeismic() {
    const c = ctx.seismicCtx;
    if (!c) return;
    const isDensity = seismicParams.displayMode === 'density';

    // 获取主颜色映射函数
    let mainColorFn = null;
    if (seismicParams.colorScheme && seismicParams.colorScheme !== 'default') {
        mainColorFn = getColorFunction(seismicParams.colorScheme);
    }

    // 确定波形颜色函数
    let wiggleColorFn = seismicParams.wiggleFixedBlack ? null : mainColorFn;

    // 更新全局波形的颜色映射
    if (c.inlineWiggle) c.inlineWiggle.setColorMap(wiggleColorFn);
    if (c.crosslineWiggle) c.crosslineWiggle.setColorMap(wiggleColorFn);

    // 变密度模式下强制更新切片颜色
    // (移除了等值线配置)

    if (isDensity) {
        if (seismicParams.showInline) c.inlineSlice.update(seismicParams.inlineIdx, mainColorFn, null);
        if (seismicParams.showCrossline) c.crosslineSlice.update(seismicParams.crosslineIdx, mainColorFn, null);
    }
    // 时间切片更新
    if (seismicParams.showTime) c.timeSlice.update(seismicParams.timeIdx, mainColorFn, null);


    // 波形增益更新
    if (c.inlineWiggle) {
        c.inlineWiggle.gain = seismicParams.wiggleGain;
        c.inlineWiggle.traceSpacing = 1.0;
    }
    if (c.crosslineWiggle) {
        c.crosslineWiggle.gain = seismicParams.wiggleGain;
        c.crosslineWiggle.traceSpacing = 1.0;
    }

    // 可见性逻辑
    if (c.inlineSlice.mesh) c.inlineSlice.mesh.visible = seismicParams.showInline && isDensity;

    if (c.inlineWiggle.mesh) {
        c.inlineWiggle.mesh.visible = seismicParams.showInline && !isDensity;
        if (c.inlineWiggle.mesh.visible) c.inlineWiggle.update(seismicParams.inlineIdx);
    }

    if (c.crosslineSlice.mesh) c.crosslineSlice.mesh.visible = seismicParams.showCrossline && isDensity;

    if (c.crosslineWiggle.mesh) {
        c.crosslineWiggle.mesh.visible = seismicParams.showCrossline && !isDensity;
        if (c.crosslineWiggle.mesh.visible) c.crosslineWiggle.update(seismicParams.crosslineIdx);
    }

    // 时间切片：如果选中始终可见 (用户要求)
    // 注意：它以变密度（纹理）方式渲染
    if (c.timeSlice.mesh) c.timeSlice.mesh.visible = seismicParams.showTime;

    // 更新色标条
    if (ctx.colorBar) {
        const min = c.data.min;
        const max = c.data.max;
        const schemeName = (seismicParams.colorScheme === 'default') ? 'seismic' : seismicParams.colorScheme;

        if (isDensity) {
            ctx.colorBar.update(min, max, schemeName, true);
        } else {
            // 波形模式：仅在有颜色时显示色标
            if (!seismicParams.wiggleFixedBlack) {
                ctx.colorBar.update(min, max, schemeName, true);
            } else {
                ctx.colorBar.update(0, 0, 'black', false); // 纯黑模式下隐藏
            }
        }
    }

    // 确保三维体随颜色更新
    updateVolumeBody();
}

function updateVisualAnalysis() {
    // 1. 直方图更新
    if (analysisParams.showHistogram && ctx.histogram) {
        if (appState.currentMode === 'terrain' && ctx.terrainObj && ctx.terrainObj.demData) {
            const d = ctx.terrainObj.demData;
            ctx.histogram.update(d.data, d.min, d.max, 50);
        } else if (appState.currentMode === 'seismic' && ctx.seismicCtx) {
            const d = ctx.seismicCtx.data;
            // 地震数据较大，直方图模块内部会自动降采样处理
            ctx.histogram.update(d.volume, d.min, d.max, 50);
        }
    } else {
        if (ctx.histogram) ctx.histogram.setEnabled(false);
    }

    // 2. 等值线
    if (appState.currentMode === 'terrain') {
        if (ctx.ctrlShowContours) ctx.ctrlShowContours.show();
        if (ctx.ctrlContourT) ctx.ctrlContourT.show();

        if (ctx.terrainObj) {
            ctx.terrainObj.updateContours(analysisParams.showContours, analysisParams.contourIntervalTerrain);
        }
    } else if (appState.currentMode === 'seismic') {
        // 地震模式下彻底隐藏等值线控件
        if (ctx.ctrlShowContours) ctx.ctrlShowContours.hide();
        if (ctx.ctrlContourT) ctx.ctrlContourT.hide();

        refreshSeismic();
    }
}

function applyAutoFit(obj, targetSize) {
    obj.scale.set(1, 1, 1);
    obj.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return false;

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z);

    if (maxDim <= 0.00001 || !isFinite(maxDim)) return false;

    const scale = targetSize / maxDim;
    if (!isFinite(scale) || scale <= 0) return false;

    obj.scale.set(scale, scale, scale);
    return true;
}

function fitCamera(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);

    if (!isFinite(center.x)) return;

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const dist = maxDim * 1.5;

    ctx.camera.position.set(center.x + dist, center.y + dist * 0.6, center.z + dist);
    ctx.controls.target.copy(center);
    ctx.controls.update();
}

function triggerFileInput(accept, cb) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = e => {
        if (e.target.files[0]) cb(URL.createObjectURL(e.target.files[0]));
        document.body.removeChild(input);
    };
    document.body.appendChild(input);
    setTimeout(() => input.click(), 50);
}

function showLoading(show) {
    const el = document.querySelector('#loading');
    if (el) el.style.display = show ? 'block' : 'none';
}

function nextFrame() {
    return new Promise(r => requestAnimationFrame(r));
}

function animate() {
    requestAnimationFrame(animate);
    if (ctx.controls) ctx.controls.update();

    // Mouse Probe Update
    if (ctx.mouseProbe) {
        ctx.mouseProbe.update(lastMouseEvent, ctx.terrainObj, ctx.seismicCtx, appState.currentMode);
    }

    if (ctx.renderer) ctx.renderer.render(ctx.scene, ctx.camera);
}
