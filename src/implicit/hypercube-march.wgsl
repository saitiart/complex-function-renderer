struct IntParams {
    resolution: u32,
    surfaceType: u32,
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

struct FloatArray { values: array<f32>, }
struct U32Array   { values: array<u32>, }
struct AtomicCount { count: atomic<u32>, }

struct DispatchArgs {
    x: u32,
    y: u32,
    z: u32,
    activeCount: u32,
}

override BLOCK: u32 = 4u;
const DISPATCH_STRIDE: u32 = 65535u;

@group(0) @binding(0) var<storage, read>       fieldData: array<f32>;
@group(0) @binding(1) var<storage, read_write> positionsOut: FloatArray;
@group(0) @binding(2) var<storage, read_write> colorBuffer: FloatArray;
@group(0) @binding(4) var<storage, read_write> counter: AtomicCount;
@group(0) @binding(5) var<uniform>             ips: IntParams;
@group(0) @binding(6) var<uniform>             fps: FloatParams;
@group(0) @binding(7) var<storage, read>       blockList: U32Array;
@group(0) @binding(8) var<storage, read>       args: DispatchArgs;

// 24 Freudenthal simplices, monotone paths 0000 -> ... -> 1111.
const simplexCorners = array<array<vec4u, 5>, 24>(
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(1u,0u,0u,0u),vec4(1u,1u,0u,0u),vec4(1u,1u,1u,0u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(1u,0u,0u,0u),vec4(1u,1u,0u,0u),vec4(1u,1u,0u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(1u,0u,0u,0u),vec4(1u,0u,1u,0u),vec4(1u,1u,1u,0u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(1u,0u,0u,0u),vec4(1u,0u,1u,0u),vec4(1u,0u,1u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(1u,0u,0u,0u),vec4(1u,0u,0u,1u),vec4(1u,1u,0u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(1u,0u,0u,0u),vec4(1u,0u,0u,1u),vec4(1u,0u,1u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,1u,0u,0u),vec4(1u,1u,0u,0u),vec4(1u,1u,1u,0u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,1u,0u,0u),vec4(1u,1u,0u,0u),vec4(1u,1u,0u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,1u,0u,0u),vec4(0u,1u,1u,0u),vec4(1u,1u,1u,0u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,1u,0u,0u),vec4(0u,1u,1u,0u),vec4(0u,1u,1u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,1u,0u,0u),vec4(0u,1u,0u,1u),vec4(1u,1u,0u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,1u,0u,0u),vec4(0u,1u,0u,1u),vec4(0u,1u,1u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,1u,0u),vec4(1u,0u,1u,0u),vec4(1u,1u,1u,0u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,1u,0u),vec4(1u,0u,1u,0u),vec4(1u,0u,1u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,1u,0u),vec4(0u,1u,1u,0u),vec4(1u,1u,1u,0u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,1u,0u),vec4(0u,1u,1u,0u),vec4(0u,1u,1u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,1u,0u),vec4(0u,0u,1u,1u),vec4(1u,0u,1u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,1u,0u),vec4(0u,0u,1u,1u),vec4(0u,1u,1u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,0u,1u),vec4(1u,0u,0u,1u),vec4(1u,1u,0u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,0u,1u),vec4(1u,0u,0u,1u),vec4(1u,0u,1u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,0u,1u),vec4(0u,1u,0u,1u),vec4(1u,1u,0u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,0u,1u),vec4(0u,1u,0u,1u),vec4(0u,1u,1u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,0u,1u),vec4(0u,0u,1u,1u),vec4(1u,0u,1u,1u),vec4(1u,1u,1u,1u)),
    array<vec4u,5>(vec4(0u,0u,0u,0u),vec4(0u,0u,0u,1u),vec4(0u,0u,1u,1u),vec4(0u,1u,1u,1u),vec4(1u,1u,1u,1u))
);

fn rotate4D(p: vec4f, rxw: f32, ryw: f32, rzw: f32) -> vec4f {
    var v = p;
    let cxw = cos(rxw); let sxw = sin(rxw);
    let x1 = v.x * cxw - v.w * sxw; v.w = v.x * sxw + v.w * cxw; v.x = x1;
    let cyw = cos(ryw); let syw = sin(ryw);
    let y1 = v.y * cyw - v.w * syw; v.w = v.y * syw + v.w * cyw; v.y = y1;
    let czw = cos(rzw); let szw = sin(rzw);
    let z1 = v.z * czw - v.w * szw; v.w = v.z * szw + v.w * czw; v.z = z1;
    return v;
}

fn get_idx4(x: u32, y: u32, z: u32, w: u32, res: u32) -> u32 {
    return x + y * res + z * res * res + w * res * res * res;
}

fn interp(vA: f32, vB: f32, pA: vec4f, pB: vec4f, iso: f32) -> vec4f {
    let d = vB - vA;
    if (abs(d) < 0.00001) { return pA; }
    return mix(pA, pB, (iso - vA) / d);
}

fn write_vert(slot: u32, p4: vec4f) {
    let r = rotate4D(p4, fps.rot_xw, fps.rot_yw, fps.rot_zw);
    let vi = slot * 3u;
    positionsOut.values[vi]      = r.x;
    positionsOut.values[vi + 1u] = r.y;
    positionsOut.values[vi + 2u] = r.z;

    let ci = slot * 4u;
    colorBuffer.values[ci]      = 0.5 + 0.5 * r.x;
    colorBuffer.values[ci + 1u] = 0.5 + 0.5 * r.y;
    colorBuffer.values[ci + 2u] = 0.5 + 0.5 * r.z;
    colorBuffer.values[ci + 3u] = 1.0;
}

fn emit_tri(base: u32, a: vec4f, b: vec4f, c: vec4f) {
    write_vert(base + 0u, a);
    write_vert(base + 1u, b);
    write_vert(base + 2u, c);
}

fn process_cell(gx: u32, gy: u32, gz: u32, gw: u32, res: u32) {
    let iso = fps.isolevel;

    let sY = res;
    let sZ = res * res;
    let sW = sZ * res;
    let cbase = gx + gy * sY + gz * sZ + gw * sW;

    var mask16 = 0u;
    for (var c = 0u; c < 16u; c++) {
        let off = (c & 1u) + ((c >> 1u) & 1u) * sY
                + ((c >> 2u) & 1u) * sZ + ((c >> 3u) & 1u) * sW;
        if (fieldData[cbase + off] < iso) { mask16 |= 1u << c; }
    }
    if (mask16 == 0u || mask16 == 0xFFFFu) { return; }

    let vmin = vec4f(-1.0);
    let vstep = 2.0 / f32(res - 1u);
    let cellOrigin = vec4f(f32(gx), f32(gy), f32(gz), f32(gw));

    for (var s = 0u; s < 24u; s++) {
        var vals: array<f32, 5>;
        var pos: array<vec4f, 5>;
        var mask = 0u;
        for (var i = 0u; i < 5u; i++) {
            let o = simplexCorners[s][i];
            let val = fieldData[get_idx4(gx + o.x, gy + o.y, gz + o.z, gw + o.w, res)];
            vals[i] = val;
            pos[i] = vmin + vstep * (cellOrigin + vec4f(o));
            if (val < iso) { mask |= (1u << i); }
        }
        if (mask == 0u || mask == 31u) { continue; }

        var inside:  array<u32, 4>;
        var outside: array<u32, 4>;
        var nIn  = 0u;
        var nOut = 0u;
        for (var i = 0u; i < 5u; i++) {
            if (((mask >> i) & 1u) == 1u) { inside[nIn]  = i; nIn  = nIn  + 1u; }
            else                          { outside[nOut] = i; nOut = nOut + 1u; }
        }

        //  TETRAHEDRON: 1vs4
        if (nIn == 1u || nIn == 4u) {
            var lone: u32;
            var maj:  array<u32, 4>;
            if (nIn == 1u) { lone = inside[0];  maj = outside; }
            else           { lone = outside[0]; maj = inside;  }

            var q: array<vec4f, 4>;
            for (var k = 0u; k < 4u; k++) {
                let m = maj[k];
                q[k] = interp(vals[lone], vals[m], pos[lone], pos[m], iso);
            }
            let base = atomicAdd(&counter.count, 12u);
            emit_tri(base,      q[0], q[1], q[2]);
            emit_tri(base + 3u, q[0], q[1], q[3]);
            emit_tri(base + 6u, q[0], q[2], q[3]);
            emit_tri(base + 9u, q[1], q[2], q[3]);
            continue;
        }

        // PRISM 2vs3
        var pair:   array<u32, 2>;
        var triple: array<u32, 3>;
        if (nIn == 2u) {
            pair[0]   = inside[0];  pair[1]   = inside[1];
            triple[0] = outside[0]; triple[1] = outside[1]; triple[2] = outside[2];
        } else {
            pair[0]   = outside[0]; pair[1]   = outside[1];
            triple[0] = inside[0];  triple[1] = inside[1];  triple[2] = inside[2];
        }

        var capA: array<vec4f, 3>;
        var capB: array<vec4f, 3>;
        for (var k = 0u; k < 3u; k++) {
            let t = triple[k];
            capA[k] = interp(vals[pair[0]], vals[t], pos[pair[0]], pos[t], iso);
            capB[k] = interp(vals[pair[1]], vals[t], pos[pair[1]], pos[t], iso);
        }

        let base = atomicAdd(&counter.count, 24u);
        emit_tri(base,       capA[0], capA[1], capA[2]);
        emit_tri(base + 3u,  capB[0], capB[1], capB[2]);
        emit_tri(base + 6u,  capA[0], capA[1], capB[1]);
        emit_tri(base + 9u,  capA[0], capB[1], capB[0]);
        emit_tri(base + 12u, capA[1], capA[2], capB[2]);
        emit_tri(base + 15u, capA[1], capB[2], capB[1]);
        emit_tri(base + 18u, capA[2], capA[0], capB[0]);
        emit_tri(base + 21u, capA[2], capB[0], capB[2]);
    }
}

@compute @workgroup_size(BLOCK, BLOCK, BLOCK)
fn cs_main(@builtin(workgroup_id) wg: vec3u,
           @builtin(local_invocation_id) lid: vec3u) {
    let listIdx = wg.x + wg.y * DISPATCH_STRIDE;
    if (listIdx >= args.activeCount) { return; }

    let res   = ips.resolution;
    let cells = res - 1u;
    let nb    = (cells + BLOCK - 1u) / BLOCK;

    var b = blockList.values[listIdx];
    let bx = b % nb; b = b / nb;
    let by = b % nb; b = b / nb;
    let bz = b % nb;
    let bw = b / nb;

    let gx = bx * BLOCK + lid.x;
    let gy = by * BLOCK + lid.y;
    let gz = bz * BLOCK + lid.z;
    if (gx >= cells || gy >= cells || gz >= cells) { return; }

    for (var wi = 0u; wi < BLOCK; wi++) {
        let gw = bw * BLOCK + wi;
        if (gw >= cells) { break; }
        process_cell(gx, gy, gz, gw, res);
    }
}