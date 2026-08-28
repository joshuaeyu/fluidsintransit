import type { Settings } from "../../types/settings.js";
import * as webGpuContext from "../context.js";
import { Simulator } from "./simulator.js";

type Arrays = {
    density: [Float32Array, Float32Array];
    velocity: [Float32Array, Float32Array];
    scratch: [Float32Array, Float32Array];
};

type Textures = {
    density: GPUTexture;
    velocity: GPUTexture;
};

type TextureViews = {
    density: GPUTextureView;
    velocity: GPUTextureView;
};

export class SimulatorCpu extends Simulator {
    // Fluid sim settings
    settings: Settings;
    // Fluid sim
    private readonly arrays: Arrays;
    private readonly textures: Textures;
    private readonly textureViews: TextureViews;

    private constructor(
        settings: Settings,
        arrays: Arrays,
        textures: Textures,
        textureViews: TextureViews
    ) {
        super();
        this.settings = settings;
        this.arrays = arrays;
        this.textures = textures;
        this.textureViews = textureViews;
    }

    static async build(settings: Settings): Promise<SimulatorCpu> {
        const arrays = createArrays(settings);
        const textures = createTextures(settings);
        const textureViews = createTextureViews(settings, textures);
        
        return new SimulatorCpu(
            settings,
            arrays,
            textures,
            textureViews
        );
    }

    reset(): void {
        for (const arr of this.arrays.velocity) {
            arr.fill(0);
        }
        for (const arr of this.arrays.density) {
            arr.fill(0);
        }
        for (const arr of this.arrays.scratch) {
            arr.fill(0);
        }
    }

    async addVelocitySource(sourceDataArray: Float32Array): Promise<void> {
        for (let i = 0; i < this.arrays.velocity[0].length; i++) {
            this.arrays.velocity[0][i]! += sourceDataArray[i]! * this.settings.dt;
        }
    }
    
    async addDensitySource(sourceDataArray: Float32Array): Promise<void> {
        for (let i = 0; i < this.arrays.density[0].length; i++) {
            this.arrays.density[0][i]! += sourceDataArray[i]! * this.settings.dt;
        }
    }

    async velocityStep(): Promise<void> {
        this.advect(this.arrays.velocity[1], this.arrays.velocity[0], this.arrays.velocity[0], 0, 2);
        this.advect(this.arrays.velocity[1], this.arrays.velocity[0], this.arrays.velocity[0], 1, 2);

        const a = this.settings.dt * this.settings.viscosity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a;
        this.diffuse(this.arrays.velocity[0], this.arrays.velocity[1], a, c, 0, 2);
        this.diffuse(this.arrays.velocity[0], this.arrays.velocity[1], a, c, 1, 2);
        
        this.project(this.arrays.velocity[0], this.arrays.scratch[0], this.arrays.scratch[1]);

        webGpuContext.device.queue.writeTexture(
            {
                texture: this.textures.velocity,
            },
            this.arrays.velocity[0],
            {
                bytesPerRow: this.textures.velocity.width * 4 * 2,
            }, 
            {
                width: this.textures.velocity.width,
                height: this.textures.velocity.height,
        });
    }

    async densityStep(): Promise<void> {
        this.advect(this.arrays.density[1], this.arrays.density[0], this.arrays.velocity[0]);

        const a = this.settings.dt * this.settings.dissipation * this.settings.diffusivity * this.settings.M * this.settings.N;
        const c = 1 + 4 * a;
        this.diffuse(this.arrays.density[0], this.arrays.density[1], a, c);

        webGpuContext.device.queue.writeTexture(
            {
                texture: this.textures.density,
            },
            this.arrays.density[0],
            {
                bytesPerRow: this.textures.density.width * 4,
            }, 
            {
                width: this.textures.density.width,
                height: this.textures.density.height,
        });
    }

    getDensityOutputTextureView(): GPUTextureView {
        return this.textureViews.density;
    }

    getVelocityOutputTextureView(): GPUTextureView {
        return this.textureViews.velocity;
    }

    private idx(x: number, y: number): number {
        return x + ((this.settings.M+2) * y);
    }
    private idx2(x: number, y: number): number {
        return 2 * this.idx(x,y);
    }
    private clamp(x: number, low: number, high: number): number {
        return Math.min(high, Math.max(x, low));
    }

