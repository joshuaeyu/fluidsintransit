struct VertexOut {
    @location(0) uv : vec2f,
    @builtin(position) position : vec4f
}

@group(0) @binding(0) var tex_sampler: sampler;
@group(1) @binding(0) var x_tex: texture_2d<f32>;

override dt: f32;
override M: f32;
override N: f32;

// Set boundary conditions
@fragment
fn set_bound(
    fragIn: VertexOut
) -> @location(0) f32 {
    var offset = vec2f(0, 0);
    if (fragIn.uv.x == 0) {
        offset.x = 1.0 / (M+2);
    } else if (fragIn.uv.x == 1) {
        offset.x = -1.0 / (M+2);
    } else if (fragIn.uv.y == 0) {
        offset.y = 1.0 / (N+2);
    } else {
        offset.y = -1.0 / (N+2);
    }
    return -textureSample(x_tex, tex_sampler, fragIn.uv + offset).r;
}
@fragment
fn set_bound_vec2(
    fragIn: VertexOut
) -> @location(0) vec2f {
    var offset = vec2f(0, 0);
    if (fragIn.uv.x == 0) {
        offset.x = 1.0 / (M+2);
    } else if (fragIn.uv.x == 1) {
        offset.x = -1.0 / (M+2);
    } else if (fragIn.uv.y == 0) {
        offset.y = 1.0 / (N+2);
    } else {
        offset.y = -1.0 / (N+2);
    }
    return -textureSample(x_tex, tex_sampler, fragIn.uv + offset).rg;
}