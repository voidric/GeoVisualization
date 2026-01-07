export class Histogram {
    constructor(container) {
        this.container = container;
        this.enabled = false;

        // 创建容器
        this.domElement = document.createElement('div');
        this.domElement.id = 'histogram-panel';
        Object.assign(this.domElement.style, {
            position: 'absolute',
            top: '20px',
            left: '20px',
            right: 'auto', // 清除右侧
            width: '240px', // 更宽的文本
            height: '140px', // 调整为无标题
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: '10px',
            borderRadius: '6px',
            display: 'none',
            zIndex: '99999',
            fontFamily: 'sans-serif',
            pointerEvents: 'none',
            border: '1px solid rgba(255,255,255,0.2)'
        });



        // 创建画布
        this.canvas = document.createElement('canvas');
        this.canvas.width = 240;
        this.canvas.height = 120;
        // ... 画布设置的其余部分（需要检查尺寸）
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.domElement.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        document.body.appendChild(this.domElement);
    }

    setEnabled(bool) {
        this.enabled = bool;
        this.domElement.style.display = bool ? 'block' : 'none';
    }

    update(dataArray, min, max, bins = 50) {
        if (!this.enabled || !dataArray) return;

        // 1. Calculate Bins
        const histogram = new Array(bins).fill(0);
        const range = max - min;
        if (range === 0) return;

        // Sample data for performance if too large (>1M points)
        const step = Math.ceil(dataArray.length / 100000);

        for (let i = 0; i < dataArray.length; i += step) {
            const val = dataArray[i];
            if (val >= min && val <= max) {
                let bin = Math.floor(((val - min) / range) * bins);
                if (bin >= bins) bin = bins - 1;
                histogram[bin]++;
            }
        }

        // 2. Normalize
        let maxCount = 0;
        for (let i = 0; i < bins; i++) {
            if (histogram[i] > maxCount) maxCount = histogram[i];
        }

        // 3. Draw
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0, 0, w, h);

        // Bars
        const barW = w / bins;
        ctx.fillStyle = '#4facfe'; // Cyan-ish

        for (let i = 0; i < bins; i++) {
            const barH = (histogram[i] / maxCount) * h;
            ctx.fillRect(i * barW, h - barH, barW - 1, barH);
        }

        // Labels (Min/Max)
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.fillText(min.toFixed(1), 2, h - 2);
        const maxStr = max.toFixed(1);
        ctx.fillText(maxStr, w - ctx.measureText(maxStr).width - 2, h - 2);
    }

    dispose() {
        if (this.domElement && this.domElement.parentElement) {
            this.domElement.parentElement.removeChild(this.domElement);
        }
    }
}
