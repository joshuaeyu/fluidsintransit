struct VertexOut {
    @location(0) uv : vec2f,
    @builtin(position) position : vec4f
}

@group(0) @binding(0) var tex_sampler: sampler;
@group(1) @binding(0) var x_tex: texture_2d<f32>;
@group(2) @binding(0) var velocity_tex: texture_2d<f32>;

override dt: f32;
override M: f32;
override N: f32;

// Semi-Lagrangian (backtrace) advection - out = f(x0, vel)
@fragment
fn advect(
    fragIn: VertexOut
) -> @location(0) f32 {
    let start_pos = fragIn.uv - dt * textureSample(velocity_tex, tex_sampler, fragIn.uv).rg;
    let start_val = textureSample(x_tex, tex_sampler, start_pos).r;
    return start_val;
}
@fragment
fn advect_vec2(
    fragIn: VertexOut
) -> @location(0) vec2f {
    let start_pos = fragIn.uv - dt * textureSample(velocity_tex, tex_sampler, fragIn.uv).rg;
    let start_val = textureSample(x_tex, tex_sampler, start_pos).rg;
    return start_val;
}