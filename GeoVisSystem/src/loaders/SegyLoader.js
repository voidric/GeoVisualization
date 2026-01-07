// 辅助函数：将 IBM 浮点数转换为 IEEE 754
function ibm2ieee(data) {
    // data 是一个 DataView 或 Uint8Array
    // 此函数假定每次处理 4 字节
    const len = data.length / 4;
    const result = new Float32Array(len);

    // 位操作对于 V8 引擎已足够高效

    for (let i = 0; i < len; i++) {
        const offset = i * 4;

        let b0 = data[offset];
        let b1 = data[offset + 1];
        let b2 = data[offset + 2];
        let b3 = data[offset + 3];

        if (b0 === 0 && b1 === 0 && b2 === 0 && b3 === 0) {
            result[i] = 0;
            continue;
        }

        // IBM Float 格式: 符号位(1) 指数(7) 尾数(24)
        // 符号位
        const sign = (b0 & 0x80) ? -1 : 1;

        // 指数 (16进制基数, 偏移量 64)
        const exponent = (b0 & 0x7f) - 64;

        // 尾数 (分数部分)
        // b1, b2, b3 合并
        let mantissa = ((b1 << 16) | (b2 << 8) | b3) / 16777216.0; // 除以 2^24

        result[i] = sign * mantissa * Math.pow(16.0, exponent);
    }
    return result;
}

export class SegyLoader {
    constructor() { }

    async load(url) {
        console.log("Loading SEGY:", url);
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const dataView = new DataView(buffer);

        // 1. 解析二进制卷头 (字节位置 3200 - 3600)
        // 采样间隔位置 (卷头字节 17-18 -> 文件偏移 3216)
        // 每道采样点数位置 (卷头字节 21-22 -> 文件偏移 3220)
        // 数据格式代码位置 (卷头字节 25-26 -> 文件偏移 3224)

        const sampleInterval = dataView.getInt16(3216, false); // 通常为大端序 (Big Endian)
        const ns = dataView.getUint16(3220, false); // 每道采样数
        const formatCode = dataView.getInt16(3224, false); // 1=IBM浮点, 5=IEEE浮点

        console.log(`SEGY 头信息: 采样间隔=${sampleInterval}us, 采样数=${ns}, 格式代码=${formatCode}`);

        // 2. 解析地震道 (Trace) 
        // 自动探测 Inline/Crossline 字节位置
        // 策略: 读取前 1000 道，寻找变化的 Int32 字段

        let headerCandidates = [188, 192, 8, 20, 16, 12, 4];
        let chosenInlineOff = 188;
        let chosenCrosslineOff = 192;

        const scanCount = Math.min(1000, 196608); // Scan first 1000 traces
        const offsetStart = 3600;
        const traceSize = 240 + ns * 4;
        const totalTraces = Math.floor((buffer.byteLength - 3600) / traceSize);
        console.log(`检测到总道数: ${totalTraces}，正在自动探测头字位置...`);

        // 检查候选位置的数值变化
        let candidateStats = {};
        headerCandidates.forEach(off => candidateStats[off] = new Set());

        const checkLimit = Math.min(2000, totalTraces);
        for (let i = 0; i < checkLimit; i++) {
            const tOff = offsetStart + i * traceSize;
            headerCandidates.forEach(off => {
                const val = dataView.getInt32(tOff + off, false);
                candidateStats[off].add(val);
            });
        }

        // 筛选具有合理变化率的字段（排除唯一ID或常数）
        const candidatesWithVar = headerCandidates.filter(off => {
            const count = candidateStats[off].size;
            return count > 1 && count < (checkLimit * 0.9);
        });

        console.log("有效的头字候选:", candidatesWithVar.map(c => `${c + 1}(Cnt:${candidateStats[c].size})`));

        if (candidateStats[188].size > 1 && candidateStats[188].size < checkLimit * 0.9 &&
            candidateStats[192].size > 1 && candidateStats[192].size < checkLimit * 0.9) {
            chosenInlineOff = 188; chosenCrosslineOff = 192;
            console.log("使用标准位置: 189/193 (符合几何特征)");
        } else if (candidatesWithVar.length >= 2) {
            // 选取前两个候选作为 INLINE/CROSSLINE
            chosenInlineOff = candidatesWithVar[0];
            chosenCrosslineOff = candidatesWithVar[1];
            console.log(`使用探测位置: ${chosenInlineOff + 1} / ${chosenCrosslineOff + 1}`);
        } else if (candidatesWithVar.length === 1) {
            // 2D Line
            chosenInlineOff = candidatesWithVar[0];
            chosenCrosslineOff = -1; // Disabled
            console.log(`检测为 2D 测线，主键位置: ${chosenInlineOff + 1}`);
        } else {
            console.warn("未检测到有效几何，尝试强制使用 ShotID/TraceID");
            // Fallback
            chosenInlineOff = 8; chosenCrosslineOff = -1;
        }

        let offset = 3600;
        const traces = [];
        const headers = [];

        let minVal = Infinity;
        let maxVal = -Infinity;

        for (let i = 0; i < totalTraces; i++) {
            const inline = dataView.getInt32(offset + chosenInlineOff, false);
            // 如果只有一条测线，使用默认值 0
            const crossline = (chosenCrosslineOff >= 0) ? dataView.getInt32(offset + chosenCrosslineOff, false) : 0;

            headers.push({ inline, crossline });

            const traceDataStart = offset + 240;
            const traceBytes = new Uint8Array(buffer, traceDataStart, ns * 4);

            let floatData;
            if (formatCode === 1) { // IBM
                floatData = ibm2ieee(traceBytes);
            } else { // IEEE
                floatData = new Float32Array(ns);
                for (let s = 0; s < ns; s++) {
                    floatData[s] = dataView.getFloat32(traceDataStart + s * 4, false);
                }
            }

            for (let v of floatData) {
                if (v < minVal) minVal = v;
                if (v > maxVal) maxVal = v;
            }

            traces.push(floatData);
            offset += traceSize;
        }

        // 组织成体数据 (Volume)
        const inlines = [...new Set(headers.map(h => h.inline))].sort((a, b) => a - b);
        const crosslines = [...new Set(headers.map(h => h.crossline))].sort((a, b) => a - b);

        const nInlines = inlines.length;
        const nCrosslines = crosslines.length;

        console.log(`修正后解析: Inlines=${nInlines}, Crosslines=${nCrosslines}, Min=${minVal}, Max=${maxVal} (使用头字: ${chosenInlineOff + 1}/${chosenCrosslineOff + 1})`);

        let volume;
        if (nInlines * nCrosslines !== totalTraces && nCrosslines === 1) {
            // 2D 测线模式：内联方向作为 X 轴
            volume = new Float32Array(totalTraces * ns);
            // 顺序拷贝
            for (let i = 0; i < totalTraces; i++) {
                volume.set(traces[i], i * ns);
            }
        } else {
            // 标准 3D 映射
            volume = new Float32Array(nInlines * nCrosslines * ns);
            headers.forEach((h, idx) => {
                const ilIdx = inlines.indexOf(h.inline);
                const xlIdx = crosslines.indexOf(h.crossline);
                if (ilIdx !== -1 && xlIdx !== -1) {
                    const destStart = (ilIdx * nCrosslines + xlIdx) * ns;
                    volume.set(traces[idx], destStart);
                }
            });
        }

        return {
            volume,
            min: minVal,
            max: maxVal,
            nInlines,
            nCrosslines,
            nSamples: ns,
            inlines,
            crosslines
        };
    }
}
