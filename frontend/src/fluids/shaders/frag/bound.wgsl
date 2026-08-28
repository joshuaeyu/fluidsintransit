struct VertexOut {
    @location(0) uv : vec2f,
    @builtin(position) position : vec4f
}

@group(0) @binding(0) var tex_sampler: sampler;
@group(1) @binding(0) var x_tex: texture_2d<f32>;

struct BoundUniforms {
    scale: f32,
    offset: vec2f
};
@group(2) @binding(0) var<uniform> uniforms: BoundUniforms;

override dt: f32;
override M: f32;
override N: f32;

// Set no-slip boundary conditions
@fragment
fn set_bound(
    fragIn: VertexOut
) -> @location(0) f32 {
    let offset = uniforms.offset / vec2f(M+2, N+2);
    return uniforms.scale * textureSample(x_tex, tex_sampler, fragIn.uv + offset).r;
}
@fragment
fn set_bound_vec2(
    fragIn: VertexOut
) -> @location(0) vec2f {
    let offset = uniforms.offset / vec2f(M+2, N+2);
    return uniforms.scale * textureSample(x_tex, tex_sampler, fragIn.uv + offset).rg;
}