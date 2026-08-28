// Vertex shader
struct VertexOut {
    @location(0) uv : vec2f,
    @builtin(position) position : vec4f
}

@vertex
fn vertex_main(
    @location(0) position: vec4f,
    @location(1) uv: vec2f
) -> VertexOut {
    return VertexOut(vec2f(uv.x, 1.0-uv.y), position);
}

// Fragment shader
@group(0) @binding(0) var output_sampler: sampler;
@group(1) @binding(0) var output_map: texture_2d<f32>;

const max_val = 1.0;
const fracs = vec4f(0.1, 0.6, 0.3, 0);
const widths = max_val * fracs;

@fragment
fn fragment_main(
    fragIn: VertexOut
) -> @location(0) vec4f {
    let sample = textureSample(output_map, output_sampler, fragIn.uv);
    let value = min(sample.r, max_val);
    
    // Display color gradient with multiple stops
    var mix_value = value;
    var disp_value = vec4f(0,0,0,1);
    // interval0: black to cyan
    disp_value = mix(disp_value, vec4f(0,0.5,0.5,1), clamp(mix_value, 0, widths[0]) / widths[0]);
    mix_value -= widths[0];
    // interval1: cyan to magenta
    disp_value = mix(disp_value, vec4f(0.75,0,0.75,1), clamp(mix_value, 0, widths[1]) / widths[1]);
    mix_value -= widths[1];
    // interval2: magenta to white
    disp_value = mix(disp_value, vec4f(1,1,1,1), clamp(mix_value, 0, widths[2]) / widths[2]);
    mix_value -= widths[2];
    
    return disp_value;
}