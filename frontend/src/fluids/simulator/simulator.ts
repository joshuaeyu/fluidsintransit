export abstract class Simulator {
    abstract reset(): void;

    abstract addDensitySource(sourceDataArray: Float32Array): Promise<void>;
    abstract addVelocitySource(sourceDataArray: Float32Array): Promise<void>;

    abstract densityStep(): Promise<void>;
    abstract velocityStep(): Promise<void>;

    abstract getDensityOutputTextureView(): GPUTextureView;
    abstract getVelocityOutputTextureView(): GPUTextureView;
}