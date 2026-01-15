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
    let i = fragIn.position.x;
    let j = fragIn.position.y;
    let p_e = textureSample(grad_tex, tex_sampler, vec2(i,j+1)).x;
    let p_w = textureSample(grad_tex, tex_sampler, vec2(i,j-1)).x;
    let p_n = textureSample(grad_tex, tex_sampler, vec2(i+1,j)).y;
    let p_s = textureSample(grad_tex, tex_sampler, vec2(i-1,j)).y;
    var result = textureSample(w_tex, tex_sampler, vec2(i,j)).xy;
    result.x -= 0.5 * (p_e - p_w);
    result.y -= 0.5 * (p_n - p_s);
    return result;
}