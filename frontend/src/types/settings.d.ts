export type Settings = {
    // Fixed
    M: number;
    N: number;
    hdr: boolean,
    dt: number;
    // Dynamic
    diffusivity: number;
    dissipation: number;
    viscosity: number;
    density: number;
    velocity: number;
};
