import { fromUrl } from 'geotiff';

export class DemLoader {
    constructor() { }

    async load(url) {
        try {
            console.log("DemLoader: loading", url);
            const tiff = await fromUrl(url);
            const image = await tiff.getImage();

            // === 1. 解析地理元数据 (Geo Keys) ===
            // 我们需要计算 X/Y 方向上的 "米/像素" 分辨率，以便与 Z (米) 对齐。
            // GeoTIFF 通常使用 ModelPixelScale 或 ModelTransformation。

            let deltaX = 1; // 默认：1 像素 = 1 物理单位
            let deltaY = 1;

            const fileDirectory = image.fileDirectory;
            const modelPixelScale = fileDirectory.ModelPixelScale;
            // ModelTransformation 比较复杂，这里优先处理常见的 Scale

            if (modelPixelScale && modelPixelScale.length >= 3) {
                deltaX = modelPixelScale[0];
                deltaY = modelPixelScale[1];
                console.log(`DemLoader: Detected Pixel Scale -> X: ${deltaX}, Y: ${deltaY}`);
            } else {
                console.warn("DemLoader: No ModelPixelScale found. Assuming 1:1 pixel mapping.");
                // 如果没有找到比例尺（比如普通图片转的 TIF），就只能维持 1 像素 = 1 单位
            }

            // 注意：如果单位是“度”（经纬度投影，如 WGS84），1 度 ≈ 111,000 米
            // 我们需要检查 GeoKeyDirectoryTag 来判断单位。
            // 简单的判断逻辑：如果比例尺非常小 (例如 0.00027)，很可能是度。
            // 而高程 Z 通常是米。这时需要把 X/Y 也换算成米。

            // 粗略启发式检查：
            // 如果 deltaX < 0.1，大概率是度 (Degrees)。
            // 经度长度随纬度变化，这里简化取赤道 1度 ≈ 111km，或平均 100km (100,000米) 做估算。
            // 更严谨的做法需要解析 GeoKey 2054 (GeogAngularUnitsGeoKey) 等，
            // 但 geotiff.js 的解析需要查表。这里用启发式能解决 90% 的问题。

            let scaleFactor = 1.0;
            if (deltaX < 0.1) {
                console.log("DemLoader: Units appear to be Degrees. Converting to Meters (approx 1deg = 111km).");
                scaleFactor = 111000.0;
            }

            // 最终的物理分辨率 (米/像素)
            const resX = deltaX * scaleFactor;
            const resY = deltaY * scaleFactor;

            // 读取栅格数据
            const rasters = await image.readRasters();
            const rawData = rasters[0]; // 假设波段0为高程数据

            if (!rawData || rawData.length === 0) {
                throw new Error("TIFF file contains no data in band 0");
            }

            const width = image.getWidth();
            const height = image.getHeight();
            const len = rawData.length;

            const data = new Float32Array(len);

            // 1. 第一遍扫描：仅计算有效数据的极值
            // 安全物理范围：-15000m 至 15000m
            const SAFE_MIN = -15000;
            const SAFE_MAX = 15000;

            let validMin = Infinity;
            let validMax = -Infinity;
            let hasValid = false;

            for (let i = 0; i < len; i++) {
                const val = rawData[i];
                // 严格检查：必须为有限数值且在安全范围内
                if (isFinite(val) && val >= SAFE_MIN && val <= SAFE_MAX) {
                    if (val < validMin) validMin = val;
                    if (val > validMax) validMax = val;
                    hasValid = true;
                }
            }

            if (!hasValid) {
                console.warn("DemLoader: No valid data found. Resetting [0, 100]");
                validMin = 0;
                validMax = 100;
            } else {
                if (validMax === validMin) validMax = validMin + 1;
            }

            console.log(`DemLoader: Safe Range [${validMin}, ${validMax}]`);

            // 2. 第二遍扫描：填充数据
            const range = validMax - validMin || 1;

            for (let i = 0; i < len; i++) {
                let val = rawData[i];
                if (!isFinite(val) || val < SAFE_MIN || val > SAFE_MAX) {
                    val = validMin;
                }
                data[i] = val;
            }

            return {
                width,
                height,
                data,
                min: validMin,
                max: validMax,
                // 将物理分辨率传出去，用于修正 Mesh 的比例
                physicalScaleX: resX,
                physicalScaleY: resY
            };
        } catch (error) {
            console.error("Error loading DEM:", error);
            throw error;
        }
    }
}
