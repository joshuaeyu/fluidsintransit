"use strict";

import { webGpuContext } from "./context.js";

export class SimulationCpu {
    settings;
    resources = {};

    constructor(settings) {
        this.settings = settings;
    }

    static async build(settings) {
        const app = new SimulationCpu(settings);
        app.#initSimulation();
        return app;
    }

    reset() {
        for (const arr of this.resources.velocityArrays) {
            arr.fill(0);
        }
        for (const arr of this.resources.densityArrays) {
            arr.fill(0);
        }
        for (const arr of this.resources.scratchArrays) {
            arr.fill(0);
        }
    }

    async addVelocitySource(sourceDataArray) {
        for (let i = 0; i < this.resources.velocityArrays[0].length; i++) {
            this.resources.velocityArrays[0][i] += sourceDataArray[i] * this.settings.dt;
        }
    }
    
    async addDensitySource(sourceDataArray) {
        for (let i = 0; i < this.resources.densityArrays[0].length; i++) {
            this.resources.densityArrays[0][i] += sourceDataArray[i] * this.settings.dt;
        }
    }

    async velocityStep() {
        this.#advect(this.resources.velocityArrays[1], this.resources.velocityArrays[0], this.resources.velocityArrays[0], 0, 2);
        this.#advect(this.resources.velocityArrays[1], this.resources.velocityArrays[0], this.resources.velocityArrays[0], 1, 2);

        const a = this.settings.dt * this.settings.viscosity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a;
        this.#diffuse(this.resources.velocityArrays[0], this.resources.velocityArrays[1], a, c, 0, 2);
        this.#diffuse(this.resources.velocityArrays[0], this.resources.velocityArrays[1], a, c, 1, 2);
        
        this.#project(this.resources.velocityArrays[0], this.resources.scratchArrays[0], this.resources.scratchArrays[1]);

        webGpuContext.device.queue.writeTexture(
            {
                texture: this.resources.velocityTexture,
            },
            this.resources.velocityArrays[0],
            {
                bytesPerRow: this.resources.velocityTexture.width * 4 * 2,
            }, 
            {
                width: this.resources.velocityTexture.width,
                height: this.resources.velocityTexture.height,
        });
    }

    async densityStep() {
        this.#advect(this.resources.densityArrays[1], this.resources.densityArrays[0], this.resources.velocityArrays[0]);

        const a = this.settings.dt * this.settings.dissipation * this.settings.diffusivity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a;
        this.#diffuse(this.resources.densityArrays[0], this.resources.densityArrays[1], a, c);

        webGpuContext.device.queue.writeTexture(
            {
                texture: this.resources.densityTexture,
            },
            this.resources.densityArrays[0],
            {
                bytesPerRow: this.resources.densityTexture.width * 4,
            }, 
            {
                width: this.resources.densityTexture.width,
                height: this.resources.densityTexture.height,
        });
    }

    getDensityOutputTextureView() {
        return this.resources.densityTextureView;
    }

    getVelocityOutputTextureView() {
        return this.resources.velocityTextureView;
    }

