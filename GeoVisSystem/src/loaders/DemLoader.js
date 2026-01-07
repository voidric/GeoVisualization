import { fromUrl } from 'geotiff';

export class DemLoader {
    constructor() { }

    async load(url) {
        try {
            console.log("DemLoader: loading", url);
            const tiff = await fromUrl(url);
            const image = await tiff.getImage();

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
            // 将无效值替换为最小值，使其平铺到底部
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
                max: validMax
            };
        } catch (error) {
            console.error("Error loading DEM:", error);
            throw error;
        }
    }
}