    private advect(w: Float32Array, w0: Float32Array, vel: Float32Array, offset: number = 0, stride: number = 1) {
        let idx;
        if (stride === 1) {
            idx = (i: number, j: number) => this.idx(i,j) + offset;
        } else if (stride === 2) {
            idx = (i: number, j: number) => this.idx2(i,j) + offset;
        }
        for (let i = 1; i <= this.settings.M; i++) {
            for (let j = 1; j <= this.settings.N; j++) {
                let x = i - this.settings.dt * this.settings.M * vel[this.idx2(i,j)]!;
                let y = j - this.settings.dt * this.settings.N * vel[this.idx2(i,j)+1]!;
                x = this.clamp(x, 0.5, this.settings.M+0.5);
                y = this.clamp(y, 0.5, this.settings.N+0.5);
                const i0 = Math.floor(x);
                const j0 = Math.floor(y);
                const s0 = 1 - (x - i0);
                const t0 = 1 - (y - j0);
                const result = t0 * (s0 * w0[this.idx(i0,j0)]! + (1-s0) * w0[this.idx(i0+1,j0)]!) +
                              (1-t0) * (s0 * w0[this.idx(i0,j0+1)]! + (1-s0) * w0[this.idx(i0+1,j0+1)]!);
                w[this.idx(i,j)] = result;
            }
        }
    }
    private diffuse(d: Float32Array, d0: Float32Array, a: number, c: number, offset: number = 0, stride: number = 1) {
        this.jacobi(d, d0, a, c, offset, stride);
    }
    private jacobi(w: Float32Array, w0: Float32Array, a: number, c: number, offset: number = 0, stride: number = 1) {
        let idx;
        if (stride === 1) {
            idx = (x: number, y: number) => this.idx(x,y) + offset;
        } else if (stride === 2) {
            idx = (x: number, y: number) => this.idx2(x,y) + offset;
        } else {
            throw new Error("stride must be 1 or 2.")
        }
        for (let k = 0; k < 20; k++) {
            for (let i = 1; i <= this.settings.M; i++) {
                for (let j = 1; j <= this.settings.N; j++) {
                    const w0Center = w0[idx(i,j)]!;
                    const wRight = w[idx(i+1,j)]!;
                    const wLeft = w[idx(i-1,j)]!;
                    const wDown = w[idx(i,j+1)]!;
                    const wUp = w[idx(i,j-1)]!;
                    w[idx(i,j)] = (w0Center + a * (wRight + wLeft + wDown + wUp)) / c;
                }
            }
        }
    }
    private project(vel: Float32Array, div: Float32Array, p: Float32Array) {
        // Divergence
        const sqrtMN = Math.sqrt(this.settings.M * this.settings.N);
        for (let i = 1; i <= this.settings.M; i++) {
            for (let j = 1; j <= this.settings.N; j++) {
                const uRight = vel[this.idx2(i+1,j)]!;
                const uLeft = vel[this.idx2(i-1,j)]!;
                const vUp = vel[this.idx2(i,j+1)+1]!;
                const vDown = vel[this.idx2(i,j-1)+1]!;
                div[this.idx(i,j)] = -0.5 * (uRight - uLeft + vUp - vDown) / sqrtMN;
            }
        }

        // Solve for p
        p.fill(0);
        this.jacobi(p, div, 1, 4);

        // Subtract ∇p to get divergence-free vel
        for (let i = 1; i <= this.settings.M; i++) {
            for (let j = 1; j <= this.settings.N; j++) {
                const pRight = p[this.idx(i+1,j)]!;
                const pLeft = p[this.idx(i-1,j)]!;
                const pUp = p[this.idx(i,j+1)]!;
                const pDown = p[this.idx(i,j-1)]!;
                const a = this.settings.M * (pRight - pLeft);
                vel[this.idx2(i,j)]! -= 0.5 * this.settings.M * (pRight - pLeft);
                vel[this.idx2(i,j)+1]! -= 0.5 * this.settings.N * (pUp - pDown);
            }
        }
    }
}


function createArrays(settings: Settings): Arrays {
    const velocity = [0,1].map(
        (i) => new Float32Array((settings.M+2) * (settings.N+2) * 2)
    ) as [Float32Array, Float32Array];
    const density = [0,1].map(
        (i) => new Float32Array((settings.M+2) * (settings.N+2))
    ) as [Float32Array, Float32Array];
    const scratch = [0,1].map(
        (i) => new Float32Array((settings.M+2) * (settings.N+2))
    ) as [Float32Array, Float32Array];

    return {
        density,
        velocity,
        scratch
    };
}

function createTextures(settings: Settings): Textures {
    const density = webGpuContext.device.createTexture({
        dimension: "2d",
        format: "r32float",
        size: [settings.M + 2, settings.N + 2],
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
        label: "density",
    });
    const velocity = webGpuContext.device.createTexture({
        dimension: "2d",
        format: "rg32float",
        size: [settings.M + 2, settings.N + 2],
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
        label: "velocity",
    });
    
    return {
        density,
        velocity
    };
}
    
function createTextureViews(settings: Settings, textures: Textures): TextureViews {
    const density = textures.density.createView();
    const velocity = textures.velocity.createView();

    return {
        density,
        velocity
    };
}