    #idx(x, y) {
        return x + ((this.settings.M+2) * y);
    }
    #idx2(x, y) {
        return 2 * this.#idx(x,y);
    }
    #clamp(x, low, high) {
        return Math.min(high, Math.max(x, low));
    }

    #advect(w, w0, vel, offset = 0, stride = 1) {
        let idx;
        if (stride === 1) {
            idx = (i,j) => this.#idx(i,j) + offset;
        } else if (stride === 2) {
            idx = (i,j) => this.#idx2(i,j) + offset;
        }
        for (let i = 1; i <= this.settings.M; i++) {
            for (let j = 1; j <= this.settings.N; j++) {
                let x = i - this.settings.dt * this.settings.M * vel[this.#idx2(i,j)];
                let y = j - this.settings.dt * this.settings.N * vel[this.#idx2(i,j)+1];
                x = this.#clamp(x, 0.5, this.settings.M+0.5);
                y = this.#clamp(y, 0.5, this.settings.N+0.5);
                const i0 = Math.floor(x);
                const j0 = Math.floor(y);
                const s0 = 1 - (x - i0);
                const t0 = 1 - (y - j0);
                const result = t0 * (s0 * w0[idx(i0,j0)] + (1-s0) * w0[idx(i0+1,j0)]) +
                              (1-t0) * (s0 * w0[idx(i0,j0+1)] + (1-s0) * w0[idx(i0+1,j0+1)]);
                w[idx(i,j)] = result;
            }
        }
    }
    #diffuse(d, d0, a, c, offset = 0, stride = 1) {
        this.#jacobi(d, d0, a, c, offset, stride);
    }
    #jacobi(w, w0, a, c, offset = 0, stride = 1) {
        let idx;
        if (stride === 1) {
            idx = (x,y) => this.#idx(x,y) + offset;
        } else if (stride === 2) {
            idx = (x,y) => this.#idx2(x,y) + offset;
        }
        for (let k = 0; k < 20; k++) {
            for (let i = 1; i <= this.settings.M; i++) {
                for (let j = 1; j <= this.settings.N; j++) {
                    const w0Center = w0[idx(i,j)];
                    const wRight = w[idx(i+1,j)];
                    const wLeft = w[idx(i-1,j)];
                    const wDown = w[idx(i,j+1)];
                    const wUp = w[idx(i,j-1)];
                    w[idx(i,j)] = (w0Center + a * (wRight + wLeft + wDown + wUp)) / c;
                }
            }
        }
    }
    #project(vel, div, p) {
        // Divergence
        const sqrtMN = Math.sqrt(this.settings.M * this.settings.N);
        for (let i = 1; i <= this.settings.M; i++) {
            for (let j = 1; j <= this.settings.N; j++) {
                const uRight = vel[this.#idx2(i+1,j)];
                const uLeft = vel[this.#idx2(i-1,j)];
                const vUp = vel[this.#idx2(i,j+1)+1];
                const vDown = vel[this.#idx2(i,j-1)+1];
                div[this.#idx(i,j)] = -0.5 * (uRight - uLeft + vUp - vDown) / sqrtMN;
            }
        }

        // Solve for p
        p.fill(0);
        this.#jacobi(p, div, 1, 4);

        // Subtract ∇p to get divergence-free vel
        for (let i = 1; i <= this.settings.M; i++) {
            for (let j = 1; j <= this.settings.N; j++) {
                const pRight = p[this.#idx(i+1,j)];
                const pLeft = p[this.#idx(i-1,j)];
                const pUp = p[this.#idx(i,j+1)];
                const pDown = p[this.#idx(i,j-1)];
                const a = this.settings.M * (pRight - pLeft);
                vel[this.#idx2(i,j)] -= 0.5 * this.settings.M * (pRight - pLeft);
                vel[this.#idx2(i,j)+1] -= 0.5 * this.settings.N * (pUp - pDown);
            }
        }
    }

    #initSimulation() {
        // Data arrays
        this.resources.velocityArrays = [0,1].map((i) => new Float32Array((this.settings.M+2) * (this.settings.N+2) * 2));
        this.resources.densityArrays = [0,1].map((i) => new Float32Array((this.settings.M+2) * (this.settings.N+2)));
        this.resources.scratchArrays = [0,1].map((i) => new Float32Array((this.settings.M+2) * (this.settings.N+2)));

        // Textures
        this.resources.velocityTexture = webGpuContext.device.createTexture({
            dimension: "2d",
            format: "rg32float",
            size: [this.settings.M + 2, this.settings.N + 2],
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
            label: "velocity",
        });
        this.resources.densityTexture = webGpuContext.device.createTexture({
            dimension: "2d",
            format: "r32float",
            size: [this.settings.M + 2, this.settings.N + 2],
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
            label: "density",
        });

        // Texture views
        this.resources.velocityTextureView = this.resources.velocityTexture.createView();
        this.resources.densityTextureView = this.resources.densityTexture.createView();
    }
}