import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function setupScene(container) {
    // 1. 场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020); // 深色背景

    // 2. 相机
    const camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        50000
    );
    camera.position.set(2000, 2000, 2000);
    camera.lookAt(0, 0, 0);

    // 3. 渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 禁用右键菜单
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

    container.appendChild(renderer.domElement);

    // 4. 控制器
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true; // 允许上下平移

    // 自定义鼠标操作
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: null // 禁用右键
    };

    // 5. 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    // 辅助工具
    const gridHelper = new THREE.GridHelper(5000, 50);
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(500);
    scene.add(axesHelper);

    // 窗口缩放适配
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer, controls, gridHelper, axesHelper };
}
