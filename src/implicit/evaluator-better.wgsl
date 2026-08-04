override SURFACE: u32 = 1u;

struct IntParams {
    resolution: u32,
    surfaceType: u32,   // no longer used
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

@group(0) @binding(0) var<uniform> ips: IntParams;
@group(0) @binding(1) var<uniform> fps: FloatParams;
@group(0) @binding(2) var<storage, read_write> fieldData: FloatArray;


struct Slice {
    xy:      vec2f,   
    pz:      f32,     
    vstep:   f32,
    res:     u32,
    idx0:    u32,     
    strideW: u32,     
    t:       f32,
}

fn s_w(s: Slice, wi: u32) -> f32 { return -1.0 + s.vstep * f32(wi); }

fn s_store(s: Slice, wi: u32, v: f32) {
    fieldData.values[s.idx0 + wi * s.strideW] = v;
}

// --- w² = z³ - z ---
fn slice_elliptic(s: Slice) {
    let z   = s.xy;
    let z2  = c_mul(z, z);
    let rhs = c_sub(c_mul(z2, z), z);          // hoisted
    for (var wi = 0u; wi < s.res; wi++) {
        let w = vec2f(s.pz, s_w(s, wi));
        s_store(s, wi, length(c_sub(c_mul(w, w), rhs)) - 0.01);
    }
}

// --- w² = z⁵ - z ---
fn slice_genus2(s: Slice) {
    let z   = s.xy;
    let z2  = c_mul(z, z);
    let z3  = c_mul(z2, z);
    let z5  = c_mul(z3, z2);
    let rhs = c_sub(z5, z);                     // hoisted
    let thick = (2.0 / f32(s.res - 1u)) * 1.5;
    for (var wi = 0u; wi < s.res; wi++) {
        let w = vec2f(s.pz, s_w(s, wi));
        s_store(s, wi, length(c_sub(c_mul(w, w), rhs)) - thick);
    }
}

fn slice_unitcircle(s: Slice) {
    let r1 = 0.5;
    let r2 = 0.5;
    let px = s.xy.x;
    let py = s.xy.y;
    let reBase = px*px - py*py + s.pz*s.pz - r1*r1 - r2*r2;
    let imBase = -2.0 * px * py + 2.0 * r1 * r2;
    let imK    = -2.0 * s.pz;
    for (var wi = 0u; wi < s.res; wi++) {
        let pw = s_w(s, wi);
        let re = reBase - pw * pw;
        let im = imBase + imK * pw;
        s_store(s, wi, re*re + im*im - 0.001);
    }
}

fn slice_hyperblobs(s: Slice) {
    let t  = s.t;
    let c1 = vec2f(sin(t), cos(t));                 // p1.xy
    let c2 = vec2f(sin(t * 1.3), cos(t * 1.3));     // p2.zw
    let dx1 = s.xy.x - c1.x;
    let dy1 = s.xy.y - c1.y;
    let base1 = dx1*dx1 + dy1*dy1 + s.pz*s.pz;      // + pw²
    let dz2 = s.pz - c2.x;
    let base2 = s.xy.x*s.xy.x + s.xy.y*s.xy.y + dz2*dz2;  // + (pw - c2.y)²
    for (var wi = 0u; wi < s.res; wi++) {
        let pw = s_w(s, wi);
        let q2 = pw - c2.y;
        let d1 = 1.0 / max(base1 + pw*pw, 0.001);
        let d2 = 1.0 / max(base2 + q2*q2, 0.001);
        s_store(s, wi, 2.5 - (d1 + d2));
    }
}

// --- w² = z ---
fn slice_sqrt(s: Slice) {
    let z = s.xy;
    for (var wi = 0u; wi < s.res; wi++) {
        let w = vec2f(s.pz, s_w(s, wi));
        s_store(s, wi, length(c_sub(c_mul(w, w), z)) - 0.005);
    }
}

fn slice_gyroid(s: Slice) {
    let k  = 5.0;
    let qx = s.xy.x * k;
    let qy = s.xy.y * k;
    let qz = s.pz   * k;
    let sx = sin(qx); let cx = cos(qx);
    let sy = sin(qy); let cz = cos(qz);
    let sz = sin(qz); let cy = cos(qy);
    let head = sx * cy + sy * cz;               // two full terms, hoisted
    for (var wi = 0u; wi < s.res; wi++) {
        let qw = s_w(s, wi) * k;
        let sw = sin(qw);
        let cw = cos(qw);
        s_store(s, wi, (head + sz * cw + sw * cx) / k);
    }
}

fn slice_tesseract(s: Slice) {
    let size   = 0.8;
    let radius = 0.2;
    let dx = abs(s.xy.x) - size;
    let dy = abs(s.xy.y) - size;
    let dz = abs(s.pz)   - size;
    let mxyz = max(max(dx, dy), dz);
    let ox = max(dx, 0.0);
    let oy = max(dy, 0.0);
    let oz = max(dz, 0.0);
    let sumsq = ox*ox + oy*oy + oz*oz;
    for (var wi = 0u; wi < s.res; wi++) {
        let dw = abs(s_w(s, wi)) - size;
        let ow = max(dw, 0.0);
        let outside = sqrt(sumsq + ow * ow);
        let inside  = min(max(mxyz, dw), 0.0);
        s_store(s, wi, outside + inside - radius);
    }
}


fn slice_fermat(s: Slice) {
    let n  = 3.0 + floor(s.t) % 5.0;
    let zn = c_pow_f(s.xy, n);                  
    let thick = (2.0 / f32(s.res - 1u)) * 1.5;
    for (var wi = 0u; wi < s.res; wi++) {
        let w = vec2f(s.pz, s_w(s, wi));
        let residual = c_add(zn, c_pow_f(w, n)) - vec2f(1.0, 0.0);
        s_store(s, wi, length(residual) - thick);
    }
}


fn slice_log(s: Slice) {
    let z = s.xy;
    let e = exp(s.pz);                          
    for (var wi = 0u; wi < s.res; wi++) {
        let pw = s_w(s, wi);
        let ew = e * vec2f(cos(pw), sin(pw));
        s_store(s, wi, length(ew - z) - 0.01);
    }
}

@compute @workgroup_size(4, 4, 4)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
    let res = ips.resolution;
    if (gid.x >= res || gid.y >= res || gid.z >= res) { return; }

    let vstep = 2.0 / f32(res - 1u);

    var s: Slice;
    s.xy      = vec2f(-1.0 + vstep * f32(gid.x), -1.0 + vstep * f32(gid.y));
    s.pz      = -1.0 + vstep * f32(gid.z);
    s.vstep   = vstep;
    s.res     = res;
    s.idx0    = gid.x + gid.y * res + gid.z * res * res;
    s.strideW = res * res * res;
    s.t       = fps.animateTime;

    if      (SURFACE == 0u) { slice_elliptic(s); }
    else if (SURFACE == 1u) { slice_genus2(s); }
    else if (SURFACE == 2u) { slice_unitcircle(s); }
    else if (SURFACE == 3u) { slice_hyperblobs(s); }
    else if (SURFACE == 4u) { slice_sqrt(s); }
    else if (SURFACE == 5u) { slice_gyroid(s); }
    else if (SURFACE == 6u) { slice_tesseract(s); }
    else if (SURFACE == 7u) { slice_fermat(s); }
    else if (SURFACE == 8u) { slice_log(s); }
}