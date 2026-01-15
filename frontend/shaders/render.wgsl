// Vertex shader
struct VertexOut {
    @location(0) uv : vec2f,
    @builtin(position) position : vec4f
}

@vertex
fn vertex_main (
    @location(0) position: vec4f,
    @location(1) uv: vec2f
) -> VertexOut {
    return VertexOut(vec2f(uv.x, 1.0-uv.y), position);
}

// Fragment shader
@group(0) @binding(0) var output_sampler: sampler;
@group(0) @binding(1) var output_map: texture_2d<f32>;

@fragment
fn fragment_main(
    fragIn: VertexOut
) -> @location(0) vec4f {
    let value = textureSample(output_map, output_sampler, fragIn.uv);
    return value;
}