struct VertexOut {
    @location(0) uv : vec2f,
    @builtin(position) position : vec4f
}

@group(0) @binding(0) var tex_sampler: sampler;
@group(1) @binding(0) var w_tex: texture_2d<f32>;
@group(2) @binding(0) var p_tex: texture_2d<f32>;

override dt: f32;
override M: f32;
override N: f32;

// Divergence - out = f(x0)
@fragment
fn divergence(
    fragIn: VertexOut
) -> @location(0) f32 {
    let i = fragIn.uv.x;
    let j = fragIn.uv.y;
    let di = 1 / (M + 2);
    let dj = 1 / (N + 2);
    let u_e = textureSample(w_tex, tex_sampler, vec2(i+di,j)).x;
    let u_w = textureSample(w_tex, tex_sampler, vec2(i-di,j)).x;
    let v_n = textureSample(w_tex, tex_sampler, vec2(i,j+dj)).y;
    let v_s = textureSample(w_tex, tex_sampler, vec2(i,j-dj)).y;
    let result = -0.5 * (u_e - u_w + v_n - v_s) / sqrt(M*N);
    
    return result;
}