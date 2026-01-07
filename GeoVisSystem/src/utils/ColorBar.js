import { ColorSchemes } from '../objects/TerrainMesh.js';

export class ColorBar {
    constructor(container) {
        this.el = document.createElement('div');
        this.el.id = 'colorbar';
        this.el.style.display = 'none';

        this.gradient = document.createElement('div');
        this.gradient.className = 'cb-gradient';

        this.labels = document.createElement('div');
        this.labels.className = 'cb-labels';

        this.labelEls = [];
        for (let i = 0; i < 5; i++) {
            const span = document.createElement('span');
            this.labels.appendChild(span);
            this.labelEls.push(span);
        }

        this.el.appendChild(this.gradient);
        this.el.appendChild(this.labels);
        container.appendChild(this.el);
    }

    update(min, max, schemeName = 'rainbow', visible = true) {
        if (!visible) {
            this.el.style.display = 'none';
            return;
        }
        this.el.style.display = 'flex';

        // 1. 更新标签
        const count = this.labelEls.length;
        for (let i = 0; i < count; i++) {
            const t = 1.0 - i / (count - 1);
            const val = min + (max - min) * t;
            this.labelEls[i].innerText = val.toFixed(1);
        }

        // 2. 更新渐变
        const scheme = ColorSchemes[schemeName] || ColorSchemes['rainbow'];

        let css = '';
        if (scheme.type === 'hsl_rainbow') {
            // ThreeJS HSL: 0.6 (蓝) -> 0.0 (红)
            // CSS 线性渐变: 顶部(红) -> 底部(蓝)
            css = `linear-gradient(to top, hsl(216, 100%, 50%), hsl(108, 100%, 50%), hsl(60, 100%, 50%), hsl(0, 100%, 50%))`;
        } else {
            // 自定义停靠点转换
            const stopsStr = scheme.stops.map(s => `${s[1]} ${s[0] * 100}%`).join(', ');
            css = `linear-gradient(to top, ${stopsStr})`;
        }

        this.gradient.style.background = css;
    }
}
