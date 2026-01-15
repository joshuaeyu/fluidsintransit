struct VertexOut {
    @location(0) uv : vec2f,
    @builtin(position) position : vec4f
}

@group(0) @binding(0) var tex_sampler: sampler;
@group(1) @binding(0) var src_tex: texture_2d<f32>;
@group(2) @binding(0) var add_tex: texture_2d<f32>;

override dt: f32;
override M: f32;
override N: f32;

// Add source to existing value field
@fragment
fn add_source(
    fragIn: VertexOut
) -> @location(0) f32 {
    let a = textureSample(src_tex, tex_sampler, fragIn.uv).r;
    let b = textureSample(add_tex, tex_sampler, fragIn.uv).r;
    return a + b * dt;
}
@fragment
fn add_source_vec2(
    fragIn: VertexOut
) -> @location(0) vec2f {
    let a = textureSample(src_tex, tex_sampler, fragIn.uv).rg;
    let b = textureSample(add_tex, tex_sampler, fragIn.uv).rg;
    return a + b * dt;
}