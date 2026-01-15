struct VertexOut {
    @location(0) uv : vec2f,
    @builtin(position) position : vec4f
}

@group(0) @binding(0) var tex_sampler: sampler;
@group(1) @binding(0) var x0_tex: texture_2d<f32>;
@group(2) @binding(0) var x_tex: texture_2d<f32>;

struct UniformStruct {
    a: f32,
    c: f32
};
@group(3) @binding(0) var<uniform> uniforms: UniformStruct;

override dt: f32;
override M: f32;
override N: f32;

// Jacobi linear solver - out = f(x0, x)
@fragment
fn jacobi(
    fragIn: VertexOut
) -> @location(0) f32 {
    let i = fragIn.position.x;
    let j = fragIn.position.y;
    let x0 = textureSample(x0_tex, tex_sampler, vec2(i,j)).r;
    let x_e = textureSample(x_tex, tex_sampler, vec2(i,j+1)).r;
    let x_w = textureSample(x_tex, tex_sampler, vec2(i,j-1)).r;
    let x_n = textureSample(x_tex, tex_sampler, vec2(i+1,j)).r;
    let x_s = textureSample(x_tex, tex_sampler, vec2(i-1,j)).r;
    let result = (x0 + uniforms.a * (x_n + x_s + x_e + x_w)) / uniforms.c;
    return result;
}
@fragment
fn jacobi_vec2(
    fragIn: VertexOut
) -> @location(0) vec2f {
    let i = fragIn.position.x;
    let j = fragIn.position.y;
    let x0 = textureSample(x0_tex, tex_sampler, vec2(i,j)).rg;
    let x_e = textureSample(x_tex, tex_sampler, vec2(i,j+1)).rg;
    let x_w = textureSample(x_tex, tex_sampler, vec2(i,j-1)).rg;
    let x_n = textureSample(x_tex, tex_sampler, vec2(i+1,j)).rg;
    let x_s = textureSample(x_tex, tex_sampler, vec2(i-1,j)).rg;
    let result = (x0 + uniforms.a * (x_n + x_s + x_e + x_w)) / uniforms.c;
    return result;
}