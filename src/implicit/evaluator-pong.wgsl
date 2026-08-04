struct IntParams {
    resolution: u32,
    surfaceType: u32,
    current_w: u32, 
}

struct FloatParams {
    isolevel: f32,
    scale: f32,
    animateTime: f32,
    rot_xw: f32,
    rot_yw: f32,
    rot_zw: f32,
    pad1: f32,
    pad2: f32,
}

struct FloatArray {
    values: array<f32>,
}

// Functions 

fn hyperblobs(p: vec4f, t: f32) -> f32 {
    let p1 = vec4f(sin(t), cos(t), 0.0, 0.0);
    let p2 = vec4f(0.0, 0.0, sin(t*1.3), cos(t*1.3));
    let d1 = 1.0 / max(dot(p - p1, p - p1), 0.001);
    let d2 = 1.0 / max(dot(p - p2, p - p2), 0.001);
    return 2.5 - (d1 + d2);
}

fn complexUnitCircle(p: vec4f, t: f32) -> f32 {
    let r1 = 0.5;
    let r2 = 0.5;
    let re_x = length(pow(p.x, 2.0) - pow(p.y, 2.0) + pow(p.z, 2.0) - pow(p.w, 2.0) - pow(r1, 2.0) - pow(r2, 2.0));
    let re_i = length(-2.0 * p.x * p.y - 2.0 * p.z * p.w + 2.0 * r1 * r2);
    return (pow(re_i, 2.0) + pow(re_x, 2.0)) - 0.001;
}

fn duocylinder(p: vec4f, t: f32) -> f32 {
    let r1 = 0.8;
    let r2 = 0.4;
    let d1 = length(p.xy) - r1;
    let d2 = length(p.zw) - r2;
    
    let d = vec2f(max(d1, 0.0), max(d2, 0.0));
    return length(d) + min(max(d1, d2), 0.0);
}

// w² = z³ - z  (elliptic curve, genus 1)
fn ellipticCurve(p: vec4f, t: f32) -> f32 {
    let z = p.xy;
    let w = p.zw;
    
    
    let w_sq = c_mul(w, w);
    let z_sq = c_mul(z, z);
    let z_cu = c_mul(z_sq, z);
    let rhs = c_sub(z_cu, z);  // z³ - z
    let residual = c_sub(w_sq, rhs);
    
    return length(residual) - 0.01;
}

fn genus2Curve(p: vec4f, t: f32) -> f32 {
    let z = p.xy;
    let w = p.zw;
    
    let z2 = c_mul(z, z);
    let z3 = c_mul(z2, z);
    let z5 = c_mul(z3, z2);
    let rhs = c_sub(z5, z);
    let residual = c_sub(c_mul(w, w), rhs);
    
    let cell = 2.0 / f32(ips.resolution - 1u);
    return length(residual) - cell * 1.5;
}

// The branch surface of w = z^(1/2): w² - z = 0
fn sqrtSurface(p: vec4f, t: f32) -> f32 {
    let z = p.xy;
    let w = p.zw;
    let residual = c_sub(c_mul(w, w), z);
    return length(residual) - 0.005;
}

fn hypergyroid(p: vec4f, t: f32) -> f32 {
    let scale = 5.0;
    let q = p * scale;
    
    let val = sin(q.x)*cos(q.y) + sin(q.y)*cos(q.z) + sin(q.z)*cos(q.w) + sin(q.w)*cos(q.x);
    
    return val / scale;
}

fn logSurface(p: vec4f, t: f32) -> f32 {
    let z = p.xy;
    let w = p.zw;
    let residual = c_sub(c_exp(w), z);
    return length(residual) - 0.01;
}

fn roundedTesseract(p: vec4f, t: f32) -> f32 {
    let size = vec4f(0.8, 0.8, 0.8, 0.8); 
    let radius = 0.2; 
    let d = abs(p) - size;
    
    let outside_dist = length(max(d, vec4f(0.0)));
    let inside_dist = min(max(max(d.x, d.y), max(d.z, d.w)), 0.0);
    return (outside_dist + inside_dist) - radius;
}

fn fermatCurve(p: vec4f, t: f32) -> f32 {
    let z = p.xy;
    let w = p.zw;
    let n = 3.0 + floor(t) % 5.0;
    
    let zn = c_pow_f(z, n);
    let wn = c_pow_f(w, n);
    let residual = c_add(zn, wn) - vec2f(1.0, 0.0);

    let cell = 2.0 / f32(ips.resolution - 1u);
    
    return length(residual) - cell * 1.5;
}

fn get_idx(x: u32, y: u32, z: u32, res: u32) -> u32 {
    return x + (y * res) + (z * res * res);
}

fn implicitFunction(p: vec4f, t: f32, funcSelection: u32) -> f32 {
    var v = 0.0;
    
    if (funcSelection == 0u) { 
        v = ellipticCurve(p, t);
    } else if (funcSelection == 1u) { 
        v = genus2Curve(p, t);
    } else if (funcSelection == 2u) {
        v = complexUnitCircle(p, t);
    } else if (funcSelection == 3u) {
        v = hyperblobs(p, t);
    } else if (funcSelection == 4u) {
        v = sqrtSurface(p, t);
    } else if (funcSelection == 5u) {
        v = hypergyroid(p, t);
    } else if (funcSelection == 6u) {
        v = roundedTesseract(p, t);
    } else if (funcSelection == 7u) {
        v = fermatCurve(p, t);
    } else if (funcSelection == 8u) {
        v = logSurface(p, t);
    }
    
    return v;
}


// unit circle 205FPS 72
// Hypgyroid 79FPS 96
// Tesseract 80FPS 112

@group(0) @binding(0) var<uniform> ips: IntParams;
@group(0) @binding(1) var<uniform> fps: FloatParams;
@group(0) @binding(2) var<storage, read_write> sliceData: FloatArray;

@compute @workgroup_size(8, 8, 8)
fn cs_main(@builtin(global_invocation_id) global_id_3d : vec3u) {
    let res = ips.resolution;
    
    if (global_id_3d.x >= res || global_id_3d.y >= res || global_id_3d.z >= res) {
        return;
    }

    let vmin = vec4f(-1.0); 
    let vmax = vec4f( 1.0);
    let vstep = (vmax - vmin) / f32(res - 1u);
    
    let p_world = vmin + (vstep * vec4f(
        f32(global_id_3d.x), 
        f32(global_id_3d.y), 
        f32(global_id_3d.z), 
        f32(ips.current_w)
    ));
    
    let val = implicitFunction(p_world, fps.animateTime, ips.surfaceType);
    
    let flat_idx = get_idx(global_id_3d.x, global_id_3d.y, global_id_3d.z, res);
    sliceData.values[flat_idx] = val;
}