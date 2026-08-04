struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@group(0) @binding(0) var<uniform> mvp: mat4x4<f32>;

@vertex
fn vs_main(@location(0) position: vec3f, @location(1) color: vec4f) -> VSOut {
  var o: VSOut;
  o.pos = mvp * vec4f(position, 1.0);
  o.color = color;
  return o;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  return in.color;
}