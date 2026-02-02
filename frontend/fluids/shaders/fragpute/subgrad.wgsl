struct VertexOut {
    @location(0) uv : vec2f,
    @builtin(position) position : vec4f
}

@group(0) @binding(0) var tex_sampler: sampler;
@group(1) @binding(0) var w_tex: texture_2d<f32>;
@group(2) @binding(0) var grad_tex: texture_2d<f32>;

override dt: f32;
override M: f32;
override N: f32;

// Subtract gradient from vector field - out = f(vel, grad)
@fragment
fn subtract_gradient(
    fragIn: VertexOut
) -> @location(0) vec2f {
    let i = fragIn.uv.x;
    let j = fragIn.uv.y;
    let di = 1 / (M + 2);
    let dj = 1 / (N + 2);
    let p_e = textureSample(grad_tex, tex_sampler, vec2(i+di,j)).x;
    let p_w = textureSample(grad_tex, tex_sampler, vec2(i-di,j)).x;
    let p_n = textureSample(grad_tex, tex_sampler, vec2(i,j+dj)).y;
    let p_s = textureSample(grad_tex, tex_sampler, vec2(i,j-dj)).y;
    var result = textureSample(w_tex, tex_sampler, vec2(i,j)).xy;
    result.x -= 0.5 * M * (p_e - p_w);
    result.y -= 0.5 * N * (p_n - p_s);
    return result;
}